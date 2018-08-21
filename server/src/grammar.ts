import { TextDocument, Position, TextDocumentItem, LogMessageNotification, CompletionItem, Diagnostic, Range } from "vscode-languageserver";
import linq from "linq";
//import sourceShaderLab from "./shaderlab.grammar";

type DocumentCompletionCallback = (match:MatchResult) => CompletionItem[];
type PatternMatchedCallback = (patternMatch: PatternMatchResult) => void;
type ScopeMatchedCallback = (scopeMatch: ScopeMatchResult) => void;
type DocumentDiagnoseCallback = (unMatched: UnMatchedText) => Diagnostic[];
type PatternItemDictionary = { [key: string]: (pattern: GrammarPattern) => PatternItem };

abstract class PatternItem
{
    name: string = "pattern";
    parent?: OrderedPatternSet;
    ignorable: boolean = false;
    multi: boolean = false;
    pattern: GrammarPattern;
    abstract match(doc: TextDocument, startOffset: number): MatchResult;
    constructor(pattern: GrammarPattern, ignorable = false)
    {
        this.pattern = pattern;
        this.ignorable = ignorable;
    }
    toString(): string
    {
        return this.ignorable ? `[${this.name}]` : `<${this.name}>`;
    }
}
class NamedPattern extends PatternItem
{
    patternItem: PatternItem;
    constructor(pattern: GrammarPattern, name: string, patternItem: PatternItem)
    {
        super(pattern, patternItem.ignorable);
        this.name = name;
        this.patternItem = patternItem;
    }
    match(doc: TextDocument, startOffset: number): MatchResult
    {
        let match = this.patternItem.match(doc, startOffset);
        match.patternName = this.name;
        //match.pattern = this.pattern;
        return match;
    }

}
class EmptyPattern extends PatternItem
{
    name = "space";
    constructor(pattern: GrammarPattern, ignorable: boolean = false)
    {
        super(pattern, ignorable);
    }
    static skipEmpty(doc: TextDocument, startOffset: number, crossLine = false): RegExpExecArray
    {
        const reg = crossLine ?
            /(((?:\s|\/\*(?!\/).*?\*\/)*)(\/\/.*[\r]?[\n]?)?)*/
            :
            /((?:[ \t]|\/\*(?!\/).*?\*\/)*)?/;
        const text = doc.getText().substr(startOffset);
        let match = reg.exec(text);
        if (match.index > 0)
            return null;
        return match;
    }
    match(doc: TextDocument, startOffset: number): MatchResult
    {
        let empty = EmptyPattern.skipEmpty(doc, startOffset, this.pattern.crossLine);
        let match = new MatchResult(doc, this);
        match.startOffset = startOffset;
        if (empty && empty[0].length > 0)
        {
            match.endOffset = startOffset + empty[0].length;
            match.matched = true;
        }
        else
        {
            match.endOffset = startOffset;
            match.matched = false;
        }
        return match;
    }
}
class RegExpPattern extends PatternItem
{
    name = "regExp";
    regExp: RegExp;
    constructor(pattern: GrammarPattern, reg: RegExp, ignorable: boolean = false)
    {
        super(pattern, ignorable);
        this.regExp = reg;
    }
    match(doc: TextDocument, startOffset: number): MatchResult
    {
        let skip = EmptyPattern.skipEmpty(doc, startOffset, this.pattern.crossLine);
        if (skip)
            startOffset += skip[0].length;
        let text = doc.getText().substr(startOffset);
        let regMatch = this.regExp.exec(text);
        let match = new MatchResult(doc, this);
        match.startOffset = startOffset;
        if (!regMatch || regMatch.index !== 0)
        {
            match.endOffset = startOffset;
            match.matched = false;
        }
        else
        {
            match.endOffset = startOffset + regMatch[0].length;
            match.matched = true;
        }
        return match;
    }
}
class TextPattern extends RegExpPattern
{
    text: string;
    currentIdx: number = 0;
    get ignoreCase() { return this.regExp.ignoreCase; }
    constructor(pattern: GrammarPattern, text: string, ignorable = false, ignoreCase = false)
    {
        super(pattern, new RegExp(text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'), ignoreCase ? "i" : ""), ignorable);
        this.text = text;
        this.name = text;
    }
}
class StringPattern extends RegExpPattern
{
    name = "string";
    begin: boolean = false;
    slash: boolean = false;
    end: boolean = false;
    constructor(pattern: GrammarPattern, ignorable = false)
    {
        super(pattern, /"([^\\"]|\\\S|\\")*"/, ignorable);
    }
    toString = () => this.ignorable ? "[string]" : "<string>";
}
class NumberPattern extends RegExpPattern
{
    name = "number";
    constructor(pattern: GrammarPattern, ignorable = false)
    {
        super(pattern, /[+-]?[0-9]+\.?[0-9]*/, ignorable);
    }
}
class IdentifierPattern extends RegExpPattern
{
    name = "identifier";
    constructor(pattern: GrammarPattern, ignorable = false)
    {
        super(pattern, /[_a-zA-Z][_a-zA-Z0-9]*/, ignorable);
    }
}


class OrderedPatternSet extends PatternItem
{
    name = "nest";
    subPatterns: PatternItem[] = [];
    currentIdx: number = 0;
    get count() { return this.subPatterns.length; }
    addSubPattern(patternItem: PatternItem)
    {
        this.subPatterns.push(patternItem);
    }
    toString()
    {
        let str = super.toString() + "\r\n" + this.subPatterns.map(pattern => pattern.toString()).join("\r\n").split(/\r\n/g).map(str => "\t" + str).join("\r\n");
        return str;
    }
    match(doc: TextDocument, startOffset: number): MatchResult
    {
        let match = new MatchResult(doc, this);
        match.startOffset = startOffset;
        try 
        {
            for (let i = 0; i < this.subPatterns.length; i++)
            {
                let subMatch = this.subPatterns[i].match(doc, startOffset);
                if (!subMatch.matched)
                {
                    if (this.subPatterns[i].ignorable)
                        continue;
                    match.addChildren(subMatch);
                    match.endOffset = subMatch.endOffset;
                    match.matched = false;
                    return match;
                }
                match.addChildren(subMatch);
                startOffset = subMatch.endOffset;
                if (this.subPatterns[i].multi)
                    i--;
            }
            if (match.children.length === 0)
            {
                match.endOffset = match.startOffset + 1;
                match.matched = false;
            }
            else
            {
                match.endOffset = match.children[match.children.length - 1].endOffset;
                match.startOffset = match.children[0].startOffset;
                match.matched = true;
            }
        }
        catch (ex)
        {
            console.error(ex);
        }
        return match;
    }
}

/**
 * Set of PatternItem created by compiled GrammarPattern
 */
class OptionalPatternSet extends OrderedPatternSet
{
    name = "optional";

