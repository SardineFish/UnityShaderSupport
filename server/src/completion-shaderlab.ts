import { CompletionItem, CodeActionKind, CompletionItemKind } from "vscode-languageserver";
import { MatchResult, PatternMatchResult, ScopeMatchResult } from "./grammar";
import { CgFunction, CgContext, CgVariable, CgGlobalContext, CgType, toCgVariableCompletions, toCgFunctionCompletions, toCgFieldCompletions } from "./grammar-cg";

function getMatchedProps(match: PatternMatchResult, name: string, defaultValue: string = null)
{
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
            let prevIdx = match.parent.parent.children.indexOf(match.parent) - 1;
            let prevName: string;
            if (!match.parent.parent.children[prevIdx].children[1])
                prevName = match.parent.parent.children[prevIdx].text;
            else 
                prevName = match.parent.parent.children[prevIdx].children[1].text;
            let context = match.matchedScope.state as CgContext;
            let variable = context.getVariable(prevName);
            if (!variable)
                return [];
            return toCgFieldCompletions(variable.type.members);
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
    onExpressionComplete
}