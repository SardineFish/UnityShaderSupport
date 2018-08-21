import { CompletionItem } from "vscode-languageserver";
import { MatchResult, PatternMatchResult, ScopeMatchResult } from "./grammar";
import { CgFunction, CgContext, CgVariable, CgGlobalContext } from "./grammar-cg";

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
export
{
    onFunctionMatch,
    onParamsDeclare,
    onBlockMatch
}