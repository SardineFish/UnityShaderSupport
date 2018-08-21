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
    members: CgVariable[] = [];
    context: cgGlobalContext;
    constructor(name: string, context: cgGlobalContext, members: CgVariable[] = [])
    {
        this.name = name;
        this.context = context;
        this.members = members;
    }
}
class CgVariable
{
    type: CgType;
    name: string;
    semantics: string;
    context: CgContext;
    constructor(type: CgType, name: string, semantics: string = "")
    {
        this.type = type;
        this.name = name;
        this.semantics = semantics;
    }
}
class CgContext
{
    upper: CgContext;
    contexts: CgContext[] = [];
    variables: CgVariable[] = [];
    global: cgGlobalContext;

    addContext(context: CgContext)
    {
        this.contexts.push(context);
        context.upper = this;
        context.global = this.global;
    }
    addVariable(variable: CgVariable)
    {
        this.variables.push(variable);
        variable.context = this;
    }
    getVariable(name: string): CgVariable
    {
        let v = linq.from(this.variables).where(variable => variable.name === name).firstOrDefault();
        if (!v)
        {
            return this.upper ? this.upper.getVariable(name) : null;
        }
        return v;
    }
    getType(name: string): CgType
    {
        let t = linq.from(this.global.declaredTypes).where(t => t.name === name).firstOrDefault();
        return t ? t : new CgType("?", this.global);
    }
    protected internalGetAllVariables(): Map<string, CgVariable>
    {
        let varMap = new Map<string, CgVariable>();
        if (this.upper)
            varMap = this.upper.internalGetAllVariables();
        for (let i = 0; i < this.variables.length; i++)
        {
            varMap.set(this.variables[i].name, this.variables[i]);
        }
        return varMap;
    }
    getAllVariables(): CgVariable[]
    {
        let varMap = this.internalGetAllVariables();
        let varList:CgVariable[] = [];
        for (let v of varMap.values()) {
            varList.push(v);
        }
        return varList;
    }
}
class cgGlobalContext extends CgContext
{
    declaredTypes: CgType[] = [];
    addContext(context: CgContext)
    {
        super.addContext(context);
        context.global = this;
    }
    addCustomType(type: CgType)
    {
        this.declaredTypes.push(type);
        type.context = this;
    }
    constructor()
    {
        super();
        this.global = this;
        this.upper = null;
        this.declaredTypes = cgBuildInTypes.map(t => new CgType(t, this));
    }
}

function toCgVariableCompletions(varList: CgVariable[]): CompletionItem[]
{
    return varList.map(v =>
    {
        return {
            label: v.name,
            kind: CompletionItemKind.Variable,
            detail: `${v.type.name} ${v.name}${v.semantics === "" ? "" : ` :${v.semantics}`}`
        }
    });
}

export { cgBuildInTypes, cgBuildInTypesCompletion, cgBuildInKeywordsCompletion, CgType, CgVariable, CgContext, cgGlobalContext,toCgVariableCompletions };
