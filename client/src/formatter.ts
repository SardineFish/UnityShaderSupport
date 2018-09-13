import { TextDocument, Position, Range, TextEdit, FormattingOptions } from "vscode";
import * as linq from "linq"
class DocRange extends Range
{
    doc: TextDocument;
    get text() { return this.doc.getText(this); }
    get startOffset() { return this.doc.offsetAt(this.start); }
    get endOffset() { return this.doc.offsetAt(this.end); }
    get length() { return this.endOffset - this.startOffset;}
    constructor(doc: TextDocument, start: Position | number, end: Position | number)
    {
        if (start instanceof Position && end instanceof Position)
        {
            super(start, end);
        }
        else
        {
            super(doc.positionAt(<number>start), doc.positionAt(<number>end));
        }
        this.doc = doc;
    }

    contains(range: Range | Position): boolean
    {
        if (range instanceof Range)
            return range.start.compareTo(this.start) >= 0 && range.start.compareTo(this.end) < 0
                &&
                range.end.compareTo(this.start) > 0 && range.end.compareTo(this.end) <= 0;
        else
        {
            return super.contains(range);
        }
    }
}
class CommentBlock extends DocRange
{
}
class StringBlock extends DocRange
{
}
class Gap extends DocRange
{
    get prevCh() { return this.doc.getText(new Range(this.doc.positionAt(this.startOffset - 1), this.start)); }
    get latterCh() { return this.doc.getText(new Range(this.end, this.doc.positionAt(this.endOffset + 1)));}
}
function findIgnoreRange(doc: TextDocument): DocRange[]
{
    let ranges = [];
    const regCommentBlock = /(\/\*(?!\/).*?\*\/)/;
    const regCommentLine = /\/\/.*[\r]?[\n]?/;
    const regString = /"([^\\"]|\\\S|\\")*"/;
    const reg = /(\/\*(?!\/).*?\*\/)|\/\/.*[\r]?[\n]?|"([^\\"]|\\\S|\\")*"/g;
    let startIdx = 0;
    let totalText = doc.getText();
    for (let match = reg.exec(totalText); match; match = reg.exec(totalText))
    {
        if (match[0].charAt(0) === '"')
        {
            ranges.push(new StringBlock(doc, match.index, match.index + match[0].length));
        }
        else
            ranges.push(new CommentBlock(doc, match.index, match.index + match[0].length));
    }
    return ranges;
}

function findCGCode(doc: TextDocument): Range[]
{
    let ignoreRange = findIgnoreRange(doc);
    let text = doc.getText();
    let regBegin = /CGPROGRAM/g;
    let regEnd = /ENDCG/g;
    let cgRanges = [];
    for (let matchBegin = regBegin.exec(text); matchBegin; matchBegin = regBegin.exec(text))
    {
        if (ignoreRange.some(ignore => ignore.contains(doc.positionAt(matchBegin.index))))
            continue;
        let matchEnd:RegExpExecArray = null;
        do
        {
            matchEnd = regEnd.exec(text);
            if (!matchEnd)
                break;
        }
        while (matchEnd && matchEnd.index < matchBegin.index && !ignoreRange.some(ignore => ignore.contains(doc.positionAt(matchEnd.index))));
        if (!matchEnd)
            return cgRanges;
        
        cgRanges.push(new Range(doc.positionAt(matchBegin.index), doc.positionAt(matchEnd.index + matchEnd.length)));
    }
    return cgRanges;
}

function removeComment(doc: TextDocument): [string, CommentBlock[]]
{
    let text = doc.getText();
    const reg = /(?:\/\*(?!\/)(?:.|\s)*?\*\/)|\/\/.*[\r]?[\n]?/g;
    let comments: CommentBlock[] = []
    text = text.replace(reg, (match, offset) =>
    {
        comments.push(new CommentBlock(doc, offset, offset + match.length));
        return linq.repeat(" ", match.length).toArray().join("");
    });
    return [text, comments];
}

function splitGap(doc:TextDocument,line: number): Gap[]
{
    let text = doc.lineAt(line).text;
    let empties: Gap[] = [];
    
    const reg = /((?:(?:\+\+|--)?[_0-9a-zA-Z]+(?:\+\+|--)?)|(?:(?:(?:\+|-|\*|\/|%|=|&|\||\^|<<|>>)=?)|(?:<|>|<=|>=|==|\!=|\|\||&&)|(?:\.|\?|\:|~|,|;|\(|\)|\[|\]|{|}))|(?:"(?:[^\\"]|\\\S|\\")*"))(\s+)?/g;
    let headerSpace = /\s+/.exec(text);
    empties.push(new Gap(doc, new Position(line, 0), new Position(line, headerSpace ? headerSpace[0].length : 0)));
    for (let match = reg.exec(text); match; match = reg.exec(text))
    {
        let range = new Gap(doc, new Position(line, match.index + match[1].length), new Position(line, match.index + match[0].length));
        empties.push(range);
    }
    return empties;
}

