// NeX360 viewer

// variable list for  Three.js glsl. 
// @see https://stackoverflow.com/questions/15663859/threejs-predefined-shader-attributes-uniforms
/*
15: uniform mat4 modelViewMatrix;
16: uniform mat4 projectionMatrix;
17: uniform mat4 viewMatrix;
18: uniform mat3 normalMatrix;
19: uniform vec3 cameraPosition;
20: uniform bool isOrthographic;
27: attribute vec3 position;
28: attribute vec3 normal;
29: attribute vec2 uv;
*/
let planeVshader = `
varying vec2 vUv;
varying vec3 vCoord; 

void main()
{
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vec4 modelPosition = modelMatrix * vec4( position, 1.0);
    vCoord = (modelPosition.xyz / modelPosition.w);
    gl_Position = projectionMatrix * mvPosition;
}
`

let planeFshader = `
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

vec3 getIllumination()
{
    vec3 viewing = getViewingAngle();
    vec3 illumination;
    int total_coeff = num_basis * num_layers;
    int layer_id = layerId();
    for(int i = 0; i < num_basis; i++)
    {
        vec4 coeff = texture2D(mpi_coeff, uv2lookup((i * num_layers) + layer_id, total_coeff));
        coeff = (coeff * 2.0) - 1.0;
        float basis = getBasis(viewing, i);
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
`


class NeXviewerApp{
    constructor(cfg){
        this.cfg = cfg
        this.intial();
        
    }
    intial(){
        // intial stat
        this.stats = new Stats();
        this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
        document.body.appendChild(this.stats.dom);

        // inital global thing
        this.scene = new THREE.Scene();
        let ratio = window.innerWidth / window.innerHeight
        let c2w_arr = this.cfg.c2ws[0];
        console.log(c2w_arr);
        console.log(c2w_arr[0][0]);
        console.log(c2w_arr[0][1]);
        console.log(c2w_arr[0][2]);

        let c2w = new THREE.Matrix4();
        //set is row major, internal is column major
        c2w.set(
            c2w_arr[0][0], c2w_arr[0][1], c2w_arr[0][2], c2w_arr[0][3],
            c2w_arr[1][0], c2w_arr[1][1], c2w_arr[1][2], c2w_arr[1][3],
            c2w_arr[2][0], c2w_arr[2][1], c2w_arr[2][2], c2w_arr[2][3],
            c2w_arr[3][0], c2w_arr[3][1], c2w_arr[3][2], c2w_arr[3][3] 
        );
        let w2c = c2w.clone().invert();

        let camMat = new THREE.Matrix4();
        //set is row major, internal is column major
        camMat.set(
            c2w_arr[0][0], -c2w_arr[0][1], -c2w_arr[0][2], c2w_arr[0][3],
            c2w_arr[1][0], -c2w_arr[1][1], -c2w_arr[1][2], c2w_arr[1][3],
            c2w_arr[2][0], -c2w_arr[2][1], -c2w_arr[2][2], c2w_arr[2][3],
            c2w_arr[3][0], -c2w_arr[3][1], -c2w_arr[3][2], c2w_arr[3][3] 
        );
        /*
        let w2c = c2w.invert();
        console.log(w2c);
        */

        this.camera = new THREE.PerspectiveCamera(this.cfg.fov_degree, ratio, 0.1, 1000 );
        this.renderer = new THREE.WebGLRenderer({ alpha: true }); 
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.setClearColor( 0xffffff, 1 ); //change to white background
        document.body.appendChild(this.renderer.domElement );       
        // prepare scene
        /*
        const originBox = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const originMat = new THREE.MeshBasicMaterial( { color: 0xff0000, side: THREE.DoubleSide} );
        let cube = new THREE.Mesh( originBox, originMat )
        this.scene.add(cube);
        */

        var texloader = new THREE.TextureLoader();
        var tex = {
            "a": texloader.load( "data/lego/mpi00_a_v2.png" ), 
            "b": texloader.load( "data/lego/mpi_b.png" ),
            "c": texloader.load( "data/lego/mpi00_c.png" ),
            "mpi_coeff": texloader.load( "data/lego/mpi00_coeff8.png" )
        };
        // load texture;
        //this.camera.position.z = 4; // TODO: support proper position
        //to rotate the same as c2w, need to disable  orbitcontrol update and enable this line
        this.camera.applyMatrix4(c2w); 
        this.mpis = {
            0:{
                'planes':[]
            },
            1:{
                'planes':[]
            },
            2:{
                'planes':[]
            }
        }
        let fov_tan = Math.tan(this.cfg.fov_radian / 2.0);
        for(let i = 0; i < this.cfg.planes.length; i++){
            let depth = this.cfg.planes[i];
            let plane_width = fov_tan * depth * 2.0;
            let plane_geo = new THREE.PlaneGeometry(plane_width, plane_width);
            var material_planes = new THREE.ShaderMaterial({
                transparent: true,
                side: THREE.DoubleSide,
                uniforms: {    // custom uniforms (your textures)
                    plane_id: { value: i },
                    num_layers: { value: 16 },
                    num_sublayers: { value: 12 },
                    num_basis: { value: 8 },
                    num_col: { value: 20 },
                    fov_tan: { value: fov_tan},
                    depth: { value: depth},
                    mpi_a: { type: "t", value: tex.a},
                    mpi_b: { type: "t", value: tex.b},
                    mpi_c: { type: "t", value: tex.c},
                    mpi_coeff: { type: "t", value: tex.mpi_coeff}
                },
                vertexShader: planeVshader,
                fragmentShader: planeFshader,
            });
            this.mpis[0].planes.push(new THREE.Mesh(plane_geo, material_planes));
            this.mpis[0].planes[i].position.z = -depth; // TODO: support proper position
            this.mpis[0].planes[i].applyMatrix4(c2w);
            this.scene.add(this.mpis[0].planes[i]);
        }        
    }
    animate(){
        this.stats.begin();
        this.renderer.render(this.scene, this.camera );
        //this.controls.update();
        this.stats.end();
        requestAnimationFrame(this.render.bind(this));
    }
    render(){
        this.animate();
    }
    get_bary(){
        // get bary centric id and weight
    }
    color2id(){
        return parseInt(Math.round( parseFloat(color) / 255.0 * (self.nMpis - 1) ))
    }
}

$(document).ready(function() {
    $.getJSON("data/lego/config.json", function(cfg) {
        window.app = new NeXviewerApp(cfg);
        window.app.render()
    });
});