import { TextDocument, Position, TextDocumentItem, LogMessageNotification, CompletionItem, Diagnostic, Range } from "vscode-languageserver";
import linq from "linq";
//import sourceShaderLab from "./shaderlab.grammar";

type DocumentCompletionCallback = () => CompletionItem[];
type DocumentDiagnoseCallback = (text: string, range: Range) => Diagnostic[];
type PatternItemDictionary = { [key: string]: (pattern: GrammarPattern) => PatternItem };

class Code
{
    scopes: Scope;
}
class Scope
{
    document: TextDocument;
    startOffset: number = 0;
    endOffset: number = 0;
    scopes: Scope[] = [];
    scopeDeclare: ScopeDeclare;
    constructor(doc: TextDocument, declare: ScopeDeclare)
    {
        this.scopeDeclare = declare;
        this.document = doc;
    }
    get startPosition() { return this.document.positionAt(this.startOffset); }
    get endPosition() { return this.document.positionAt(this.endOffset); }
    get text() { return this.document.getText({ start: this.startPosition, end: this.endPosition }); }
}
class ShaderCode implements Code
{
    scopes: Scope;
    constructor(doc: TextDocument)
    {
        //this.scopes = scopeMatch(sourceShaderLab, doc, 0);
    }
}
class ScopeDeclare
{
    name?: string;
    begin?: RegExp;
    end?: RegExp;
    scopes?: ScopeDeclare[];
    _matchbegin?: RegExpMatchArray;
    _matchEnd?: RegExpExecArray;
    patterns?: PatternDeclare[] = [];
}
class MatchCapturePattern
{
    name?: string;
    match?: RegExp;
    default?: boolean = false;
    captures?: MatchCaptures = new MatchCaptures();
    onCompletion?: DocumentCompletionCallback;
}
class MatchCaptures
{
    [key: string]: PatternDeclare;
}
class PatternDeclare
{
    name?: string;
    match?: RegExp;
    default?: boolean = false;
    //patterns?: PatternDeclare[] = [];
    captures?: MatchCaptures = new MatchCaptures();
    onCompletion?: DocumentCompletionCallback;
    diagnostic?: Diagnostic;
    unmatched?: Diagnostic;
}
function matchInRange(reg: RegExp, doc: TextDocument, start: number, end: number): RegExpExecArray
{
    let subDoc = doc.getText({ start: doc.positionAt(start), end: doc.positionAt(end) });
    return reg.exec(subDoc);
}
function scopeMatch(scopeDeclare: ScopeDeclare, doc: TextDocument, startOffset: number = 0, endOffset: number = doc.getText().length - 1): Scope
{
    let nextStartOffset = startOffset;
    let match: RegExpExecArray = null;
    if (scopeDeclare.begin)
    {
        let subDoc = doc.getText({ start: doc.positionAt(startOffset), end: doc.positionAt(endOffset) });
        match = scopeDeclare.begin.exec(subDoc);
        if (scopeDeclare.begin && !match)
            return;
        if (match)
        {
            nextStartOffset = startOffset + match.index + match[0].length;
        }
    }
    let scope = new Scope(doc, scopeDeclare);
    if (match)
        scope.startOffset = startOffset + match.index;

    let hasSubScope = false;
    do
    {
        hasSubScope = false;

        // To get the headmost sub-scope
        let subScopeList = linq.from(scopeDeclare.scopes)
            .orderBy(scope =>
            {
                scope._matchbegin = matchInRange(scope.begin, doc, nextStartOffset, endOffset);
                if (scope._matchbegin)
                    return scope._matchbegin.index;
                return Number.MAX_SAFE_INTEGER;
            }).toArray();

        // Check if sub-scope is out of current scope
        let endMatch = null;
        if (scopeDeclare.end)
        {
            endMatch = matchInRange(scopeDeclare.end, doc, nextStartOffset, endOffset);
            if (!endMatch)
                return null;
        }

        for (let i = 0; i < subScopeList.length; i++)
        {
            // Remove the sub-scope which is out of current scope
            if (!subScopeList[i]._matchbegin)
                continue;
            if (endMatch && endMatch.index <= subScopeList[i]._matchbegin.index)
                break;

            let subScope = scopeMatch(subScopeList[i], doc, nextStartOffset, endOffset);
            if (subScope)
            {
                scope.scopes.push(subScope);
                nextStartOffset = subScope.endOffset + 1;
                hasSubScope = true;
                break;
            }
        }
    }
    while (hasSubScope);

    if (!scopeDeclare.end)
    {
        scope.endOffset = endOffset;
    }
    else
    {
        match = matchInRange(scopeDeclare.end, doc, nextStartOffset, endOffset);
        if (!match)
            return null;
        endOffset = nextStartOffset + match.index + match[0].length;
        scope.endOffset = endOffset;
    }
    return scope;

}

