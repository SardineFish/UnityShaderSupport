import { TextDocument, Position, Range, TextEdit, FormattingOptions } from "vscode";
import * as linq from "linq"
type LineState = { line: number, indent: number, missSemicolon?:boolean, gaps?:Gap[] };
type GapHandler = (gap: Gap, state: LineState) => void;
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

export class Formatter
{
    indentUnit: string;
    ignoreRanges: DocRange[];
    emptyRanges: DocRange[];
    cgRanges: Range[];
    doc: TextDocument;
    private isEmpty = (range: Range | Position) => this.emptyRanges.some(r => r.contains(range));
    private ignoreFormmat = (range: Range | Position) => this.ignoreRanges.some(r => r.contains(range));
    private containsComments = (range: Range) => this.ignoreRanges.filter(r => r instanceof CommentBlock).some(r => range.contains(r));
    private genIndent = (count: number) => linq.repeat(this.indentUnit, count).toArray().join("");
    private inCG = (range: Range | Position) => this.cgRanges.some(cg => cg.contains(range));
    constructor(doc: TextDocument, options: FormattingOptions)
    {
        this.doc = doc;
        this.indentUnit = options.insertSpaces ? linq.repeat(" ", options.tabSize).toArray().join("") : "\t";
        this.ignoreRanges = this.findIgnoreRange();
        this.cgRanges = this.findCGCode();
        this.emptyRanges = this.findEmptyRanges();
    }

    private findCGCode(): Range[]
    {
        let text = this.doc.getText();
        let regBegin = /CGPROGRAM/g;
        let regEnd = /ENDCG/g;
        let cgRanges = [];
        for (let matchBegin = regBegin.exec(text); matchBegin; matchBegin = regBegin.exec(text))
        {
            if (this.ignoreRanges.some(ignore => ignore.contains(this.doc.positionAt(matchBegin.index))))
                continue;
            let matchEnd: RegExpExecArray = null;
            do
            {
                matchEnd = regEnd.exec(text);
                if (!matchEnd)
                    break;
            }
            while (matchEnd && matchEnd.index < matchBegin.index && !this.ignoreRanges.some(ignore => ignore.contains(this.doc.positionAt(matchEnd.index))));
            if (!matchEnd)
                return cgRanges;

            cgRanges.push(new Range(this.doc.positionAt(matchBegin.index), this.doc.positionAt(matchEnd.index + matchEnd.length)));
        }
        return cgRanges;
    }