function insertSpaceShaderLab(gap: Gap): boolean
{
    const regWord = /[a-zA-Z0-9_]|"/;
    const regOperator = /(?:<|>|<=|>=|==|\!=|\|\||&&|\?|\:)|(?:(?:\+|-|\*|\/|%|=|&|\||\^|<<|>>)=?)/;
    const regDelimiter = /,|;/;
    if (regWord.test(gap.prevCh) && regWord.test(gap.latterCh))
    {
        return true;
    }
    else if (gap.prevCh === '"' && gap.latterCh === '"')
        return true;
    else if (regOperator.test(gap.prevCh) || regOperator.test(gap.latterCh))
        return true;
    else if (regDelimiter.test(gap.prevCh))
        return true;
    else if (gap.prevCh.length > 0 && gap.latterCh === "{")
        return true;
    return false;
    
}

function insertSpaceCg(gap: Gap): boolean
{
    const regWord = /[a-zA-Z0-9_]|"/;
    const regOperator = /(?:<|>|<=|>=|==|\!=|\|\||&&|\?|\:)|(?:(?:\+|-|\*|\/|%|=|&|\||\^|<<|>>)=?)/;
    const regDelimiter = /,|;/;
    if (regWord.test(gap.prevCh) && regWord.test(gap.latterCh))
    {
        return true;
    }
    else if (regOperator.test(gap.prevCh) || regOperator.test(gap.latterCh))
        return true;
    else if (gap.prevCh === ",")
        return true;
    else if (gap.prevCh === ";" && gap.latterCh.length > 0)
        return true;
    else if (gap.prevCh.length > 0 && gap.latterCh === "{")
        return true;
    return false;
}

export function format(doc: TextDocument, options:FormattingOptions):TextEdit[]
{
    let indent = 0;
    let indentUnit = options.insertSpaces ? linq.repeat(" ", options.tabSize).toArray().join("") : "\t";
    let editList = [];
    let ignoreRanges = findIgnoreRange(doc);
    let cgRanges = findCGCode(doc);
    let missSemicolon = false;

    //const isCG = (range: Range) => cgRanges.some(cg => cg.contains(range));
    const ignoreFormmat = (range: Range) => ignoreRanges.some(r => r.contains(range));
    const containsComments = (range: Range) => ignoreRanges.filter(r => r instanceof CommentBlock).some(r => range.contains(r));
    const genIndent = (count: number) => linq.repeat(indentUnit, count).toArray().join("");

    for (let lineIdx = 0; lineIdx < doc.lineCount; lineIdx++)
    {
        let line = doc.lineAt(lineIdx);
        let empties = splitGap(doc, lineIdx);
        let isCG = cgRanges.some(cg => cg.contains(line.range));
        //console.log(indent);
        for (let i = 0; i < empties.length; i++)
        {
            if (empties[i].prevCh === "{")
                indent++;
            if (empties[i].latterCh === "}")
                indent--;
            
            if (ignoreFormmat(empties[i]) || containsComments(empties[i]))
                continue;
            
            // Handle indent
            if (i === 0)
            {
                let indentCount = indent;
                if (missSemicolon && !/{/.test(empties[i].latterCh))
                    indentCount++;
                missSemicolon = false;
                /*if (empties[i].latterCh === "}")
                    indentCount--;*/
                let indentReplace =
                    TextEdit.replace(
                        new Range(
                            new Position(lineIdx, 0),
                            new Position(lineIdx, line.firstNonWhitespaceCharacterIndex)),
                        genIndent(indentCount));
                editList.push(indentReplace);
                continue;
            }

            if (isCG)
            {
                if (i === empties.length - 1 && !/{|}|;/.test(empties[i].prevCh))
                {
                    missSemicolon = true;
                }
                let space = insertSpaceCg(empties[i]);
                if (space)
                {
                    editList.push(TextEdit.replace(empties[i], " "));
                }
                else if(empties[i].length>0)
                {
                    editList.push(TextEdit.delete(empties[i]));
                }
            }
            else
            {
                let space = insertSpaceShaderLab(empties[i]);
                if (space)
                {
                    editList.push(TextEdit.replace(empties[i], " "));
                }
                else if (empties[i].length > 0)
                {
                    editList.push(TextEdit.delete(empties[i]));
                }
            }
        }
    }
    return editList;
}

export function inlineFormat(doc: TextDocument, ch: string, pos: Position, options: FormattingOptions):TextEdit[]
{
    let editList: TextEdit[] = [];
    
    

    return editList;
}