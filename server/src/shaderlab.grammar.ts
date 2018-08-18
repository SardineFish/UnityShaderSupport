import { Scope, ScopeDeclare } from "./grammar";

class SourceShaderLab extends Scope
{
    scopes: Scope[] = [];
    startOffset: number = 0;
    endOffset: number = 0;
    start: RegExp = /Shader.*{/i;
    end: RegExp = /}/;

}
class ShaderScope extends Scope
{

}
class SubShaderScope extends Scope
{

}
class PassScope extends Scope
{

}
class TagScope extends Scope
{

}
class PropertiesScope extends Scope
{

}
class CgScope extends Scope
{

}
class CgCodeScope extends Scope
{

}
class StructScope extends Scope
{

}


const blockScope: ScopeDeclare = {
    name: "Block",
    begin: /{/,
    end: /}/,
    scopeType: Scope
};
const tagScope: ScopeDeclare = {
    name: "Tags",
    begin: /Tags.*{/i,
    end: /}/,
    scopeType: TagScope
};
const cgScope: ScopeDeclare = {
    name: "Cg Program",
    begin: /CGPROGRAM/,
    end: /ENDCG/,
    scopeType: CgCodeScope
};
const passDeclare: ScopeDeclare = {
    name: "Pass",
    begin: /Pass.*{/i,
    end: /}/,
    scopeType: PassScope,
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
            scopeType: ShaderScope,
            scopes: [
                {
                    name: "Properties",
                    begin: /Properties.*{/i,
                    end: /}/,
                    scopeType: PropertiesScope,
                    scopes: [{
                        name: "Block Value",
                        begin: /{/,
                        end: /}/,
                        scopeType: Scope
                    }]
                },
                {
                    name: "SubShader",
                    begin: /SubShader.*{/i,
                    end: /}/,
                    scopeType: SubShaderScope,
                    scopes: [
                        tagScope,
                        passDeclare,
                        cgScope,
                        blockScope
                    ]
                }
            ]
        }
    ],
    scopeType: SourceShaderLab
}

export { sourceShaderLab, SourceShaderLab };