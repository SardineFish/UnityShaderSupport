import linq from "linq"
import { CompletionItem, CompletionItemKind } from "vscode-languageserver";
const scalarTypes = ["float", "half", "int", "fixed"];
const otherTypes = ["bool"];
const vectorTypes = concat(scalarTypes.map(t => [1, 2, 3, 4].map(n => `${t}${n}`)));
const matrixTypes = concat(scalarTypes.map(t => [1, 2, 3, 4].map(n => `${t}${n}x${n}`)));
const samplerTypes = concat(["sampler"].map(t => ["1D", "2D", "3D", "CUBE", "RECT"].map(d => `${t}${d}`)));
const keyWords = ["if", "for", "while", "do"];

function concat<T>(list: T[][]):T[]
{
    let result: T[] = [];
    list.forEach(subList => result = result.concat(subList));
    return result;
}
const cgBuildInTypes = scalarTypes.concat(otherTypes, vectorTypes, matrixTypes, samplerTypes);
const cgBuildInTypesCompletion: CompletionItem[]
    = cgBuildInTypes.map(type =>
    {
        return {
            label: type,
            kind:CompletionItemKind.Struct
        }
    });
const cgBuildInKeywordsCompletion: CompletionItem[]
    = keyWords.map(keyword =>
    {
        return {
            label: keyword,
            kind: CompletionItemKind.Keyword
        }
    });

class CgType
{
    name: string;
    members: CgVariable[];
}
class CgVariable
{
    type: CgType;
    
}
class CgVariableContext
{
    
}

export { cgBuildInTypes,cgBuildInTypesCompletion, cgBuildInKeywordsCompletion };