function diagnostic(pattern: PatternDeclare, doc: TextDocument, startOffset: number, endOffset: number): Diagnostic[]
{
    let diagnostics: Diagnostic[] = [];
    if (pattern.match)
    {
        let match = matchInRange(pattern.match, doc, startOffset, endOffset);
        if (pattern.captures)
        {
            for (let i = 0; i < match.length; i++)
            {
                if (!pattern.captures[i])
                    continue;

                // Handle unmatch diagnostic
                if (match[i] === undefined && pattern.captures[i].unmatched)
                {
                    let diag = pattern.captures[i].unmatched;
                    diag.range = { start: doc.positionAt(startOffset + match.index), end: doc.positionAt(startOffset + match.index + match[0].length) };
                    diagnostics.push(diag);
                }


            }
        }
    }
    return diagnostics;
}

enum MatchResult
{
    NotMatched = 0,
    Matched = 1,
    Skip = 2,
}
abstract class PatternItem
{
    name: string = "pattern";
    parent?: NestedPattern;
    ignorable: boolean = false;
    multi: boolean = false;
    pattern: GrammarPattern;
    abstract isMatch(char: string, index: number, text: string): boolean;
    moveNext(): PatternItem
    {
        if (this.parent)
            return this.parent.moveNext();
        return null;
    }
    abstract reset(): void;
    constructor(pattern: GrammarPattern, ignorable=false)
    {
        this.pattern = pattern;
        this.ignorable = ignorable;
    }
    toString():string
    {
        return this.ignorable ? `[${this.name}]` : `<${this.name}>`;
    }
}

class TextPattern extends PatternItem
{
    text: string;
    currentIdx: number = 0;
    isMatch(char: string)
    {
        return char === this.text[this.currentIdx];
    }
    moveNext(): PatternItem
    {
        if (++this.currentIdx < this.text.length)
            return this;
        return super.moveNext();
    }
    reset()
    {
        this.currentIdx = 0;
    }
    constructor(pattern: GrammarPattern, text: string, ignorable=false)
    {
        super(pattern, ignorable);
        this.text = text;
        this.name = text;
    }
}
class EmptyPattern extends PatternItem
{
    name = "space";
    isMatch(char: string)
    {
        /*
        if (char === " " || char === "\r" || char === "\n")
            return 1;
        if (this.ignorable)
            return MatchResult.Skip;
        return 0;
        */
        return char === " " || char === "\r" || char === "\n";
    }
    reset() { }
    constructor(pattern: GrammarPattern, ignorable: boolean = false)
    {
        super(pattern, ignorable);
    }
}
class NestedPattern extends PatternItem
{
    name = "nest";
    subPatterns: PatternItem[] = [];
    currentIdx: number = 0;
    get count() { return this.subPatterns.length; }
    isMatch(char: string, index: number, text: string)
    {
        return this.subPatterns[this.currentIdx].isMatch(char, index, text);
    }
    getChildren(idx: number = 0): PatternItem
    {
        if (this.subPatterns[idx])
        {
            if (this.subPatterns[idx] instanceof NestedPattern)
                return (<NestedPattern>this.subPatterns[idx]).getChildren(0);
            else
                return this.subPatterns[idx];
        }
        return null;
    }
    moveNext(): PatternItem
    {
        if (++this.currentIdx < this.subPatterns.length)
            return this.getChildren(this.currentIdx);
        else if (this.parent)
            return this.parent.moveNext();
        return null;
    }
    reset()
    {
        this.subPatterns.forEach(pattern => pattern.reset());
        this.currentIdx = 0;
    }
    addSubPattern(patternItem: PatternItem)
    {
        this.subPatterns.push(patternItem);
    }
    toString()
    {
        let str = super.toString() + "\r\n"+ this.subPatterns.map(pattern => pattern.toString()).join("\r\n").split(/\r\n/g).map(str => "\t" + str).join("\r\n");
        return str;
    }

}
class StringPattern extends PatternItem
{
    name = "string";
    begin: boolean = false;
    slash: boolean = false;
    end: boolean = false;
    isMatch(char: string)
    {
        if (this.end)
            return false;
        if (char === "\\")
        {
            this.slash = true;
            return this.begin;
        }
        if (this.slash)
        {
            this.slash = false;
            return this.begin;
        }
        if (this.begin)
        {
            if (char === "\"")
            {
                this.end = true;
                return true;
            }
            return true;
        }
        else if (char === "\"")
        {
            this.begin = true;
        }
        else
            return false;
    }
    reset(): void
    {
        this.begin = false;
        this.slash = false;
        this.end = false;
    }
    toString = () => this.ignorable ? "[string]" : "<string>";
}
class NumberPattern extends PatternItem
{
    name = "number";
    isMatch(char: string, index: number, text: string)
    {
        if (text.substr(index).search(/[+-]?[0-9]?(\.[0-9]+)?/) === 0)
        {
            return true;
        }
        return false;
    }
    reset(): void
    {
        throw new Error("Method not implemented.");
    }


}
class IdentifierPattern extends PatternItem
{
    name = "identifier";
    isMatch(char: string): boolean
    {
        throw new Error("Method not implemented.");
    }
    reset(): void
    {
        throw new Error("Method not implemented.");
    }


}
class PatternScope extends NestedPattern
{
    name = "scope";
    scope: GrammarScope;
    isMatch(char: string, index: number, text: string): boolean
    {
        throw new Error("Method not implemented.");
    }
    reset(): void
    {
        throw new Error("Method not implemented.");
    }

