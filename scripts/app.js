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
var planeVshader = `
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

var planeFshader = `
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
    constructor(cfg, p_bary_ids, p_bary_weights, p_bary_height, p_bary_width, callback){
        this.cfg = cfg
        this.bary_ids = p_bary_ids;
        this.bary_weights = p_bary_weights;
        this.bary_height = p_bary_height;
        this.bary_width = p_bary_width;
        this.bary_scaler = new THREE.Vector2(this.bary_width - 1.0, this.bary_height-1.0);
        this.bary_anchor = -1;
        this.initThreejs();
        this.initMatrices();
        var self = this;
        this.loadTexture(function(){
            self.initScene();
            if(typeof(callback) === typeof(Function)){
                callback(self);
            }
        });
    }
    initThreejs(){
        // intial stat
        this.stats = new Stats();
        this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
        document.body.appendChild(this.stats.dom);
 
        // inital global thing
        this.scene = new THREE.Scene();
        var ratio = window.innerWidth / window.innerHeight
        this.camera = new THREE.PerspectiveCamera(this.cfg.fov_degree, ratio, 0.1, 1000 );
        this.camera.up.set( 0, 0, 1 );
        this.renderer = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true}); 
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.setClearColor( 0xffffff, 1 ); //change to white background
        document.body.appendChild(this.renderer.domElement );       
        this.composer = new THREE.EffectComposer(this.renderer);
        //this.clearPass = new THREE.ClearPass(0xffffff,1);
        //this.composer.addPass(this.clearPass);
        this.renderPass = new THREE.RenderPass(this.scene, this.camera);
        //this.renderPass.clear = false;
        this.composer.addPass(this.renderPass);
        this.opacityPass = new THREE.ShaderPass(THREE.CopyShader);
        this.opacityPass.material.transparent = true;
        this.composer.addPass(this.opacityPass);
    }
    initScene(){       
        // prepare scene     
        /*   
        const originBox = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const originMat = new THREE.MeshBasicMaterial( { color: 0xff0000, side: THREE.DoubleSide} );
        var cube = new THREE.Mesh( originBox, originMat )
        this.scene.add(cube);
        */
         // TODO: support proper position
        this.camera.position.x = 0.8205487132072449;
        this.camera.position.y =  3.3249945640563965;
        this.camera.position.z = 2.066666603088379;
        this.materials = {};
        this.mpis = {};
        this.mpis_ids = [0,1,2];
        this.prev_id = 0;
        var fov_tan = Math.tan(this.cfg.fov_radian / 2.0);
        for(var mpiId = 0; mpiId < 30; mpiId++) //this.cfg.c2ws.length
        {
            this.mpis[mpiId] = {
                "planes": [],
                "group": new THREE.Group()
            };
            this.materials[mpiId] = [];
            for(var i = 0; i < this.cfg.planes.length; i++){
                var depth = this.cfg.planes[i];
                var plane_width = fov_tan * depth * 2.0;
                var plane_geo = new THREE.PlaneGeometry(plane_width, plane_width);
                this.materials[mpiId].push(new THREE.ShaderMaterial({
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
                        mpi_a: { type: "t", value: this.textures[mpiId]['a']},
                        mpi_b: { type: "t", value: this.textures['b']},
                        mpi_c: { type: "t", value: this.textures[mpiId]['c']},
                        mpi_coeff: { type: "t", value: this.textures[mpiId]['coeff']}
                    },
                    vertexShader: planeVshader,
                    fragmentShader: planeFshader,
                }));                
                this.mpis[mpiId].planes.push(new THREE.Mesh(plane_geo, this.materials[mpiId][i])); 
                this.mpis[mpiId].planes[i].position.z = -depth; // TODO: support proper position]
                this.mpis[mpiId].group.add(this.mpis[mpiId].planes[i]);
            }
            this.mpis[mpiId].group.visible = false;
            var c2w = this.matrices['c2ws'][mpiId].clone();
            this.mpis[mpiId].group.applyMatrix4(c2w);
            this.scene.add(this.mpis[mpiId].group);
            if(mpiId == 0){
                this.mpis[mpiId].group.visible = true;
            }    
        }
    }
    loadTexture(callback){
        var total_texture = 1 + 30 * (3);
        var loaded_texture = 0;
        var texloader = new THREE.TextureLoader();
        var self = this;
        var textureCallback = function(texture){
            loaded_texture++;
            console.log('texture loaded... '+ loaded_texture +' / ' + total_texture);
            self.renderer.initTexture(texture);
            if(loaded_texture >= total_texture){
                console.log('load finished')
                callback();
            }
        }
        this.textures = {
            "b": texloader.load("data/lego/mpi_b.png", textureCallback)
        }
        for(var i = 0; i < this.cfg.c2ws.length; i++){
            var id = String(i).padStart(2, '0');
            this.textures[i] = {
                "a": texloader.load( "data/lego/mpi"+id+"_a_v2.png", textureCallback), 
                "c": texloader.load( "data/lego/mpi"+id+"_c.png" , textureCallback),
                "coeff": texloader.load( "data/lego/mpi"+id+"_coeff8.png", textureCallback)
            };
        } 
    }
    initMatrices(){
        this.matrices = {
            'c2ws': [],
            'w2cs': []
        }
        for(var i = 0; i < this.cfg.c2ws.length; i++){
            var c2w_arr = this.cfg.c2ws[i];
            var c2w = new THREE.Matrix4();
            //set is row major, internal is column major`    
            c2w.set(
                c2w_arr[0][0], c2w_arr[0][1], c2w_arr[0][2], c2w_arr[0][3],
                c2w_arr[1][0], c2w_arr[1][1], c2w_arr[1][2], c2w_arr[1][3],
                c2w_arr[2][0], c2w_arr[2][1], c2w_arr[2][2], c2w_arr[2][3],
                c2w_arr[3][0], c2w_arr[3][1], c2w_arr[3][2], c2w_arr[3][3] 
            );
            this.matrices['c2ws'].push(c2w);
            this.matrices['w2cs'].push(c2w.clone().invert());
        }
    }
    animate(){
        this.stats.begin();
        //this.renderer.render(this.scene, this.camera );
        this.controls.update();
        /////       
        this.write_camera_location();
        var bary = this.bary();     
        /*  
        var t = 2;
        if(bary['weights'][0] >= bary['weights'][1] && bary['weights'][0] >= bary['weights'][2]){
            t = 0;
        }
        if(bary['weights'][1] >= bary['weights'][0] && bary['weights'][1] >= bary['weights'][2]){
            t = 1;
        }
        */
        localStorage.setItem('bary_address',JSON.stringify([id]));
        //this.renderer.clear();
        this.renderer.autoClear = true;
        //this.clearPass.enabled = true;
        for(var b = 0; b < 3; b++){
            var id = bary['ids'][b];
            var weight = bary['weights'][b];
            this.mpis[b].group.visible = true;
            if(this.mpis_ids[b] != id) {
                this.mpis[b].group.applyMatrix4(this.matrices['w2cs'][this.mpis_ids[b]]);
                this.mpis[b].group.applyMatrix4(this.matrices['c2ws'][id]);
                for(var planeId = 0; planeId < this.cfg.planes.length; planeId++){
                    this.mpis[b].planes[planeId].material = this.materials[id][planeId];
                }
                this.mpis_ids[b]= id;            
            }
            this.opacityPass.uniforms.opacity.value = weight;
            //this.renderer.render(this.scene, this.camera );
            this.renderer.autoClear = false;
            this.composer.render();
            //this.clearPass.enabled = false;
            this.mpis[b].group.visible = false;
        }
        
        /*
        if(id != this.mpis['first_mpi_id']){
            //var old_id = this.mpis['first_mpi_id'];
            //this.mpis[old_id].group.visible = false;
            //this.mpis[id].group.visible = true;           
            //this.mpis['first_mpi_id'] = id;
            this.opacitypass.uniforms.opacity.value = 0.2;
            var old_id = this.mpis['first_mpi_id'];
            this.mpis[0].group.applyMatrix4(this.matrices['w2cs'][old_id]);
            this.mpis[0].group.applyMatrix4(this.matrices['c2ws'][id]);
            for(var planeId = 0; planeId < this.cfg.planes.length; planeId++){
                this.mpis[0].planes[planeId].material = this.materials[id][planeId];
                //this.mpis[0].planes[planeId].material.uniforms.mpi_a.value = this.textures[id].a;
                //this.mpis[0].planes[planeId].material.uniforms.mpi_c.value = this.textures[id].c;
                //this.mpis[0].planes[planeId].material.uniforms.mpi_coeff.value = this.textures[id].coeff;
            }
            this.mpis['first_mpi_id'] = id;            
        }*/       
        
        ///////
        this.stats.end();
        requestAnimationFrame(this.render.bind(this));
    }
    cleanupPrecompile(){
        for(var i = 0; i < 3; i++){
            this.mpis[i].group.visible = false;
        }
        for(var i = 3; i < 30; i++){
            this.mpis[i].group.clear();
            this.mpis[i].group.removeFromParent();
        }
    }
    render(){
        this.renderer.compile(this.scene, this.camera);
        this.cleanupPrecompile();
        this.animate();
    }
    bary(){
        // get bary centric id and weight
        var cam_location = this.camera.position.clone();
        // NeX axis that use to create delone map is opencv convention 
        cam_location.y = cam_location.y * -1;
        cam_location.z = cam_location.z * -1;
        var cam_norm = cam_location.normalize();
        var stero_location = this.sterographicProjection(cam_norm);
        var anchor = this.get_bary_anchor(stero_location);
        if(anchor == this.anchor){
            return this.bary_data;
        }
        this.anchor = anchor;
        this.write_bary_anchor(anchor);
        var ids = [], weights = [];
        for(var i = 0; i < 3; i++){
            ids.push(this.color2id(this.bary_ids[anchor+i]));
            weights.push(this.color2float(this.bary_weights[anchor+i]));
        }
        this.bary_data = {"ids": ids, "weights": weights}
        return this.bary_data;
    }
    get_bary_anchor(v){
        v.clampScalar(-1.0,1.0);
        v.addScalar(1.0);
        v.multiplyScalar(0.5);
        v.multiply(this.bary_scaler);
        v.round();
        return (v.x * this.bary_width + v.y) * 4;
    }
    write_bary_anchor(anchor){ 
        anchor = anchor / 4;       
        localStorage.setItem('bary_anchor',JSON.stringify({
            'x': anchor % this.bary_width, 
            'y': Math.floor(anchor / this.bary_width)
        }));
    }
    write_camera_location(){
        localStorage.setItem('camera_location',JSON.stringify({
            'x': this.camera.position.x, 
            'y': this.camera.position.y,
            'z': this.camera.position.z
        }));
    }
    write_selected_mpi(){
        localStorage.setItem('camera_location',JSON.stringify({
            'x': this.camera.position.x, 
            'y': this.camera.position.y,
            'z': this.camera.position.z
        }));
    }
    color2id(color){
        return parseInt(Math.round( parseFloat(color) / 255.0 * (this.cfg.c2ws.length - 1) ))
    }
    color2float(color){
        return parseFloat(color) / 255.0;
    }
    sterographicProjection(vec){
        var divder = (1.0 - vec.z)  + 1e-7
        return  new THREE.Vector2(
            vec.x / divder,
            vec.y / divder
        );
    }
}

