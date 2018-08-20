import { DiagnosticSeverity, Diagnostic } from "vscode-languageserver";
import { ScopeDeclare, GrammarDeclare, GrammarPattern, GrammarScope, include } from "./grammar";
/*class SourceShaderLab extends Scope
{
    scopes: Scope[] = [];
    startOffset: number = 0;
    endOffset: number = 0;
    start: RegExp = /Shader.*{/i;
    end: RegExp = /}/;

}*/
const DiagnosticSource: string = "ShaderLab Intellicense";
const blockScope: ScopeDeclare = {
    name: "Block",
    begin: /{/,
    end: /}/
};
const tagScope: ScopeDeclare = {
    name: "Tags",
    begin: /Tags.*{/i,
    end: /}/
};
const cgScope: ScopeDeclare = {
    name: "Cg Program",
    begin: /CGPROGRAM/,
    end: /ENDCG/
};
const passDeclare: ScopeDeclare = {
    name: "Pass",
    begin: /Pass.*{/i,
    end: /}/,
    scopes: [
        tagScope,
        cgScope,
        blockScope
    ]
};
const sourceShaderLab: ScopeDeclare = {
    scopes: [
        {
            name: "ShaderBlock",
            begin: /Shader.*{/i,
            end: /}/,
            patterns: [
                {
                    match: /(Shader)\s+(\".*\")?\s*{/i,
                    captures: {
                        "1": {
                            unmatched: {
                                range: null,
                                severity: DiagnosticSeverity.Error,
                                message: "Shader name required.",
                                source: DiagnosticSource
                            }
                        }
                    }
                },
                {
                    match: /Properties\s*$/i,
                    diagnostic: {
                        range: null,
                        severity: DiagnosticSeverity.Error,
                        message: "Missing {",
                        source: DiagnosticSource
                    }
                }
            ],
            scopes: [
                {
                    name: "Properties",
                    begin: /Properties.*{/i,
                    end: /}/,
                    scopes: [{
                        name: "Block Value",
                        begin: /{/,
                        end: /}/,
                    }]
                },
                {
                    name: "SubShader",
                    begin: /SubShader.*{/i,
                    end: /}/,
                    scopes: [
                        tagScope,
                        passDeclare,
                        cgScope,
                        blockScope
                    ]
                }
            ]
        }
    ]
}


const grammarShaderLab: GrammarDeclare = {
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
        "propertyType": {
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
                        include("tagsPattern"),
                        include("renderSetupPattern"),
                        include("pass"),
                        include("cgProgram")
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
                        include("tagsPattern"),
                        include("renderSetupPattern"),
                        include("cgProgram")
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
                        include("variableDeclare"),
                        include("functionDefinition")
                    ]
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
            }
        },
        "variableDeclare": {
            name: "Variable Declare",
            patterns: ["<type> < > <name> [:<semantics>] [= <expression>];"],
            dictionary: {
                "type": GrammarPattern.Identifier,
                "name": GrammarPattern.Identifier,
                "semantics": GrammarPattern.Identifier
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
                include("variableDeclare"),
                {
                    name: "Statement",
                    patterns: ["<expression>;"]
                },
                {
                    name: "If",
                    patterns: ["if (<expression>) {body-block} "]
                },
                {
                    name: "For Loop",
                    patterns: ["for (<expression>;<expression>;<expression>) {body-block}"]
                },
                {
                    name: "While Loop",
                    patterns: ["while (<expression>) {body-block}"]
                },
                {
                    name: "Do-While Loop",
                    patterns: ["do {body-block} while (<expression>);"],
                    crossLine: true
                }
            ]
        }
    }
};

export default grammarShaderLab;