    match(doc: TextDocument, startOffset: number): MatchResult
    {
        let match = new PatternMatchResult(doc, this);
        match.startOffset = startOffset;
        let failedMatches: MatchResult[] = [];
        for (let i = 0; i < this.subPatterns.length; i++)
        {
            let subMatch = this.subPatterns[i].match(doc, startOffset);
            if (!subMatch.matched)
            {
                failedMatches.push(subMatch);
                continue;
            }
            match.addChildren(subMatch);
            break;
        }
        if (match.children.length === 0)
        {
            match.endOffset = match.startOffset + 1;
            match.matched = false;
            let unMatched = new UnMatchedPattern(doc, this, failedMatches);
            unMatched.startOffset = startOffset;
            unMatched.endOffset = linq.from(failedMatches).max(match => match.endOffset);
            return unMatched;
        }
        else
        {
            match.endOffset = match.children[match.children.length - 1].endOffset;
            match.startOffset = match.children[0].startOffset;
            match.matched = true;
        }
        return match;
    }
}
class ScopePattern extends OrderedPatternSet
{
    name = "scope";
    scope: GrammarScope;

    constructor(pattern: GrammarPattern, scope: GrammarScope)
    {
        super(pattern, false);
        this.scope = scope;
    }
    match(doc: TextDocument, startOffset: number): MatchResult
    {
        function cleanSpace()
        {
            let skip = EmptyPattern.skipEmpty(doc, startOffset, true);
            if (skip)
                startOffset += skip[0].length;
        }
        let match = new ScopeMatchResult(doc, this);
        match.startOffset = startOffset;
        try 
        {
            cleanSpace();
            // Match first pattern
            let subMatch = this.subPatterns[0].match(doc, startOffset);
            match.beginMatch = subMatch;
            match.endOffset = startOffset = subMatch.endOffset;
            if (!subMatch.matched)
            {
                match.matched = false;
                return match;
            }
            else
                cleanSpace();

            let hasMatched = false;
            let failedMatches: MatchResult[] = [];
            for (let i = 1; i < this.subPatterns.length; i++)
            {
                let subMatch = this.subPatterns[i].match(doc, startOffset);
                if (!subMatch.matched)
                {
                    failedMatches.push(subMatch);
                    if (i < this.subPatterns.length - 1)
                        continue;
                }
                else
                {
                    failedMatches = [];
                    if (i === this.subPatterns.length - 1)
                    {
                        match.endMatch = subMatch;
                        break;
                    }
                    match.addChildren(subMatch);
                    match.endOffset = startOffset = subMatch.endOffset;
                    hasMatched = true;

                    cleanSpace();
                }

                // Skip a line and continue matching
                if (!hasMatched)
                {
                    let unMatched = new UnMatchedText(doc, this.scope, failedMatches);
                    failedMatches = [];
                    unMatched.startOffset = startOffset;
                    match.addChildren(unMatched);

                    let pos = doc.positionAt(startOffset);
                    pos.line++;
                    pos.character = 0;
                    startOffset = doc.offsetAt(pos);
                    unMatched.endOffset = startOffset - 1;
                    // Chceck if reach end
                    let pos2 = doc.positionAt(startOffset);
                    if (pos2.line !== pos.line)
                    {
                        match.matched = false;
                        return match;
                    }
                    cleanSpace();
                }
                i = 0;
                hasMatched = false;
            }
            if (!match.endMatch)
            {
                match.startOffset = match.beginMatch.startOffset;
                match.matched = false;
                return match;
            }
            else
            {
                match.startOffset = match.beginMatch.startOffset;
                match.endOffset = match.endMatch.endOffset;
                match.matched = true;
            }
        }
        catch (ex)
        {
            console.error(ex);
        }
        return match;
    }
}
class Grammar extends ScopePattern
{
    name = "grammar";
    grammar: LanguageGrammar;
    constructor(grammar: LanguageGrammar)
    {
        super(null, null);
        this.grammar = grammar;
    }
    match(doc: TextDocument, startOffset: number = 0): GrammarMatchResult
    {
        function cleanSpace()
        {
            let skip = EmptyPattern.skipEmpty(doc, startOffset, true);
            if (skip)
                startOffset += skip[0].length;
        }
        let match = new GrammarMatchResult(doc, this);
        let end = doc.getText().length;
        match.startOffset = 0;
        while (startOffset != end)
        {
            let hasMatched = false;
            let failedMathes: MatchResult[] = [];
            for (let i = 0; i < this.subPatterns.length; i++)
            {
                let subMatch = this.subPatterns[i].match(doc, startOffset);
                if (!subMatch.matched)
                {
                    failedMathes.push(subMatch);
                    continue;
                }
                failedMathes = [];
                hasMatched = true;
                match.addChildren(subMatch);
                match.endOffset = startOffset = subMatch.endOffset;
                cleanSpace();
                break;
            }

            if (!hasMatched)
            {
                let unMatched = new UnMatchedText(doc, this.scope, failedMathes);
                failedMathes = [];
                unMatched.startOffset = startOffset;
                match.addChildren(unMatched);

                let pos = doc.positionAt(startOffset);
                pos.line++;
                pos.character = 0;
                startOffset = doc.offsetAt(pos);
                unMatched.endOffset = startOffset - 1;
                // Chceck if reach end
                let pos2 = doc.positionAt(startOffset);
                if (pos2.line !== pos.line)
                {
                    break;
                }
                cleanSpace();
            }
        }
        match.endOffset = end;
        match.matched = true;

        match.processSubMatches();

        return match;
    }
}
class MatchResult
{
    document: TextDocument;
    patternItem: PatternItem;
    patternName: string = null;
    startOffset: number;
    endOffset: number;
    matched: boolean = true;
    scope: GrammarScope;
    state: any = null;
    parent: MatchResult = null;
    children: MatchResult[] = [];
    matchedScope: ScopeMatchResult;
    matchedPattern: PatternMatchResult;
    _unmatchedPattern: UnMatchedPattern;
    private _pattern: GrammarPattern = null;
    get start() { return this.document.positionAt(this.startOffset); }
    get end() { return this.document.positionAt(this.endOffset); }
    get length() { return this.endOffset - this.startOffset; }
    get text() { return this.document.getText({ start: this.start, end: this.end }); }
    get pattern() { return this._pattern ? this._pattern : this.patternItem.pattern; }
    set pattern(value) { this._pattern = value; }
    constructor(doc: TextDocument, patternItem: PatternItem)
    {
        this.document = doc;
        this.patternItem = patternItem;
    }
    toString(): string
    {
        return this.text;
    }
    addChildren(match :MatchResult)
    {
        match.parent = this;
        this.children.push(match);
    }
    locateMatchAtPosition(pos: Position): MatchResult
    {
        if (this.children.length <= 0)
            return this;
        let offset = this.document.offsetAt(pos);
        let child = linq.from(this.children).where(child => child.startOffset <= offset && offset <= child.endOffset).firstOrDefault();
        if (!child)
            return this;
        return child.locateMatchAtPosition(pos);
    }
}
class PatternMatchResult extends MatchResult
{
    private matchesDict: Map<string, MatchResult[]> = new Map<string, MatchResult[]>();
    private _matchesList: MatchResult[] = null;
    private get allMathches(): MatchResult[]
    {
        if (this.children.length <= 0)
            return [];
        if (!this._matchesList)
        {
            let list = [this.children[0]];
            for (let i = 0; i < list.length; i++)
            {
                if (list[i] instanceof PatternMatchResult || list[i] instanceof ScopeMatchResult || list[i] instanceof UnMatchedText)
                    continue;
                if (!list[i])
                    console.log(list[i]);
                list = list.concat(list[i].children);
                
            }
            this._matchesList = list;
        }
        return this._matchesList;
    }
    getMatch(name: string): MatchResult[]
    {
        if (this.children.length <= 0)
            return null;
        /*if (this.matchesDict.get(name))
            return this.matchesDict.get(name);*/
        return linq.from(this.allMathches).where(match => match.patternName === name).toArray();

    }
    processSubMatches()
    {
        if (this.pattern.onMatched)
            this.pattern.onMatched(this);

        this.allMathches.forEach(match =>
        {
            if (match != this)
            {
                match.matchedScope = this.matchedScope;
                match.matchedPattern = this;
            }
            if (match instanceof ScopeMatchResult)
            {
                match.processSubMatches();
            }
            else if (match instanceof PatternMatchResult)
            {
                match.processSubMatches();
            }
            else if (match instanceof UnMatchedText)
            {
                match.processSubMatches();
            }
        });
    }
}
class ScopeMatchResult extends MatchResult
{
    beginMatch: MatchResult;
    endMatch: MatchResult;
    constructor(doc: TextDocument, scope: ScopePattern)
    {
        super(doc, scope);
        this.scope = scope.scope;
    }
    processSubMatches()
    {
        if (this.scope && this.scope.onMatched)
            this.scope.onMatched(this);

        let matchList: MatchResult[] = [this];
        for (let i = 0; i < matchList.length; i++)
        {
            let subMatch = matchList[i];
            if (i > 0)
            {
                subMatch.matchedScope = this;
                subMatch.matchedPattern = this.matchedPattern;
                if (subMatch instanceof ScopeMatchResult)
                {
                    subMatch.processSubMatches();
                    continue;
                }
                else if (subMatch instanceof PatternMatchResult)
                {
                    subMatch.processSubMatches();
                    continue;
                }
                else if (subMatch instanceof UnMatchedText)
                {
                    subMatch.processSubMatches();
                    continue;
                }
            }
            matchList = matchList.concat(subMatch.children);

        }
    }
}
class GrammarMatchResult extends ScopeMatchResult
{
    requestCompletion(pos: Position): CompletionItem[]
    {
        let completions: CompletionItem[] = [];
        let match = this.locateMatchAtPosition(pos);
        if (match instanceof UnMatchedText)
        {
            completions = completions.concat(match.requestCompletion(pos));
        }
        for (let matchP = match; matchP != null; matchP = matchP.parent)
        {
            if (!matchP.patternName)
                continue;
            if (matchP.matchedPattern && matchP.matchedPattern.pattern.onCompletion)
            {
                let comps = matchP.matchedPattern.pattern.onCompletion(matchP);
                completions = completions.concat(comps);
            }
            if (matchP.matchedScope && matchP.matchedScope.scope.onCompletion)
            {
                let comps = matchP.matchedScope.scope.onCompletion(matchP);
                completions = completions.concat(comps);
            }
        }
        // Remove same 
        completions = linq.from(completions).orderBy(item => item.label).toArray();
        let selectedCompletions: CompletionItem[] = [];
        for (let i = 0; i < completions.length; i++)
        {
            if (!completions[i])
                continue;
            else if (selectedCompletions.length === 0)
                selectedCompletions.push(completions[i]);
            if (completions[i].label != selectedCompletions[selectedCompletions.length - 1].label)
                selectedCompletions.push(completions[i]);
        }
        return completions;
    }
}
class UnMatchedText extends MatchResult
{
    allMatches: MatchResult[];
    matched = false;
    protected _matchesList: MatchResult[] = null;
    protected get allSubMatches(): MatchResult[]
    {
        if (this.allMatches.length <= 0)
            return [];
        if (!this._matchesList)
        {
            let list = this.allMatches;
            for (let i = 0; i < list.length; i++)
            {
                if (list[i] instanceof PatternMatchResult || list[i] instanceof ScopeMatchResult || list[i] instanceof UnMatchedText)
                    continue;
                list = list.concat(list[i].children);
            }
            this._matchesList = list;
        }
        return this._matchesList;
    }
    constructor(doc: TextDocument, scope: GrammarScope, matches: MatchResult[])
    {
        super(doc, null);
        this.scope = scope;
        this.allMatches = matches;
    }
    processSubMatches()
    {
        this.allMatches.forEach(match => match.parent = this);
        this.allSubMatches.forEach(match =>
        {
            match.matchedPattern = this.matchedPattern;
            match.matchedScope = this.matchedScope;
            if (match instanceof PatternMatchResult || match instanceof ScopeMatchResult || match instanceof UnMatchedText)
            {
                match.processSubMatches();
            }
        });
        //console.log(this.text);
    }
    locateAllMatchesAtPosition(pos: Position): MatchResult[]
    {
        return this.children.map(match => match.locateMatchAtPosition(pos));
    }
    requestCompletion(pos: Position): CompletionItem[]
    {
        let completions: CompletionItem[] = [];
        this.allMatches.forEach(match =>
        {
            let endMatch = match.locateMatchAtPosition(pos);
            if (endMatch instanceof UnMatchedText)
            {
                completions = completions.concat(endMatch.requestCompletion(pos));
            }
            for (let matchP = endMatch; matchP != this; matchP = matchP.parent)
            {
                if (!matchP.patternName)
                    continue;
                if (matchP._unmatchedPattern && matchP._unmatchedPattern.pattern.onCompletion)
                {
                    let comps = matchP._unmatchedPattern.pattern.onCompletion(matchP);
                    completions = completions.concat(comps);
                }
                else
                {
                    if (matchP.matchedPattern && matchP.matchedPattern.pattern.onCompletion)
                    {
                        let comps = matchP.matchedPattern.pattern.onCompletion(matchP);
                        completions = completions.concat(comps);
                    }
                    if (matchP.matchedScope && matchP.matchedScope.scope.onCompletion)
                    {
                        let comps = matchP.matchedScope.scope.onCompletion(matchP);
                        completions = completions.concat(comps);
                    }
                }

            }
        });
        return completions;
    }
    addChildren(match: MatchResult)
    {
        match.parent = this;
        this.allMatches.push(match);
    }
}
class UnMatchedPattern extends UnMatchedText
{
    constructor(doc: TextDocument, patternItem: PatternItem, matches: MatchResult[])
    {
        super(doc, patternItem.pattern._scope, matches);
        this.patternItem = patternItem;
    }
    processSubMatches()
    {
        this.allMatches.forEach(match => match.parent = this);
        this.allSubMatches.forEach(match =>
        {
            match._unmatchedPattern = this;
            match.matchedPattern = this.matchedPattern;
            match.matchedScope = this.matchedScope;
            if (match instanceof PatternMatchResult || match instanceof ScopeMatchResult || match instanceof UnMatchedText)
            {
                match.processSubMatches();
            }
        });
        //console.log(this.text);
    }
}
class PatternDictionary
{
    [key: string]: GrammarPattern;
}
class ScopeDictionary
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
    onMatched?: ScopeMatchedCallback;
    onCompletion?: DocumentCompletionCallback;
    _compiledPattern?: ScopePattern;
    _grammar?: LanguageGrammar
}
class GrammarPattern
{
    static String: GrammarPattern = { patterns: ["<string>"], name: "String" };
    static Number: GrammarPattern = { patterns: ['<number>'], name: "Number" };
    static Identifier: GrammarPattern = { patterns: ['<identifier>'], name: "Identifier" };
    patterns: string[];
    caseInsensitive?: boolean = false;
    dictionary?: PatternDictionary;
    keepSpace?: boolean = false;
    name?: string;
    id?: string;
    crossLine?: boolean = false;
    scopes?: ScopeDictionary;
    recursive?: boolean = false;