function load_image_pixel(url, callback){
    var canvas = document.createElement('canvas');
    var context  = canvas.getContext('2d');
    var img = new Image();
    img.src = url;
    img.onload = function(){
        canvas.width = this.width;
        canvas.height = this.height;
        context.drawImage(img, 0, 0);
        var data = context.getImageData(0, 0, this.width, this.height).data;
        callback(data, this.height, this.width);
    }
}
$(document).ready(function() {
    var need_return = 3;
    var count_return = 0;
    var configs = null, bary_ids = null, bary_weight = null, bary_height = 0, bary_width = 0;
    var waiting_return = function(){
        count_return++;
        if(count_return >= need_return){
            window.app = new NeXviewerApp(
                configs, bary_ids, bary_weight, bary_height, bary_width,
                function(nexapp){
                    nexapp.render();
                }
            );
        }
    };
    load_image_pixel('data/lego/bary_indices.png', function(p_inds, height, width){
        bary_ids = p_inds;
        bary_height = height;
        bary_width = width;
        waiting_return();
    });
    load_image_pixel('data/lego/bary_weight.png', function(p_weight, height, width){
        bary_weight = p_weight;
        waiting_return();
    });    
    $.getJSON("data/lego/config.json", function(cfg) {
        configs = cfg;
        waiting_return();
    });
    
});