    private findIgnoreRange(): DocRange[]
    {
        let ranges = [];
        const regCommentBlock = /(\/\*(?!\/).*?\*\/)/;
        const regCommentLine = /\/\/.*[\r]?[\n]?/;
        const regString = /"([^\\"]|\\\S|\\")*"/;
        const reg = /(\/\*(?!\/).*?\*\/)|\/\/.*[\r]?[\n]?|"([^\\"]|\\\S|\\")*"/g;
        let startIdx = 0;
        let totalText = this.doc.getText();
        for (let match = reg.exec(totalText); match; match = reg.exec(totalText))
        {
            if (match[0].charAt(0) === '"')
            {
                ranges.push(new StringBlock(this.doc, match.index, match.index + match[0].length));
            }
            else
                ranges.push(new CommentBlock(this.doc, match.index, match.index + match[0].length));
        }
        return ranges;
    }

    private findEmptyRanges(): DocRange[]
    {
        let ranges = [];
        const reg = /(\s|(\/\*(?!\/).*?\*\/)|\/\/.*[\r]?[\n]?)+/g;
        let totalText = this.doc.getText();
        for (let match = reg.exec(totalText); match; match = reg.exec(totalText))
        {
            if (match[0].length > 0)
                ranges.push(new DocRange(this.doc, match.index, match.index + match[0].length));
        }
        return ranges;
    }

    private splitGap(line: number): Gap[]
    {
        let text = this.doc.lineAt(line).text;
        let empties: Gap[] = [];

        const reg = /((?:(?:\+\+|--)?[_0-9a-zA-Z]+(?:\+\+|--)?)|(?:(?:(?:\+|-|\*|\/|%|=|&|\||\^|<<|>>)=?)|(?:<|>|<=|>=|==|\!=|\|\||&&)|(?:\.|\?|\:|~|,|;|\(|\)|\[|\]|{|}))|(?:"(?:[^\\"]|\\\S|\\")*"))(\s+)?/g;
        let headerSpace = /\s+/.exec(text);
        empties.push(new Gap(this.doc, new Position(line, 0), new Position(line, headerSpace ? headerSpace[0].length : 0)));
        for (let match = reg.exec(text); match; match = reg.exec(text))
        {
            let range = new Gap(this.doc, new Position(line, match.index + match[1].length), new Position(line, match.index + match[0].length));
            empties.push(range);
        }
        return empties;
    }

    private insertSpaceCg(gap: Gap): boolean
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

    private insertSpaceShaderLab(gap: Gap): boolean
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

    getFormatRange(pos: Position): Range
    {
        let offset = this.doc.offsetAt(pos);
        let text = this.doc.getText();
        let braceDepth = 0;
        const regEmpty = /\s/;

        let empty = linq.from(this.emptyRanges).where(r => r.contains(this.doc.positionAt(offset))).firstOrDefault();
        if (empty)
            offset -= empty.length;
        for (let i = offset; i >= 0; i--)
        {
            if (text.charAt(i) === "}")
            {
                braceDepth++;
                for (; i >= 0; i--)
                {
                    if (text.charAt(i) === "}" && !this.ignoreFormmat(this.doc.positionAt(i)))
                        braceDepth++;
                    else if (text.charAt(i) === "{" && !this.ignoreFormmat(this.doc.positionAt(i)))
                        braceDepth--;
                    if (braceDepth === 0)
                        break;
                }
            }
            let empty = linq.from(this.emptyRanges).where(r => r.contains(this.doc.positionAt(offset))).firstOrDefault();
            if (empty)
                i -= empty.length;
            if (text.charAt(i) === ";" && this.inCG(this.doc.positionAt(i)))
            {
                return new Range(this.doc.positionAt(i + 1), pos);
            }
            let startPos = this.doc.positionAt(i);
            startPos = new Position(startPos.line, 0);
            return new Range(startPos, pos);
        }
    }

    formatInRange(range: Range, indent = 0):TextEdit[]
    {
        enum FormatState { FormatShaderLab, FormatCG, MissSemicolon };
        let state: FormatState = FormatState.FormatShaderLab;
        let editList = [];
        for (let lineIdx = range.start.line; lineIdx <= range.end.line; lineIdx++)
        {
            let line = this.doc.lineAt(lineIdx);
            let spaces = this.splitGap(lineIdx);
            if (state !== FormatState.MissSemicolon)
            {
                if (this.inCG(line.range))
                    state = FormatState.FormatCG;
                else
                    state = FormatState.FormatShaderLab;
            }
            
            for (let i = 0; i < spaces.length; i++)
            {
                if (this.ignoreFormmat(spaces[i]) || this.containsComments(spaces[i]))
                    continue;
                
                if (spaces[i].prevCh === "{")
                    indent++;
                if (spaces[i].latterCh === "}")
                    indent--;
                
                // Handle indent
                if (i === 0)
                {
                    let indentCount = indent;
                    if (state === FormatState.MissSemicolon)
                    {
                        if (!/{/.test(spaces[i].latterCh))
                            indentCount++;
                        state = FormatState.FormatCG;
                    }
                    let indentReplace =
                        TextEdit.replace(
                            new Range(
                                new Position(lineIdx, 0),
                                new Position(lineIdx, line.firstNonWhitespaceCharacterIndex)),
                            this.genIndent(indentCount));
                    editList.push(indentReplace);
                    continue;
                }

                if (state === FormatState.FormatShaderLab)
                {
                    let space = this.insertSpaceShaderLab(spaces[i]);
                    if (space)
                    {
                        editList.push(TextEdit.replace(spaces[i], " "));
                    }
                    else if (spaces[i].length > 0)
                    {
                        editList.push(TextEdit.delete(spaces[i]));
                    }
                }
                else if (state === FormatState.FormatCG)
                {
                    if (i === spaces.length - 1 && !/{|}|;/.test(spaces[i].prevCh))
                    {
                        state = FormatState.MissSemicolon;
                    }
                    let space = this.insertSpaceCg(spaces[i]);
                    if (space)
                    {
                        editList.push(TextEdit.replace(spaces[i], " "));
                    }
                    else if (spaces[i].length > 0)
                    {
                        editList.push(TextEdit.delete(spaces[i]));
                    }
                }
            }
        }
        return editList;
    }

    format(trigger: string = "", pos: Position = null): TextEdit[]
    {
        if (trigger === "")
            return this.formatInRange(new Range(new Position(0, 0), this.doc.positionAt(this.doc.getText().length)));
        let formatRange: Range;
        switch (trigger)
        {
            case "":
                formatRange = new Range(new Position(0, 0), this.doc.positionAt(this.doc.getText().length));
                break;
            case "\n":
                formatRange = new Range(new Position(pos.line - 1, 0), pos);
                break;
            case "{":
                formatRange = new Range(new Position(pos.line, 0), pos);
                break;
            case "}":
                formatRange = this.getFormatRange(pos);
                break;
            case ";":
                formatRange = this.getFormatRange(this.doc.positionAt(this.doc.offsetAt(pos) - 2));
                break;
        }

        let line = this.doc.lineAt(formatRange.start.line);
        let spaceCount = line.firstNonWhitespaceCharacterIndex;
        let indent = linq.range(0, spaceCount).select(i => line.text.charAt(i)).where(chr => chr === "\t").count();
        // To fix bug cause by indent decending
        if (this.splitGap(formatRange.start.line)[0].latterCh === "}")
            indent++;
        return this.formatInRange(formatRange, indent);
    }
}