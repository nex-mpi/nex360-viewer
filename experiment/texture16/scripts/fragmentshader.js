var fragmentShader =  `
#ifdef GL_ES
precision highp float;
#endif
#define EPSILON 0.000000001

uniform sampler2D mpi_a;
uniform sampler2D mpi_b;
uniform sampler2D mpi_c;
uniform sampler2D mpi_coeff;
uniform int num_col;
uniform int plane_id;
uniform int num_layers;
uniform int num_sublayers;
uniform int num_basis;
uniform float fov_tan;
uniform float depth;

varying vec2 vUv;
varying vec3 vCoord; 

int mod_val(int x, int y)
{
    //Module (somehow, glsl mod cannot find the overload)
    float nx = float(x);
    float ny = float(y);
    float tail = nx / ny;
    return x - int(ny * floor( tail));
}

int layerId()
{
    return plane_id / num_sublayers;
}

vec2 uv2lookup(int id, int total_id)
{
    //convert planeUV into the UV on 
    vec2 loc;
    float nc = float(num_col);
    float nr = ceil(float(total_id) /float(num_col));
    //need to flip row_id since uv map is 1 at top and 0 at bottom
    float row_id = nr - float(id / num_col) - 1.0;
    float col_id = float(mod_val(id, num_col));
    loc[0] = vUv[0] / nc;
    loc[1] = vUv[1] / nr;
    loc[0] = loc[0] + (col_id /nc);
    loc[1] = loc[1] + (row_id / nr); 
    return loc;
}

int alphaRgbId()
{
    // get the plane id of alpha 
    // alpha is store first 64 plane in R then another 64 in G and B.
    int period = (num_layers * num_sublayers) / 3;
    return mod_val(plane_id, period);
}

float getAlpha(vec4 rgba)
{
    int period = (num_layers * num_sublayers) / 3;
    int id = plane_id / period;
    if(id == 0) return rgba.r;
    if(id == 1) return rgba.g;
    return rgba.b;
}

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

float getBasis(vec3 viewing, int basis_id)
{
    float basis;
    vec2 lookup = stereographicProjection(viewing);
    lookup = (lookup + 1.0) / 2.0; //rescale to [0,1];
    lookup = clamp(lookup, 0.0, 1.0); //sterographic is unbound.
    lookup.x /= 4.0; //scale to 4 basis block
    lookup.y = - lookup.y; //uv map axis y is up, but in mpi_b Y is down
    if(viewing.z <= 0.0) lookup.x += 0.5;
    if(basis_id >= 4) lookup.x += 0.25;
    vec4 raw = texture2D(mpi_b, lookup);
    if(basis_id == 0 || basis_id == 4) basis = raw.r;
    if(basis_id == 1 || basis_id == 5) basis = raw.g;
    if(basis_id == 2 || basis_id == 6) basis = raw.b;
    if(basis_id == 3 || basis_id == 7) basis = raw.a;
    //basis = 0.0;
    basis = (basis * 2.0) - 1.0;
    return basis;
}

vec4 lookupBasis(vec3 viewing, int basis_id)
{
    vec2 lookup = stereographicProjection(viewing);
    lookup = (lookup + 1.0) / 2.0; //rescale to [0,1];
    lookup = clamp(lookup, 0.0, 1.0); //sterographic is unbound.
    lookup.x /= 4.0; //scale to 4 basis block
    lookup.y = - lookup.y; //uv map axis y is up, but in mpi_b Y is down
    if(viewing.z <= 0.0) lookup.x += 0.5;
    if(basis_id >= 4) lookup.x += 0.25;
    vec4 raw = texture2D(mpi_b, lookup);
    return raw;
}

float parseBasis(vec4 raw,int basis_id)
{
    float basis;
    if(basis_id == 0 || basis_id == 4) basis = raw.r;
    if(basis_id == 1 || basis_id == 5) basis = raw.g;
    if(basis_id == 2 || basis_id == 6) basis = raw.b;
    if(basis_id == 3 || basis_id == 7) basis = raw.a;
    //basis = 0.0;
    basis = (basis * 2.0) - 1.0;
    return basis;
}

vec3 getIllumination()
{
    vec3 viewing = getViewingAngle();
    vec3 illumination;
    int total_coeff = num_basis * num_layers;
    int layer_id = layerId();
    vec4 basis0 = lookupBasis(viewing, 0);
    vec4 basis4 = lookupBasis(viewing, 4);
    float basis;
    for(int i = 0; i < num_basis; i++)
    {
        vec4 coeff = texture2D(mpi_coeff, uv2lookup((i * num_layers) + layer_id, total_coeff));
        coeff = (coeff * 2.0) - 1.0;
        if(i < 4){
            basis = parseBasis(basis0, i);
        }else{
            basis = parseBasis(basis4, i);
        }
        illumination = illumination + (coeff.rgb * basis);
    }
    return illumination;
}

void main(void)
{
    
    vec3 illumination = getIllumination();
    vec4 color = texture2D(mpi_c, uv2lookup(layerId(), num_layers));   
    color.rgb = color.rgb + illumination;
    color = clamp(color, 0.0, 1.0);

    /*
    vec3 viewing = getViewingAngle();
    viewing = (viewing + 1.0) / 2.0;
    vec4 color;
    color.rgb = viewing;
    */
    

    int total_plane = num_layers * num_sublayers;
    float alpha = texture2D(mpi_a, uv2lookup(plane_id, total_plane)).r;
    color.a = alpha;
    gl_FragColor= vec4(color);
}
`;