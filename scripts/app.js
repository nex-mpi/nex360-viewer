// NeX360 viewer

let planeVshader = `
varying vec2 vUv;

void main()
{
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
}
`

let planeFshader = `
#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D mpi_a;
uniform sampler2D mpi_b;
uniform sampler2D mpi_c;
uniform sampler2D coeff;
uniform int num_col;
uniform int plane_id;
uniform int num_layers;
uniform int num_sublayers;

varying vec2 vUv;

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
    float nr = 6.0;//ceil(float(total_id) /float(num_col));
    float row_id = float(id / num_col);
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

float get_alpha(vec4 rgba)
{
    int period = (num_layers * num_sublayers) / 3;
    int id = plane_id / period;
    if(id == 0) return rgba.r;
    if(id == 1) return rgba.g;
    return rgba.b;
}

void main(void)
{
    vec4 color = texture2D(mpi_c, uv2lookup(layerId(), num_layers));
    vec4 alpha_rgb = texture2D(mpi_a, uv2lookup(alphaRgbId(), num_layers * num_sublayers / 3));
    float alpha = get_alpha(alpha_rgb);
    //color.a = 0.005;
    
    color.r = 0.0;
    color.g = 0.0;
    color.b = 0.0;
    color.a = alpha;
    
    gl_FragColor= vec4(color);
    //gl_FragColor= vec4(1.0, 0.0, 0.0 ,0.1);
}
`


class NeXviewerApp{
    constructor(cfg){
        this.cfg = cfg
        this.intial();
        
    }
    intial(){
        // inital global thing
        this.scene = new THREE.Scene();
        let ratio = window.innerWidth / window.innerHeight
        this.camera = new THREE.PerspectiveCamera(this.cfg.fov_degree, ratio, 0.1, 1000 );
        this.renderer = new THREE.WebGLRenderer({ alpha: true }); 
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.setClearColor( 0xffffff, 1 ); //change to white background
        document.body.appendChild(this.renderer.domElement );       
        // prepare scene
        const material = new THREE.MeshBasicMaterial( { color: 0x999999, side: THREE.DoubleSide} );
        var texloader = new THREE.TextureLoader();
        var tex = {
            "a": texloader.load( "data/lego/mpi00_a.png" ), 
            "b": texloader.load( "data/lego/mpi_b.png" ),
            "c": texloader.load( "data/lego/mpi00_c.png" ),
            "coeff": texloader.load( "data/lego/mpi00_coeff8.png" )
        };
        // load texture;
        this.camera.position.z = 4; // TODO: support proper position
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
                    num_col: { value: 20 },
                    mpi_a: { type: "t", value: tex.a},
                    mpi_b: { type: "t", value: tex.b},
                    mpi_c: { type: "t", value: tex.c},
                    coeff: { type: "t", value: tex.coeff}
                },
                vertexShader: planeVshader,
                fragmentShader: planeFshader,
            });
            this.mpis[0].planes.push(new THREE.Mesh(plane_geo, material_planes));
            this.mpis[0].planes[i].position.z = 4 - depth; // TODO: support proper position
            this.scene.add(this.mpis[0].planes[i]);
        }        
    }    
    render(){
        this.renderer.render(this.scene, this.camera );
        this.controls.update();
        requestAnimationFrame(this.render.bind(this));
    }
}

$(document).ready(function() {
    $.getJSON("data/lego/config.json", function(cfg) {
        window.app = new NeXviewerApp(cfg);
        window.app.render()
    });
});