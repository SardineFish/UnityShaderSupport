import { CgGlobalContext } from "./grammar-cg";

const booleanValue: string[] = ["True", "False"];
const subShaderTags: Dictionary<string[]> = {
    "Queue": ["Background", "Geometry", "AlphaTest", "Transparent", "Overlay"],
    "RenderType": ["Opaque", "Transparent", "TransparentCutout", "Background", "Overlay", "TreeOpaque", "TreeTransparentCutout", "TreeBillboard", "Grass", "GrassBillboard"];
    "RequireOptions": ["SoftVegetation"],
    "DisableBatching": ["True", "False", "LODFading"],
    "ForceNoShadowCasting": booleanValue,
    "IgnoreProjector": booleanValue,
    "CanUseSpriteAtlas": booleanValue,
    "PreviewType": ["Sphere", "Plane", "Skybod", "Cube"]
};
const passTags: Dictionary<string[]> = {
    "LightMode": ["Always", "ForwardBase", "ForwardAdd", "Deferred", "ShadowCaster", "PrepassBase", "PrepassFinal", "Vertex", "VertexLMRGBM", "VertexLM"];
    "PassFlags": ["OnlyDirectional"],
    "RequireOptions": ["SoftVegetation"]
};
const renderSetups: Dictionary<string[]> = {
    "Cull": ["Back", "Front", "Off"],
    "ZTest": ["Less ", "Greater", "LEqual", "GEqual", "Equal", "NotEqual ", "Always"],
    "ZWrite": ["On", "Off"],
    "Blend": ["SourceBlendMode DestBlendMode", "AlphaSourceBlendMode AlphaDestBlendMode"],
    "ColorMask": ["R", "G", "B", "A", "RGBA", "0"],
    "Offset": ["OffsetFactor", "OffsetUnits"],
    "Lighting": ["On", "Off"],
    "Material": [],
    "SeparateSpecular": ["On", "Off"],
    "Color": [],
    "ColorMaterial": ["AmbientAndDiffuse", "Emission"],
    "AlphaTest": ["Less", "Greater", "LEqual", "GEqual", "Equal", "NotEqual", "Always"];
    "SetTexture": [],
    "Fog": [],
    "Material": [],
    "SetTexture":[]
};

class Dictionary<TValue>
{
    [key: string]: TValue;
}
function getKeys<T>(dict: Dictionary<T>):string[]
{
    let keys: string[] = [];
    for (const key in dict) {
        if (dict.hasOwnProperty(key)) {
            keys.push(key);
        }
    }
    return keys;
}

class Shader
{
    name: string;
    properties: ShaderProperty[] = [];
    subShaders: SubShader[] = [];
    fallback: string;
    constructor(name: string)
    {
        this.name = name;
    }
    addProperty(prop: ShaderProperty)
    {
        this.properties.push(prop);
        prop.shader = this;
    }
    addSubShader(subShader: SubShader)
    {
        this.subShaders.push(subShader);
        subShader.shader = this;
    }
}
class ShaderProperty
{
    shader: Shader;
    identifier: string;
    displayName: string;
    type: string;
    defaultValue: string;
    constructor(id: string, displayName: string, type: string, defaultValue: string)
    {
        this.identifier = id;
        this.displayName = displayName;
        this.type = type;
        this.defaultValue = defaultValue;
    }
    toString()
    {
        return `${this.identifier} ("${this.displayName}", ${this.type}) = ${this.defaultValue}`;
    }
}
class SubShader
{
    shader: Shader;
    tags: Tag[] = [];
    renderSetups: RenderSetup[] = [];
    passes: Pass[] = [];
    cgCode: CgGlobalContext;
    addTag(tag: Tag)
    {
        this.tags.push(tag);
    }
    addPass(pass: Pass)
    {
        this.passes.push(pass);
        pass.subShader = this;
    }
    addRenderSetup(renderSetup: RenderSetup)
    {
        this.renderSetups.push(renderSetup);
    }
    setCgCode(cg: CgGlobalContext)
    {
        this.cgCode = cg;
        cg.shader = this.shader;
    }
}
class Pass
{
    subShader: SubShader;
    tags: Tag[] = [];
    renderSetups: RenderSetup[] = [];
    cgCode: CgGlobalContext;
    addTag(tag: Tag)
    {
        this.tags.push(tag);
    }
    addRenderSetup(renderSetup: RenderSetup)
    {
        this.renderSetups.push(renderSetup);
    }
    setCgCode(cg: CgGlobalContext)
    {
        this.cgCode = cg;
        cg.shader = this.subShader.shader;
    }
}
class KeyValuePare<TKey,TValue>
{
    key: TKey;
    value: TValue;
    constructor(key: TKey, value: TValue)
    {
        this.key = key;
        this.value = value;
    }
}
class Tag extends KeyValuePare<string, string>
{
    get tagName() { return this.key; }
    set tagName(value) { this.key = value;}
}
class RenderSetup extends KeyValuePare<string, string>
{
    get stateName() { return this.key; }
    set stateName(value) { this.key = value; }
}
export
{
    Shader,
    SubShader,
    ShaderProperty,
    Pass,
    Tag,
    RenderSetup,
    subShaderTags,
    passTags,
    renderSetups,
    getKeys
}