    onMatched?: PatternMatchedCallback;
    onDiagnostic?: DocumentDiagnoseCallback;
    onCompletion?: DocumentCompletionCallback;
    _parent?: GrammarPattern;
    _nameInParent?: string;
    _scope?: GrammarScope;
    _compiledPattern?: PatternItem;
    _grammar?: LanguageGrammar;
    _compiling?: boolean = false;
}
class LanguageGrammar
{
    patterns?: GrammarPattern[];
    name?: string;
    ignore?: GrammarPattern;
    stringDelimiter?: string[];
    pairMatch?: string[][];
    patternRepository?: PatternDictionary;
    scopeRepository?: ScopeDictionary
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
        {
            pattern.dictionary[name]._grammar = pattern._grammar;
            subPattern = compilePattern(pattern.dictionary[name]);
            subPattern
        }
        else if (pattern._grammar.patternRepository && pattern._grammar.patternRepository[name])
        {
            pattern._grammar.patternRepository[name]._grammar = pattern._grammar;
            subPattern = compilePattern(pattern._grammar.patternRepository[name]);
        }
        else
            subPattern = new IdentifierPattern(pattern);
        subPattern.ignorable = false;
        return new NamedPattern(pattern, name, subPattern);
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
        let scope: GrammarScope;
        if (pattern.scopes && pattern.scopes[name])
            scope = pattern.scopes[name];
        else if (pattern._grammar.scopeRepository && pattern._grammar.scopeRepository[name])
            scope = pattern._grammar.scopeRepository[name];

