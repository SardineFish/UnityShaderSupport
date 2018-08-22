import { CompletionItem, CodeActionKind, CompletionItemKind } from "vscode-languageserver";
import { MatchResult, PatternMatchResult, ScopeMatchResult, UnMatchedPattern } from "./grammar";
import { CgFunction, CgContext, CgVariable, CgGlobalContext, CgType, toCgVariableCompletions, toCgFunctionCompletions, toCgFieldCompletions, toCompletions, propertyTypes, cgBuildInTypesCompletion, preprocessors, CgArray } from "./grammar-cg";
import { Shader, ShaderProperty, SubShader, Pass, Tag, subShaderTags, passTags, getKeys, renderSetups } from "./structure-shaderlb";

function getMatchedProps(match: PatternMatchResult|UnMatchedPattern, name: string, defaultValue: string = null)
{
    if (!match)
        return defaultValue;
    let value = match.getMatch(name)[0];
    if (!value)
        return defaultValue;
    return value.text;
}
function onFunctionMatch(match: PatternMatchResult)
{
    let type = getMatchedProps(match, "type");
    let name = getMatchedProps(match, "name");
    let returnSemantics = getMatchedProps(match, "semantics");
    let context = match.matchedScope.state as CgGlobalContext;
    let func = new CgFunction(context.getType(type), name, returnSemantics);
    context.addFunction(func);
    match.state = func;
}
function onParamsDeclare(match: PatternMatchResult)
{
    let type = getMatchedProps(match, "type");
    let name = getMatchedProps(match, "name");
    let semantics = getMatchedProps(match, "semantics");
    let func = match.matchedPattern.state as CgFunction;
    func.addParameter(new CgVariable(func.globalContext.getType(type), name, semantics));
}
function onBlockMatch(scope: ScopeMatchResult)
{
    scope.state = new CgContext();
    (scope.matchedScope.state as CgContext).addContext(scope.state as CgContext);
    if (scope.matchedPattern.state instanceof CgFunction)
    {
        scope.matchedPattern.state.setFunctionContext(scope.state);
    }
}
function onStructDeclare(match: PatternMatchResult)
{
    let name = getMatchedProps(match, "name");
    let context = match.matchedScope.state as CgGlobalContext;
    let type = new CgType(name, context);
    context.addCustomType(type);
    match.state = type;
}
function onStructMemberDeclare(match: PatternMatchResult)
{
    let type = getMatchedProps(match, "type");
    let name = getMatchedProps(match, "name");
    let semantics = getMatchedProps(match, "semantics");
    let struct = match.matchedPattern.state as CgType;
    let member = new CgVariable(struct.context.getType(type), name, semantics);
    struct.addMember(member);
}
function getObjectType(match: MatchResult,context:CgContext): CgType
{
    const reg = /([_a-zA-Z][_a-zA-Z0-9]*)(\[.*\])?/;
    let name = "";
    if (match.children.length === 2)
    {
        if (match.children[0].text === ".")
        {
            let prevIdx = match.parent.children.indexOf(match) - 1;
            let prevMatch = match.parent.children[prevIdx];
            let t = getObjectType(prevMatch, context);
            let name = match.children[1].text;
            let result = reg.exec(name);
            if (result[2])
            {
                return (t.getMember(result[1]).type as CgArray).elementType;
            }
            return t.getMember(result[1]).type;
        }
        name = match.children[1].text;
    }
    else
    {
        name = match.text;
    }
    let result = reg.exec(name);
    if (result[2])
    {
        return (context.getVariable(result[1]).type as CgArray).elementType;
    }
    return context.getVariable(result[1]).type;

}
function onExpressionComplete(match: MatchResult): CompletionItem[]
{
    let context = match.matchedScope.state as CgContext;
    if (match.patternName === "expr-unit")
    {
        return toCgVariableCompletions(context.getAllVariables())
            .concat(toCgFunctionCompletions(context.global.functions));
    }
    else if (match.patternName === "operator")
    {
        if (match.text === ".")
        {
            let context = match.matchedScope.state as CgContext;
            let prevIdx = match.parent.parent.children.indexOf(match.parent) - 1;
            let prevMatch = match.parent.parent.children[prevIdx];
            let type = getObjectType(prevMatch,context);
            if (type.orderedMenber)
            {
                let base = 1000;
                return type.members.map((member, idx) =>
                {
                    return {
                        label: member.name,
                        detail: member.toString(),
                        sortText: (base+idx).toString(),
                        kind: CompletionItemKind.Field
                    }
                });
            }
            else
            {
                return type.members.map((member) =>
                {
                    return {
                        label: member.name,
                        detail: member.toString(),
                        kind: CompletionItemKind.Field
                    }
                });
            }
        }
    }
    return [];
}

