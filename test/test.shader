Shader "Shader" {
    SubShader {
        Tags { "RenderType"="Opaque" "Queue"="Geometry"}
        ColorMask 0
        ZWrite Off

        Stencil
        {
Ref 1
Comp always
Pass replace
}
Pass {
cull Back

}
    }
}