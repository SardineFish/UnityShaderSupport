import { LanguageGrammar, GrammarPattern, includePattern, namedPattern } from "./grammar";
import { CompletionItemKind } from "vscode-languageserver";
import { cgBuildInTypesCompletion, cgBuildInKeywordsCompletion, CgContext, CgGlobalContext, CgVariable, toCgVariableCompletions, toCgFunctionCompletions } from "./grammar-cg";
import { onFunctionMatch, onParamsDeclare, onBlockMatch } from "./completion-shaderlab";
const grammarShaderLab: LanguageGrammar = {
    stringDelimiter: ["\""],
    pairMatch: [
        ["/*", "*/"],
        ["\"", "\""],
        ["'", "'"],
        ["(", ")"],
        ["{", "}"],
        ["[", "]"],
    ],
    ignore: {
        patterns: [
            "/\* * \*/",
            "//*"
        ]
    },
    patterns: [
        {
            patterns: ["Shader <string> {shaderScope}"],
            caseInsensitive: true,
            crossLine: true,
            scopes: {
                "shaderScope": {
                    name: "Shader",
                    begin: "{",
                    end: "}",
                    patterns: [
                        { patterns: ["<propertiesPattern>"] },
                        { patterns: ["<subShaderPattern>"] }
                    ]
                }
            }
        }
    ],
    patternRepository: {
        "propertiesPattern":
        {
            name: "Properties",
            patterns: ["Properties {propScope}"],
            caseInsensitive: true,
            crossLine: true,
            scopes: {
                "propScope": {
                    begin: "{",
                    end: "}",
                    patterns: [
                        {
                            name: "Property Declare",
                            patterns: ["<identifier> (<displayName>, <propType>) = <propertyValue>"],
                            dictionary: {
                                "displayName": GrammarPattern.String
                            }
                        }
                    ]
                }
            }
        },
        "propertyValue": {
            name: "Property Value",
            patterns: [
                "<number>",
                "<string> \\{[<any>]\\}",
                "(<number>, <number>, <number>, <number>)"
            ]
        },
        "propType": {
            name: "Property Type",
            patterns: ["<typeName>[(<number>[, <number> ...])]"],
            dictionary: {
                "typeName": {
                    patterns: [
                        "/[_a-zA-Z0-9]+/"
                    ]
                }
            }
        },
        "subShaderPattern": {
            name: "SubShader",
            patterns: ["SubShader {subShaderScope}"],
            caseInsensitive: true,
            crossLine: true,
            scopes: {
                "subShaderScope": {
                    begin: "{",
                    end: "}",
                    patterns: [
                        includePattern("tagsPattern"),
                        includePattern("renderSetupPattern"),
                        includePattern("pass"),
                        includePattern("cgProgram")
                    ]
                }
            }
        },
        "pass": {
            name: "Pass",
            patterns: ["Pass {pass}"],
            caseInsensitive: true,
            crossLine: true,
            scopes: {
                "pass": {
                    begin: "{",
                    end: "}",
                    patterns: [
                        includePattern("tagsPattern"),
                        includePattern("renderSetupPattern"),
                        includePattern("cgProgram")
                    ]
                }
            }
        },
        "tagsPattern": {
            name: "Tags",
            patterns: ["Tags {tagScope}"],
            crossLine: true,
            caseInsensitive: true,
            scopes: {
                "tagScope": {
                    begin: "{",
                    end: "}",
                    patterns: [
                        {
                            patterns: ["<tag> = <value>"],
                            dictionary: {
                                "tag": GrammarPattern.String,
                                "value": GrammarPattern.String
                            }
                        }
                    ]
                }
            }
        },
        "renderSetupPattern": {
            name: "Render Setup",
            patterns: ["<property> < > <value>"],
            dictionary: {
                "property": GrammarPattern.Identifier,
                "value": {
                    name: "Render Setup Value",
                    patterns: ["<identifier>", "<string>", "<number>"]
                }
            }
        },
        "cgProgram": {
            name: "Cg Program",
            patterns: ["{cgProgram}"],
            scopes: {
                "cgProgram": {
                    begin: "CGPROGRAM",
                    end: "ENDCG",
                    patterns: [
                        {
                            name: "Preprocessor",
                            patterns: [
                                "#pragma <cmd> <name>[ <options>...]",
                                "#pragma <cmd>[ <feature>...]",
                                "#pragma <cmd>"
                            ],
                            keepSpace: true,
                            dictionary: {
                                "name": {
                                    patterns: ["<number>", "<identifier>"]
                                }
                            }
                        },
                        includePattern("variableDeclare"),
                        includePattern("functionDefinition")
                    ],
                    onMatched: (match) =>
                    {
                        match.state = new CgGlobalContext();
                    }
                }
            }
        },
        "functionDefinition": {
            name: "Function Definition",
            patterns: ["<type> <name>([<paramsDeclare>][,<paramsDeclare>...])[:<semantics>]{body-block}"],
            dictionary: {
                "type": GrammarPattern.Identifier,
                "name": GrammarPattern.Identifier,
                "semantics": GrammarPattern.Identifier
            },
            onMatched: onFunctionMatch,
            onCompletion: (match) =>
            {
                if (match.patternName === "type")
                {
                    return cgBuildInTypesCompletion;
                }
                return [];
            }
        },
        "paramsDeclare": {
            name: "Params Declare",
            patterns: ["[<decorator>] <type> < > <name> [:<semantics>]"],
            dictionary: {
                "type": GrammarPattern.Identifier,
                "name": GrammarPattern.Identifier,
                "semantics": GrammarPattern.Identifier,
                "decorator": {
                    patterns: ["in ", "out ", "inout "],
                    keepSpace: true
                }
            },
            onMatched: onParamsDeclare
        },
        "variableDeclare": {
            name: "Variable Declare",
            patterns: ["<type> < > <name> [:<semantics>] [= <expression>];"],
            dictionary: {
                "type": GrammarPattern.Identifier,
                "name": GrammarPattern.Identifier,
                "semantics": GrammarPattern.Identifier
            },
            onMatched: (match) =>
            {
                let type = match.getMatch("type")[0].text;
                let name = match.getMatch("name")[0].text;
                let semantics = match.getMatch("semantics")[0] ? match.getMatch("semantics")[0].text : "";
                let context = match.matchedScope.state as CgContext;
                context.addVariable(new CgVariable(context.getType(type), name, semantics));
            },
            onCompletion: (match) =>
            {
                if (match.patternName === "type")
                {
                    return cgBuildInTypesCompletion;
                }
                return [];
            }
        },
        "expression": {
            name: "Expression",
            patterns: [
                "<expr-unit> [<operator> <expr-unit> ...]"
            ],
            dictionary: {
                "expr-unit": {
                    name: "Expression Unit with Operator",
                    patterns: ["[<unary-operator> ...]<unit>[<postfix>]"],
                    dictionary: {
                        "unit": {
                            name: "Expression Unit",
                            patterns: [
                                "<func-call>",
                                "<identifier>",
                                "<number>",
                                "<bracket>",
                            ]
                        },
                        "unary-operator": {
                            name: "Unary Operator",
                            patterns: ["!", "+", "-", "~"]
                        },
                        "postfix": {
                            name: "Postfix Operator",
                            patterns: ["++", "--"]
                        }
                    }
                },
                "operator": {
                    name: "Operator",
                    patterns: ["/(((\\+|-|\\*|\\/|%|=|&|\\||\\^|<<|>>)=?)|(<|>|<=|>=|==|\\!=|\\|\\||&&)|(\\.|\\?|\\:|~))/"]
                }
            },
            onCompletion: (match) =>
            {
                return [];
            }
        },
        "bracket": {
            name: "Bracket",
            patterns: ["(<expression>)"]
        },
        "func-call": {
            name: "Function Call",
            patterns: ["<identifier> (<expression> [, <expression> ...])"]
        }
    },
    scopeRepository: {
        "body-block": {
            name: "Block",
            begin: "{",
            end: "}",
            patterns: [
                includePattern("variableDeclare"),
                {
                    name: "Statement",
                    id:"statement",
                    patterns: ["<expression>;"]
                },
                {
                    name: "If",
                    id:"if-structure",
                    patterns: ["if (<expression>) {body-block} "]
                },
                {
                    name: "For Loop",
                    id:"for-structure",
                    patterns: ["for (<expression>;<expression>;<expression>) {body-block}"]
                },
                {
                    name: "While Loop",
                    id:"while-structure",
                    patterns: ["while (<expression>) {body-block}"]
                },
                {
                    name: "Do-While Loop",
                    id:"do-while-structure",
                    patterns: ["do {body-block} while (<expression>);"],
                    crossLine: true
                },
                {
                    name: "No sense code",
                    patterns: ["<no-sense>"],
                    dictionary: {
                        "no-sense": {
                            patterns:["/[_a-zA-Z0-9]+\\s*\\r\\n/"]
                        }
                    }
                }
            ],
            onMatched: onBlockMatch,
            onCompletion: (match) =>
            {
                let context = match.matchedScope.state as CgContext;
                if (match.patternName === "no-sense")
                    return cgBuildInKeywordsCompletion
                        .concat(cgBuildInTypesCompletion)
                        .concat(toCgVariableCompletions(context.getAllVariables()))
                        .concat(toCgFunctionCompletions(context.global.functions));
                return [];
            }
        }
    }
};

export default grammarShaderLab;