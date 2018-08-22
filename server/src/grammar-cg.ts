import linq from "linq"
import { CompletionItem, CompletionItemKind } from "vscode-languageserver";
import { Shader, SubShader, Pass } from "./structure-shaderlb";
const scalarTypes = ["float", "half", "int", "fixed"];
const otherTypes = ["bool", "void"];
const vectorTypes = concat(scalarTypes.map(t => [1, 2, 3, 4].map(n => `${t}${n}`)));
const matrixTypes = concat(scalarTypes.map(t => [1, 2, 3, 4].map(n => `${t}${n}x${n}`)));
const samplerTypes = concat(["sampler"].map(t => ["1D", "2D", "3D", "CUBE", "RECT"].map(d => `${t}${d}`)));
const keyWords = ["if", "for", "while", "do"];
const propertyTypes = ["Range", "Float", "Int", "Color", "Vector", "2D", "Cube", "3D"];
const preprocessors = ["vertex", "fragment", "geometry", "hull", "domain", "target", "only_renderers", "exclude_renderers", "multi_compile", "enable_d3d11_debug_symbols", "hardware_tier_variants"];


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
    context: CgGlobalContext;
    constructor(name: string, context: CgGlobalContext, members: CgVariable[] = [])
    {
        this.name = name;
        this.context = context;
        this.members = members;
    }
    addMember(v: CgVariable)
    {
        v.context = null;
        this.members.push(v);
    }
}
class CgFunction
{
    type: CgType;
    name: string;
    semantics: string = null;
    parameters: CgVariable[] = [];
    globalContext: CgGlobalContext;
    functionContext: CgContext;
    constructor(type: CgType, name: string, semantics: string = null, params: CgVariable[] = [])
    {
        this.type = type;
        this.name = name;
        this.semantics = semantics;
        this.parameters = params;
    }
    addParameter(param: CgVariable)
    {
        this.parameters.push(param);
        if (this.functionContext)
            this.functionContext.addVariable(param);
    }
    setFunctionContext(context: CgContext)
    {
        this.functionContext = context;
        this.globalContext.addContext(context);
        this.parameters.forEach(param => context.addVariable(param));
    }
    toString()
    {
        return `${this.type.name} ${this.name}(${this.parameters.map(param => param.toString()).join(", ")})${this.semantics ? ` :${this.semantics}` : ""}`;
    }
}
class CgVariable
{
    type: CgType;
    name: string;
    semantics: string = null;
    context: CgContext;
    constructor(type: CgType, name: string, semantics: string = null)
    {
        this.type = type;
        this.name = name;
        this.semantics = semantics;
    }
    toString()
    {
        return `${this.type.name} ${this.name}${this.semantics ? ` :${this.semantics}` : ""}`;
    }
}
class CgContext
{
    upper: CgContext;
    contexts: CgContext[] = [];
    variables: CgVariable[] = [];
    global: CgGlobalContext;

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
        return t ? t : new CgType(`${name}?`, this.global);
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
class CgGlobalContext extends CgContext
{
    shader: Shader;
    declaredTypes: CgType[] = [];
    functions: CgFunction[] = [];
    constructor()
    {
        super();
        this.global = this;
        this.upper = null;
        this.declaredTypes = cgBuildInTypes.map(t => new CgType(t, this));
    }
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
    addFunction(func: CgFunction)
    {
        this.functions.push(func);
        func.globalContext = this;
    }
}

function toCgVariableCompletions(varList: CgVariable[]): CompletionItem[]
{
    return varList.map(v =>
    {
        return {
            label: v.name,
            kind: CompletionItemKind.Variable,
            detail: v.toString()
        }
    });
}

function toCgFunctionCompletions(funcList: CgFunction[]): CompletionItem[]
{
    return funcList.map(func =>
    {
        return {
            label: func.name,
            kind: CompletionItemKind.Function,
            detail: func.toString()
        }
    });
}

function toCgFieldCompletions(fields: CgVariable[]): CompletionItem[]
{
    return fields.map(field =>
    {
        return {
            label: field.name,
            kind: CompletionItemKind.Field,
            detail: field.toString()
        }
    });
}
function toCompletions(labels: string[], kind: CompletionItemKind): CompletionItem[]
{
    return labels.map(label =>
    {
        return {
            label: label,
            kind: kind
        }
    });
}
export
{
    cgBuildInTypes,
    cgBuildInTypesCompletion,
    cgBuildInKeywordsCompletion,
    CgType,
    CgVariable,
    CgContext,
    CgGlobalContext,
    toCgVariableCompletions,
    CgFunction,
    toCgFunctionCompletions,
    toCgFieldCompletions,
    toCompletions,
    propertyTypes,
    preprocessors
};
