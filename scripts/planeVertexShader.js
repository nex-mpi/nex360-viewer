var planeVertexShader =  `
varying vec2 vUv;
varying vec3 vCoord; 
    
void main()
{
    vUv = uv;
        
    vec4 modelPosition = modelMatrix * vec4( position, 1.0);
    vCoord = (modelPosition.xyz / modelPosition.w);

    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
}
`;