    constructor(pattern: GrammarPattern, scope: GrammarScope)
    {
        super(pattern, false);
        this.scope = scope;
    }
}
class Grammar extends NestedPattern
{
    name = "grammar";
    grammar: GrammarDeclare;
    constructor(grammar: GrammarDeclare)
    {
        super(null, false);
    }
}
class PatternDictionary
{
    [key: string]: GrammarPattern;
}
class PatternScopeDictionary
{
    [key: string]: GrammarScope;
}
class GrammarScope
{
    begin: string;
    end: string;
    patterns?: GrammarPattern[];
    scopes?: GrammarScope[];
    name?: string;
    ignore?: GrammarPattern;
    pairMatch?: string[][];
}
class GrammarPattern
{
    static String: GrammarPattern = { patterns: ["\"[string]\""], name: "String" };
    patterns: string[];
    caseInsensitive?: boolean = false;
    dictionary?: PatternDictionary;
    name?: string;
    scopes?: PatternScopeDictionary;
    _compiledPattern?: NestedPattern[];
}
class GrammarDeclare
{
    patterns?: GrammarPattern[];
    name?: string;
    ignore?: GrammarPattern;
    stringDelimiter?: string[];
    pairMatch?: string[][];
}
function analyseBracketItem(item: string, pattern: GrammarPattern): PatternItem
{
    const buildInPattern: PatternItemDictionary = {
        "string": (pt: GrammarPattern) => new StringPattern(pt),
        "number": (pt: GrammarPattern) => new NumberPattern(pt),
        "identifier": (pt: GrammarPattern) => new IdentifierPattern(pt),
        " ": (pt: GrammarPattern) => new EmptyPattern(pt),
    }
    if (item[0] === "<" && item[item.length - 1] === ">")
    {
        let subPattern: PatternItem;
        let name = item.substr(1, item.length - 2);
        if (buildInPattern[name])
            subPattern = buildInPattern[name](pattern);
        else if (pattern.dictionary && pattern.dictionary[name])
            subPattern = compilePattern(pattern.dictionary[name]);
        else
            subPattern = new IdentifierPattern(pattern);
        subPattern.ignorable = false;
        return subPattern;
    }
    else if (item[0] === "[" && item[item.length - 1] === "]")
    {
        item = item.substr(1, item.length - 2);
        let multi = false;
        if (item.endsWith("..."))
        {
            multi = true;
            item = item.substr(0, item.length - 3);
        }
        let subPattern = analysePatternItem(item, pattern);
        subPattern.ignorable = true;
        subPattern.multi = multi;
        return subPattern;
    }
    else if (item[0] === "{" && item[item.length - 1] === "}")
    {
        let name = item.substr(1, item.length - 2);
        let scope = pattern.scopes ? pattern.scopes[name] : null;
        if (!scope)
            throw new Error("Pattern undefined.");
        return compileScope(scope, pattern);
    }
    throw new Error("Syntax Error.");
}
function analysePatternItem(item: string, pattern: GrammarPattern): PatternItem
{
    const bracketStart = ["<", "[", "{"];
    const bracketEnd = [">", "]", "}"];
    const spaceChars = [" "];
    const isBracketStart = (chr: string): boolean => bracketStart.indexOf(chr) >= 0;
    const isBracketEnd = (chr: string): boolean => bracketEnd.indexOf(chr) >= 0;
    const isSpace = (chr: string): boolean => spaceChars.indexOf(chr) >= 0;
    const buildInPattern: any = {
        "string": (pt: GrammarPattern) => new StringPattern(pt),
        "number": (pt: GrammarPattern) => new NumberPattern(pt),
        "identifier": (pt: GrammarPattern) => new IdentifierPattern(pt),
        " ": (pt: GrammarPattern) => new EmptyPattern(pt),
    }
    enum State { CollectWords, MatchBracket };

    let patternItem: NestedPattern = new NestedPattern(pattern, false);
    let state:State = State.CollectWords;
    let bracketDepth = 0;
    let startBracket = "";
    let words = "";

    for (let i = 0; i < item.length; i++)
    {
        if (item[i] === "\\")
        {
            words += item[++i];
            continue;
        }
        if (state === State.CollectWords)
        {
            if (isBracketStart(item[i]))
            {
                if (words !== "")
                    patternItem.addSubPattern(new TextPattern(pattern, words));
                words = item[i];
                state = State.MatchBracket;
                bracketDepth++;
                continue;
            }
            else if (isSpace(item[i]))
            {
                if (words !== "")
                    patternItem.addSubPattern(new TextPattern(pattern, words));
                words = "";
                continue;
            }
            else if (isBracketEnd(item[i]))
                throw new Error("Syntax error.");
            else
            {
                words += item[i];
                continue;
            }
        }
        else if (state === State.MatchBracket)
        {
            words += item[i];
            if (isBracketStart(item[i]))
                bracketDepth++;
            else if (isBracketEnd(item[i]))
            {
                bracketDepth--;
                if (bracketDepth === 0)
                {
                    patternItem.addSubPattern(analyseBracketItem(words, pattern));
                    words = "";
                    state = State.CollectWords;
                    continue;
                }
            }
        }
    }

    if (state === State.CollectWords && words !== "")
        patternItem.addSubPattern(new TextPattern(pattern, words));
    else if (state === State.MatchBracket && bracketDepth > 0)
        throw new Error("Syntax error.");
    
    if (patternItem.subPatterns.length === 0)
        throw new Error("No pattern.");
    else if (patternItem.subPatterns.length === 1)
    {
        patternItem.subPatterns[0].ignorable = patternItem.ignorable;
        return patternItem.subPatterns[0];
    }
    return patternItem;
}
function compilePattern(pattern: GrammarPattern): PatternItem
{
    if (pattern === GrammarPattern.String)
        return new StringPattern(pattern);
    let patternList: NestedPattern = new NestedPattern(pattern, true);
    pattern.patterns.forEach(pt =>
    {
        let subPattern = analysePatternItem(pt, pattern);
        subPattern.ignorable = true;
        patternList.addSubPattern(subPattern);
    });
    if (patternList.count === 0)
        throw new Error("No pattern.");
    if (patternList.count === 1)
    {
        patternList.subPatterns[0].ignorable = true;
        return patternList.subPatterns[0];
    }
    return patternList;
}
function compileScope(scope: GrammarScope, pattern:GrammarPattern): PatternScope
{
    let patternList = new PatternScope(pattern, scope);
    patternList.addSubPattern(new TextPattern(pattern, scope.begin, false));
    scope.patterns.forEach(pattern => patternList.addSubPattern(compilePattern(pattern)));
    patternList.addSubPattern(new TextPattern(pattern, scope.end, false));
    patternList.name = scope.name ? scope.name : "Scope";
    return patternList;
}
function compileGrammar(grammarDeclare: GrammarDeclare):Grammar
{
    let grammar = new Grammar(grammarDeclare);
    grammarDeclare.patterns.forEach(pattern => grammar.addSubPattern(compilePattern(pattern)));
    return grammar;
}

export { ShaderCode, Scope, ScopeDeclare, GrammarDeclare, GrammarPattern, compileGrammar };