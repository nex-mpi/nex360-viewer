var planeVertexShader =  `
precision highp float;

uniform float mpi_ratio_width;
uniform float mpi_ratio_height;

varying vec2 vMpiTextureLoc;
varying vec3 vCoord; 
    
void main()
{   
    // avoid black border on right and bottom
    // may occur when use DDS format or need texture to be power of 2
    vMpiTextureLoc.x = uv.x * mpi_ratio_width;
    vMpiTextureLoc.y = uv.y * mpi_ratio_height;
    
    // coordinate in world space for calculate viewing angle
    vec4 modelPosition = modelMatrix * vec4( position, 1.0);
    vCoord = (modelPosition.xyz / modelPosition.w);

    // project to screen
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
}
`;