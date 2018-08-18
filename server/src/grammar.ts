import { TextDocument, Position, TextDocumentItem, LogMessageNotification, CompletionItem, Diagnostic, Range } from "vscode-languageserver";
import linq from "linq";
import sourceShaderLab from "./shaderlab.grammar";

type DocumentCompletionCallback = () => CompletionItem[];
type DocumentDiagnoseCallback = (range:Range) => Diagnostic[];

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
    constructor(doc: TextDocument, declare:ScopeDeclare)
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
        this.scopes = scopeMatch(sourceShaderLab, doc, 0);
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
}


export { ShaderCode, Scope, ScopeDeclare };