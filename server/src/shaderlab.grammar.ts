import { DiagnosticSeverity, Diagnostic } from "vscode-languageserver";
import { ScopeDeclare, GrammarDeclare, GrammarPattern } from "./grammar";
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
                                range:null,
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


const propertyType: GrammarPattern = {
    name: "Property Type",
    patterns: ["<typeName>[(<number>[, <number> ...])]"],
    dictionary: {
        "typeName": {
            patterns: [
                "/[_a-zA-Z0-9]+/"
            ]
        }
    }
};
const propertyValue: GrammarPattern = {
    name: "Property Value",
    patterns: [
        "<number>",
        "<string> \\{[<any>]\\}",
        "(<number>, <number>, <number>, <number>)"
    ]
};
const propertiesPattern: GrammarPattern =
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
                    patterns: ["<identifier> (<displayName>, <propType>) = <defaultValue>"],
                    dictionary: {
                        "displayName": GrammarPattern.String,
                        "propType": propertyType,
                        "defaultValue": propertyValue
                    }
                }
            ]
        }
    }
};
const tagsPattern: GrammarPattern = {
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
};
const renderSetupPattern: GrammarPattern = {
    name: "Render Setup",
    patterns: ["<property> < > <value>"],
    dictionary: {
        "property": GrammarPattern.Identifier,
        "value": {
            name:"Render Setup Value",
            patterns: ["<identifier>", "<string>", "<number>"]
        }
    }
};
const variableDeclare: GrammarPattern = {
    name: "Variable Declare",
    patterns: ["<type> < > <name> [:<semantics>];"],
    dictionary: {
        "type": { patterns: ["<identifier>"] },
        "name": { patterns: ["<identifier>"] },
        "semantics": { patterns: ["<identifier>"] }
    }
}
const cgProgram: GrammarPattern = {
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
                variableDeclare
            ]
        }
    }
};
const pass: GrammarPattern = {
    name: "Pass",
    patterns: ["Pass {pass}"],
    caseInsensitive: true,
    crossLine: true,
    scopes: {
        "pass": {
            begin: "{",
            end: "}",
            patterns: [
                tagsPattern,
                renderSetupPattern,
                cgProgram
            ]
        }
    }
};
const subShaderPattern: GrammarPattern = {
    name: "SubShader",
    patterns: ["SubShader {subShaderScope}"],
    caseInsensitive: true,
    crossLine: true,
    scopes: {
        "subShaderScope": {
            begin: "{",
            end: "}",
            patterns: [
                tagsPattern,
                renderSetupPattern,
                pass,
                cgProgram
            ]
        }
    }
};

const grammarShaderLab: GrammarDeclare = {
    stringDelimiter:["\""],
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
                        propertiesPattern,
                        subShaderPattern
                    ]
                }
            }
        }
    ],
};

export default grammarShaderLab;