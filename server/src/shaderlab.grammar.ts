import { ScopeDeclare, GrammarDeclare, GrammarPattern } from "./grammar";
import { DiagnosticSeverity, Diagnostic } from "vscode-languageserver";

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
        "property": GrammarPattern.String,
        "value": GrammarPattern.String
    }
};
const cgProgram: GrammarPattern = {
    name: "Cg Program",
    patterns: ["CGPROGRAM {cgProgram}"],
    scopes: {
        "cgProgram": {
            begin: " ",
            end: "ENDCG",
            patterns: [
                
            ]
        }
    }
};
const pass: GrammarPattern = {
    name: "Pass",
    patterns: ["Pass {pass}"],
    caseInsensitive: true,
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
            patterns: ["Shader <shaderName> {shaderScope}"],
            caseInsensitive: true,
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

export default sourceShaderLab;