function onPropertiesCompletion(match: MatchResult):CompletionItem[]
{
    if (match.patternName === "propType")
        return toCompletions(propertyTypes, CompletionItemKind.TypeParameter);
    else if (match.patternName === "propertyValue")
    {
        let typeName = match._unmatchedPattern.getMatch("propType")[0].text;
        if (/Color|Vector/i.test(typeName))
            return toCompletions(["(0, 0, 0, 0)"], CompletionItemKind.Snippet);
        else if (/2D|Cube|3D/i.test(typeName))
        {
            return [
                {
                    label: '"defaulttexture" {}',
                    kind: CompletionItemKind.Snippet
                }
            ]
        }
    }
    return [];
}
function onShaderDeclare(match: ScopeMatchResult)
{
    let name = getMatchedProps(match.matchedPattern, "string");
    let shader = new Shader(name);
    match.state = shader;
    match.matchedPattern.state = shader;
}
function onPropertiesDeclare(match: PatternMatchResult)
{
    let name = getMatchedProps(match, "identifier");
    let displayName = getMatchedProps(match, "displayName").replace(/"/, "");
    let type = getMatchedProps(match, "propType");
    let defaultValue = getMatchedProps(match, "propertyValue");
    let shader = match.matchedScope.matchedScope.state as Shader;
    shader.addProperty(new ShaderProperty(name, displayName, type, defaultValue));
}
function onSubShaderDeclare(match: ScopeMatchResult)
{
    let subShader = new SubShader();
    match.state = subShader;
    let shader = match.matchedScope.state as Shader;
    shader.addSubShader(subShader);
}
function  onPassDeclare(match: ScopeMatchResult)
{
    let subShader = match.matchedScope.state as SubShader;
    let pass = new Pass();
    subShader.addPass(pass);
    match.state = pass;
}
function onTagsMatch(match: PatternMatchResult)
{
    let parent = match.matchedScope.matchedScope.state;
    let tagName = getMatchedProps(match, "tag").replace(/"/g, "");
    let value = getMatchedProps(match, "value").replace(/"/g, "");
    if (parent instanceof SubShader || parent instanceof Pass)
    {
        parent.addTag(new Tag(tagName, value));
    }
}
function onTagCompletion(match: MatchResult): CompletionItem[]
{
    let scope = match.matchedScope.matchedScope.state;
    let tagName: string;
    if (!match.patternName)
    {
        if (match instanceof UnMatchedPattern && match.getMatch("tag"))
        {
            tagName = getMatchedProps(match, "tag").replace(/"/g, "");;
            scope = match.matchedScope.matchedScope.state;
        }
        else
            scope = match.matchedScope.state;
    }
    let tags = scope instanceof SubShader ? subShaderTags :
        (scope instanceof Pass ? passTags : {});
    
    if (tagName || match.patternName === "value")
    {
        if (!tagName)
        {
            let patternMatch = match._unmatchedPattern || match.matchedPattern;
            tagName = getMatchedProps(patternMatch, "tag").replace(/"/g, "");
        }
        let tagsValues = tags[tagName];
        if (!tagsValues)
            return [];
        return tagsValues.map(value =>
        {
            return {
                label: value,
                insertText: `"${value}"`,
                kind: CompletionItemKind.EnumMember
            };
        });
    }
    else if (!match.patternName || match.patternName === "tag")
    {
        return getKeys(tags).map(tagName =>
        {
            return {
                label: tagName,
                insertText: `"${tagName}"`,
                kind: CompletionItemKind.Property
            };
        });
    }
    return [];
}

function onRenderSetupCompletion(match: MatchResult): CompletionItem[]
{
    let stateName = getMatchedProps(match._unmatchedPattern, "stateName");
    if (!stateName)
        stateName = getMatchedProps(match.matchedPattern, "stateName");
    let values = renderSetups[stateName];
    if (!stateName || !values)
    {
        return toCompletions(getKeys(renderSetups), CompletionItemKind.Property)
            .concat([
                {
                    label: "Tags",
                    insertText: "Tags { }",
                    kind: CompletionItemKind.Keyword
                },
                {
                    label: "CGPROGRAM",
                    insertText: "CGPROGRAM\r\n\r\nENDCG",
                    kind: CompletionItemKind.Snippet
                }
            ])
            .concat(match.matchedScope.state instanceof SubShader ?
                [{
                    label: "Pass",
                    insertText: "Pass {\r\n\r\n}",
                    kind: CompletionItemKind.Snippet
                }] : []);
    }
    return toCompletions(values, CompletionItemKind.EnumMember);
}
function cgGlobalCompletion(match:MatchResult): CompletionItem[]
{
    if (match.text.length <= 1)
    {
        return cgBuildInTypesCompletion
            .concat(toCompletions(["struct", "#pragma"], CompletionItemKind.Keyword));
    }
    else if (match.patternName ==="cgProgram")
    {
        return cgBuildInTypesCompletion
            .concat(toCompletions(["struct", "#pragma"], CompletionItemKind.Keyword));
    }
    return [];
    
}
function cgPreprocessorCompletion(match: MatchResult): CompletionItem[]
{
    if (match instanceof UnMatchedPattern)
    {
        let cmd = getMatchedProps(match, "cmd");
        if (!cmd)
            return toCompletions(preprocessors, CompletionItemKind.Keyword);
    }
    else if (match instanceof PatternMatchResult)
    {
        let name = getMatchedProps(match, "name");
        let cmd = getMatchedProps(match, "cmd");
        if (name)
        {
            return [];
        }
        else if (cmd)
        {
            if (["vertex", "fragment", "geometry", "hull", "domain", "surface"].indexOf(cmd) >= 0)
            {
                let context = match.matchedScope.state as CgGlobalContext;
                return toCgFunctionCompletions(context.functions);
            }
        }
        
    }
    return [];
}
function onVariableDeclare(match: MatchResult): CompletionItem[]
{
    if (match.patternName === "type")
    {
        return cgBuildInTypesCompletion;
    }
    else if (match.patternName === "name")
    {
        let context = match.matchedScope.state;
        if (context instanceof CgGlobalContext)
        {
            
            return context.shader.properties.map(prop =>
            {
                return {
                    label: prop.identifier,
                    detail: prop.toString(),
                    kind: CompletionItemKind.Unit
                };
            })
        }
    }
    return [];
}
export
{
    onFunctionMatch,
    onParamsDeclare,
    onBlockMatch,
    onStructDeclare,
    onStructMemberDeclare,
    onExpressionComplete,
    onPropertiesCompletion,
    onPropertiesDeclare,
    onShaderDeclare,
    onSubShaderDeclare,
    onPassDeclare,
    onTagsMatch,
    onTagCompletion,
    onRenderSetupCompletion,
    cgGlobalCompletion,
    cgPreprocessorCompletion,
    onVariableDeclare
}