var planeFragmentShader =  `
precision highp float;
precision highp sampler2D;

#define EPSILON 0.000000001
#define BASIS_WIDTH 800.0
#define NUM_B 2
#define NUM_K 6

uniform sampler2D mpi_a;
uniform sampler2D mpi_c;
uniform sampler2D mpi_b[NUM_B];
uniform sampler2D mpi_k[NUM_K];

uniform int alpha_ch;
uniform float plane_id;
uniform mat3 basis_align;

varying vec2 vUv;
varying vec3 vCoord;    

vec3 getViewingAngle()
{
    // viewing direction is a direction from point in 3D to camera postion
    vec3 viewing = normalize(vCoord - cameraPosition);
    return viewing;
}

float getAlpha()
{
    vec4 alphas = texture2D(mpi_a, vUv);
    return alphas[alpha_ch];
}

vec3 getBaseColor()
{
    vec4 baseColor = texture2D(mpi_c, vUv);
    return baseColor.rgb;
}

vec3 getIllumination()
{    
    //Due to GLSL3 specification, we might need to have weird implementation each getIllumination manuelly
    //TODO: convert this code to javascript automatic code generation
    vec3 o = vec3(0.0, 0.0, 0.0);
    vec4 k[NUM_K], b[NUM_B];
    
    // lookup coeff
    k[0] = texture2D(mpi_k[0], vUv);
    k[1] = texture2D(mpi_k[1], vUv);
    k[2] = texture2D(mpi_k[2], vUv);
    k[3] = texture2D(mpi_k[3], vUv);
    k[4] = texture2D(mpi_k[4], vUv);
    k[5] = texture2D(mpi_k[5], vUv);
    
    // lookup basis
    b[0] = texture2D(mpi_b[0], vUv);
    b[1] = texture2D(mpi_b[1], vUv);
        

    //calculate basis weight
    o[0] += b[0][0] * k[0][0];
    o[1] += b[0][0] * k[0][1];
    o[2] += b[0][0] * k[0][2];
    o[0] += b[0][1] * k[0][3];
    o[1] += b[0][1] * k[1][0];
    o[2] += b[0][1] * k[1][1];
    o[0] += b[0][2] * k[1][2];
    o[1] += b[0][2] * k[1][3];
    o[2] += b[0][2] * k[2][0];
    o[0] += b[0][3] * k[2][1];
    o[1] += b[0][3] * k[2][2];
    o[2] += b[0][3] * k[2][3];
    o[0] += b[1][0] * k[3][0];
    o[1] += b[1][0] * k[3][1];
    o[2] += b[1][0] * k[3][2];
    o[0] += b[1][1] * k[3][3];
    o[1] += b[1][1] * k[4][0];
    o[2] += b[1][1] * k[4][1];
    o[0] += b[1][2] * k[4][2];
    o[1] += b[1][2] * k[4][3];
    o[2] += b[1][2] * k[5][0];
    o[0] += b[1][3] * k[5][1];
    o[1] += b[1][3] * k[5][2];
    o[2] += b[1][3] * k[5][3];
    return o;
}


void main(void)
{
    vec4 color = vec4(0.0,0.0,0.0,0.0);
    color.a = getAlpha();
    // reduce texture call when no alpha to display
    if(color.a > 0.0){ 
        color.rgb = getBaseColor();
        color.rgb = clamp(color.rgb + getIllumination(), 0.0, 1.0);
    }    
    gl_FragColor= color;    
}
`;