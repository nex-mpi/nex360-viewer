var planeFragmentShader =  `
precision highp float;
precision highp sampler2D;

#define EPSILON 0.000000001
#define BASIS_STEREO_RANGE 1.3628
#define BASIS_WIDTH 800.0

uniform sampler2D mpi_a;
uniform sampler2D mpi_c;
uniform sampler2D mpi_k1;
uniform sampler2D mpi_k2;
uniform sampler2D mpi_k3;
uniform sampler2D mpi_k4;
uniform sampler2D mpi_k5;
uniform sampler2D mpi_k6;
uniform sampler2D mpi_b0;
uniform sampler2D mpi_b1;

uniform int alpha_ch;

varying vec2 vUv;
varying vec3 vCoord; 

vec2 stereographicProjection(vec3 point)
{
    vec2 ret;
    ret.x = ret.x / (1.0 - point.z + EPSILON);
    ret.y = ret.y / (1.0 - point.z + EPSILON);
    return ret;
}   

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
    // coeffiecent and basis in eq3 of NeX paper.
    vec3 k1,k2,k3,k4,k5,k6,k7,k8;
    float h1,h2,h3,h4,h5,h6,h7,h8;

    //query data from coeffient
    vec4 q1,q2,q3,q4,q5,q6;    
    
    q1 = texture2D(mpi_k1, vUv);
    q2 = texture2D(mpi_k2, vUv);
    q3 = texture2D(mpi_k3, vUv);
    q4 = texture2D(mpi_k4, vUv);
    q5 = texture2D(mpi_k5, vUv);
    q6 = texture2D(mpi_k6, vUv);


    //rescale coefficient to [-1, 1]
    q1 = (q1 * 2.0) - 1.0;
    q2 = (q2 * 2.0) - 1.0;
    q3 = (q3 * 2.0) - 1.0;
    q4 = (q4 * 2.0) - 1.0;
    q5 = (q5 * 2.0) - 1.0;
    q6 = (q6 * 2.0) - 1.0;

    // make 6 query into 8 coefficent
    k1 = q1.rgb;
    k2 = q2.rgb;
    k3 = q3.rgb;
    k4 = q4.rgb;
    k5 = q5.rgb;
    k6 = q6.rgb;
    k7.r = q1.a;
    k7.g = q2.a;
    k7.b = q3.a;
    k8.r = q4.a;
    k8.g = q5.a;
    k8.b = q6.a;

    vec3 basisViewing = getViewingAngle();
    float divder = 1.0 - basisViewing.z + EPSILON;
    vec2 colorStereo;
    colorStereo.x = basisViewing.x / divder;
    colorStereo.y = basisViewing.y / divder;
    colorStereo.xy = clamp(colorStereo.xy, -BASIS_STEREO_RANGE, BASIS_STEREO_RANGE);
    colorStereo.xy = colorStereo.xy / BASIS_STEREO_RANGE;
    colorStereo.xy = (colorStereo.xy + 1.0) / 2.0;

    //un align cornder
    colorStereo = colorStereo * (BASIS_WIDTH - 1.0) / BASIS_WIDTH + 0.5 / BASIS_WIDTH;
    colorStereo = clamp(colorStereo, 0.0, 1.0);

    //flip-Y axis
    colorStereo.y = 1.0 - colorStereo.y; 

    //lookup basis
    vec4 qb0 = texture2D(mpi_b0, colorStereo);
    vec4 qb1 = texture2D(mpi_b1, colorStereo);

    // rescale basis to -1,1
    qb0 = (qb0 * 2.0) - 1.0;
    qb1 = (qb1 * 2.0) - 1.0;
    

    // make 2 query into 8 basis
    float b1,b2,b3,b4,b5,b6,b7,b8;
    b1 = qb0.r;
    b2 = qb0.g;
    b3 = qb0.b;
    b4 = qb0.a;
    b5 = qb1.r;
    b6 = qb1.g;
    b7 = qb1.b;
    b8 = qb1.a;
    

    //combine coefficent and basisto get illumination
    vec3 illumination = vec3(0.0, 0.0, 0.0);
    illumination = (k1*b1) + (k2*b2) + (k3*b3) + (k4 * b4) + (k5 * b5) + (k6 * b6) + (k7 * b7) + (k8 * b8);
    return illumination;
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