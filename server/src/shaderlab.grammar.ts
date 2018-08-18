import { ScopeDeclare } from "./grammar";
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

export default sourceShaderLab;