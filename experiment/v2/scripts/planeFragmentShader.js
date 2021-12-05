var planeFragmentShader =  `
precision highp float;
precision highp sampler2D;

#define COLORMODE_FULL 0
#define COLORMODE_DEPTH 1
#define COLORMODE_BASE 2
#define COLORMODE_ILLUMINATION 3
#define COLORMODE_BLACK 4

uniform sampler2D mpi_a;
uniform sampler2D mpi_c;

//TODO: CODEGEN - basis and koeff
uniform sampler2D mpi_b0;
uniform sampler2D mpi_b1;
uniform sampler2D mpi_k0;
uniform sampler2D mpi_k1;
uniform sampler2D mpi_k2;
uniform sampler2D mpi_k3;
uniform sampler2D mpi_k4;
uniform sampler2D mpi_k5;

uniform int alpha_ch;
uniform int color_mode;
uniform float ground;
uniform float plane_id;
uniform float basis_angle_limit; //clamp basis with a spherical angle
uniform float camera_radius;
uniform float num_planes;
uniform mat3 basis_align;

varying vec2 vMpiTextureLoc;
varying vec3 vCoord;    


vec3 clampViewingDirection(vec3 direction)
{
    //convert from cartesian coordinates to spherical coordinate 
    vec3 viewing = -direction; //need to flip because viewing angle is upside-down sphere
    float x = viewing.x;
    float y = viewing.z; //OpenGL is y-up while we would like to use z-up to match wiki version.
    float z = viewing.y; 
    // find phi and theta, note: we use wiki convention here
    // @see https://en.wikipedia.org/wiki/Spherical_coordinate_system
    float phi = atan(y,x);
    float theta = atan(sqrt(x*x+y*y),z);
    theta = clamp(theta, 0.0, basis_angle_limit);
    //convert back to cartesian coordinate
    x = cos(phi) * sin(theta);
    y = sin(phi) * cos(theta);
    z = cos(theta);
    // convert from z-up to y up
    viewing.x = x;
    viewing.y = z;
    viewing.z = y; 
    //flip it back to upside down
    direction = -viewing;
    return direction;
}

vec3 getViewingDirection()
{
    // viewing direction is a direction from point in 3D to camera postion
    vec3 viewing = normalize(vCoord - cameraPosition);
    viewing = clampViewingDirection(viewing);
    return viewing;
}

vec2 getBasisLookup()
{
    vec3 viewing = getViewingDirection();
    viewing.yz = -viewing.yz; // since we train in OpenCV convension, we need to flip yz to keep viewing direction as the same.
    viewing =  basis_align * viewing;
    viewing = (viewing + 1.0) / 2.0; //shift value from [-1.0, 1.0] to [0.0, 1.0]
    viewing.y = 1.0 - viewing.y; //need to flip y axis, since threejs/webgl flip the image
    return viewing.xy;
}
float getAlpha()
{
    vec4 alphas = texture2D(mpi_a, vMpiTextureLoc);
    return alphas[alpha_ch];
}

vec3 getBaseColor()
{
    vec4 baseColor = texture2D(mpi_c, vMpiTextureLoc);
    return baseColor.rgb;
}

vec3 getIllumination()
{    
    //Due to GLSL3 specification, we might need to have weird implementation each getIllumination manuelly
    //TODO: convert this code to javascript automatic code generation
    vec3 o = vec3(0.0, 0.0, 0.0);

    vec4 k[6], b[2];

    // lookup coeff
    k[0] = texture2D(mpi_k0, vMpiTextureLoc);
    k[1] = texture2D(mpi_k1, vMpiTextureLoc);
    k[2] = texture2D(mpi_k2, vMpiTextureLoc);
    k[3] = texture2D(mpi_k3, vMpiTextureLoc);
    k[4] = texture2D(mpi_k4, vMpiTextureLoc);
    k[5] = texture2D(mpi_k5, vMpiTextureLoc);

    //scale coeff from [0,1] to [-1,1];
    for(int i = 0; i < 6; i++) k[i] = k[i] * 2.0 - 1.0;
        
    // lookup basis
    vec2 viewingLookup = getBasisLookup();
    b[0] = texture2D(mpi_b0, viewingLookup);
    b[1] = texture2D(mpi_b1, viewingLookup);

    //scale basis from [0,1] tp [-1,1]
    for(int i = 0; i < 2; i++) b[i] = b[i] * 2.0 - 1.0;
    
    //for loop here will allocate ton of memory, this one is a lot smaller.
    o[0] = b[0][0] * k[0][0] + b[0][1] * k[0][3] + b[0][2] * k[1][2] + b[0][3] * k[2][1] + b[1][0] * k[3][0] + b[1][1] * k[3][3] + b[1][2] * k[4][2] + b[1][3] * k[5][1];
    o[1] = b[0][0] * k[0][1] + b[0][1] * k[1][0] + b[0][2] * k[1][3] + b[0][3] * k[2][2] + b[1][0] * k[3][1] + b[1][1] * k[4][0] + b[1][2] * k[4][3] + b[1][3] * k[5][2];
    o[2] = b[0][0] * k[0][2] + b[0][1] * k[1][1] + b[0][2] * k[2][0] + b[0][3] * k[2][3] + b[1][0] * k[3][2] + b[1][1] * k[4][1] + b[1][2] * k[5][0] + b[1][3] * k[5][3];
    return o;
}

vec3 getColor(){
    vec3 color = vec3(0.0,0.0,0.0);
    if(color_mode == COLORMODE_DEPTH){
        float depth_color = (plane_id / num_planes);
        color = vec3(depth_color,depth_color,depth_color);
    }else if(color_mode == COLORMODE_BASE){
        color = getBaseColor();
    }else if(color_mode == COLORMODE_ILLUMINATION){
        color = clamp((getIllumination() + 1.0) / 2.0, 0.0, 1.0);
    }else if(color_mode == COLORMODE_BLACK){
        color = vec3(0.0,0.0,0.0);
    }else{
        color = getBaseColor();
        color = clamp(color.rgb + getIllumination(), 0.0, 1.0);
    }
    return color;
}

bool isBelowTheGround()
{
    return vCoord.y < ground;
}

void main(void)
{
    vec4 color = vec4(0.0,0.0,0.0,0.0);
    color.a = getAlpha(); 

    //filter out ground_plane
    if(isBelowTheGround()){
        color.a = 0.0;
    }

    // reduce texture call when no alpha to display
    if(color.a > 0.0){ 
        color.rgb = getColor();
    }
    gl_FragColor= color;    
}
`;