        if (!scope)
            throw new Error("Pattern undefined.");
        scope._grammar = pattern._grammar;
        return compileScope(scope, pattern);
    }
    else if (item.startsWith("/") && item.endsWith("/"))
    {
        let reg = item.substr(1, item.length - 2);
        let subPattern = new RegExpPattern(pattern, new RegExp(reg, pattern.caseInsensitive ? "i" : ""), false);
        subPattern.name = reg;
        return subPattern;
    }
    throw new Error("Syntax Error.");
}
function analysePatternItem(item: string, pattern: GrammarPattern): PatternItem
{
    const bracketStart = ["<", "[", "{", "/"];
    const bracketEnd = [">", "]", "}", "/"];
    const spaceChars = [" "];
    const isBracketStart = (chr: string): boolean => bracketStart.indexOf(chr) >= 0;
    const isBracketEnd = (chr: string): boolean => bracketEnd.indexOf(chr) >= 0;
    const isSpace = (chr: string): boolean => spaceChars.indexOf(chr) >= 0;
    enum State { CollectWords, MatchBracket };

    let patternItem: OrderedPatternSet = new OrderedPatternSet(pattern, false);
    let state: State = State.CollectWords;
    let bracketDepth = 0;
    let startBracket = "";
    let words = "";

    for (let i = 0; i < item.length; i++)
    {
        if (state === State.CollectWords)
        {
            if (item[i] === "\\")
            {
                words += item[++i];
                continue;
            }
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
                if (pattern.keepSpace)
                    patternItem.addSubPattern(new EmptyPattern(pattern, false));
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
            if (item[i] === "\\")
            {
                words += (item[i] + item[++i]);
                continue;
            }
            words += item[i];
            if (isBracketEnd(item[i]))
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
            else if (isBracketStart(item[i]))
                bracketDepth++;
        }
    }

    if (state === State.CollectWords && words !== "")
        patternItem.addSubPattern(new TextPattern(pattern, words, false, pattern.caseInsensitive));
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
    if (pattern._compiledPattern)
        return pattern._compiledPattern;
    pattern._compiling = true;
    let patternList: OptionalPatternSet = new OptionalPatternSet(pattern, true);
    pattern._compiledPattern = patternList;
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
        if (patternList.subPatterns[0] == patternList)
            throw new Error("Looped.");
        if (!(pattern.id || pattern.onMatched || pattern.onCompletion || pattern.onDiagnostic))
        {
            patternList.subPatterns[0].ignorable = true;
            pattern._compiledPattern = patternList.subPatterns[0];
            return patternList.subPatterns[0];
        }
    }
    return patternList;
}
function compileScope(scope: GrammarScope, pattern: GrammarPattern): ScopePattern
{
    if (scope._compiledPattern)
        return scope._compiledPattern;
    let patternList = new ScopePattern(pattern, scope);
    patternList.addSubPattern(new TextPattern(pattern, scope.begin, false));
    scope._compiledPattern = patternList;
    scope.patterns.forEach(pt =>
    {
        pt._grammar = pattern._grammar;
        let subPattern = compilePattern(pt);
        subPattern.ignorable = true;
        subPattern.multi = true;
        patternList.addSubPattern(subPattern);
    });
    patternList.addSubPattern(new TextPattern(pattern, scope.end, false));
    patternList.name = scope.name ? scope.name : "Scope";
    return patternList;
}
function compileGrammar(grammarDeclare: LanguageGrammar): Grammar
{
    let grammar = new Grammar(grammarDeclare);
    grammarDeclare.patterns.forEach(pattern =>
    {
        pattern._grammar = grammarDeclare;
        let pt = compilePattern(pattern);
        grammar.addSubPattern(pt)
    });
    return grammar;
}

function matchGrammar(grammar: Grammar, doc: TextDocument): GrammarMatchResult
{
    return grammar.match(doc, 0);
}
function includePattern(patternName: string): GrammarPattern
{
    return { patterns: [`<${patternName}>`] };
}
function namedPattern(patternName: string): GrammarPattern
{
    return { patterns: [`<${patternName}>`] };
}
export
{
    LanguageGrammar,
    GrammarPattern,
    compileGrammar,
    matchGrammar,
    GrammarScope,
    includePattern,
    namedPattern,
    MatchResult,
    PatternMatchResult,
    ScopeMatchResult
};