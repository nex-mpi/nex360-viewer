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
            /*
            self.initScene();
            if(typeof(callback) === typeof(Function)){
                callback(self);
            }
            */
        });
    }
    initThreejs(){
        // intial stat
        this.stats = new Stats();
        this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
        document.body.appendChild(this.stats.dom);
 
        // initial global thing
        var ratio = window.innerWidth / window.innerHeight
        this.camera = new THREE.PerspectiveCamera(this.cfg.fov_degree, ratio, 0.1, 1000 );
        this.camera.up.set( 0, 0, 1 );
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement );
        // WebGL renderer config
        this.renderer = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true}); 
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.setClearColor( 0xffffff, 1 ); //change to white background
        // inital scene
        this.scenes = [];
        for(var i = 0; i < 3; i++){
            this.scenes.push(new THREE.Scene());
        }
        // inital composer for barycentric combine 3 mpis
        // TODO: implement combine pass 
        // https://github.com/mrdoob/three.js/blob/dev/examples/webgl_postprocessing_unreal_bloom_selective.html
        this.renderPasses = [];
        this.composers = [];
        for(var i = 0; i < 3; i++){
            this.renderPasses.push();
            this.renderPasses(this.scenes[i], this.camera);
            this.composers.push(THREE.EffectComposer(this.renderer));
            this.composers[i].renderToScreen = false;
            this.composers[i].addPass(this.renderPasses[i]);
        }
        this.finalComposer = new THREE.EffectComposer(this.renderer);
        this.blendPass = new ShaderPass(new THREE.ShaderMaterial({
            transparent: true,
            uniforms: {
                // baseTexture: {  type: "t", value: null },
                mpi1: { type: "t", value: this.composers[0].renderTarget2.texture },
                mpi2: { type: "t",  value: this.composers[1].renderTarget2.texture },
                mpi3: { type: "t", value: this.composers[2].renderTarget2.texture },
                weight1: { value: 1.0 / 3.0 },
                weight2: { value: 1.0 / 3.0 },
                weight3: { value: 1.0 / 3.0 }
            },
            vertexShader: blendVertexShader,
            fragmentShader: blendFragmentShader,
            defines: {}
        }));
        this.finalComposer.addPass(this.blendPass);
        document.body.appendChild(this.renderer.domElement );       
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
                        depth: { value: depth},
                        mpi_a1: { type: "t", value: this.textures[mpiId]['a1']},
                        mpi_a2: { type: "t", value: this.textures[mpiId]['a2']},
                        mpi_a3: { type: "t", value: this.textures[mpiId]['a3']},
                        mpi_a4: { type: "t", value: this.textures[mpiId]['a4']},
                        mpi_a5: { type: "t", value: this.textures[mpiId]['a5']},
                        mpi_a6: { type: "t", value: this.textures[mpiId]['a6']},
                        mpi_b: { type: "t", value: this.textures['b']},
                        mpi_c: { type: "t", value: this.textures[mpiId]['c']},
                        mpi_k1: { type: "t", value: this.textures[mpiId]['k1']},
                        mpi_k2: { type: "t", value: this.textures[mpiId]['k2']},
                        mpi_k3: { type: "t", value: this.textures[mpiId]['k3']},
                        mpi_k4: { type: "t", value: this.textures[mpiId]['k4']},
                        mpi_k5: { type: "t", value: this.textures[mpiId]['k5']},
                        mpi_k6: { type: "t", value: this.textures[mpiId]['k6']},
                        mpi_k7: { type: "t", value: this.textures[mpiId]['k7']},
                        mpi_k8: { type: "t", value: this.textures[mpiId]['k8']}
                    },
                    vertexShader: planeVertexShader,
                    fragmentShader: planeFragmentShader,
                }));                
                this.mpis[mpiId].planes.push(new THREE.Mesh(plane_geo, this.materials[mpiId][i])); 
                this.mpis[mpiId].planes[i].position.z = -depth; // TODO: support proper position]
                this.mpis[mpiId].group.add(this.mpis[mpiId].planes[i]);
            }
            this.mpis[mpiId].group.visible = false;
            var c2w = this.matrices['c2ws'][mpiId].clone();
            this.mpis[mpiId].group.applyMatrix4(c2w);
            this.scenes[0].add(this.mpis[mpiId].group);
            if(mpiId == 0){
                this.mpis[mpiId].group.visible = true;
            }    
        }
    }
    loadTexture(callback){
        // mpi_b + mpi_a + coeff + mpi_c
        var total_texture = 1 + (30 * 6) + (30 * 8) + (30 * 1); 
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
            "b": texloader.load("data/lego_16texture/mpi_b.png", textureCallback)
        }
        for(var i = 0; i < this.cfg.c2ws.length; i++){
            var id = String(i).padStart(2, '0');
            this.textures[i] = {
                "a1": texloader.load( "../../data/lego_16texture/mpi"+id+"_alpha_1.png", textureCallback),
                "a2": texloader.load( "../../data/lego_16texture/mpi"+id+"_alpha_2.png", textureCallback),
                "a3": texloader.load( "../../data/lego_16texture/mpi"+id+"_alpha_3.png", textureCallback),
                "a4": texloader.load( "../../data/lego_16texture/mpi"+id+"_alpha_4.png", textureCallback),
                "a5": texloader.load( "../../data/lego_16texture/mpi"+id+"_alpha_5.png", textureCallback),
                "a6": texloader.load( "../../data/lego_16texture/mpi"+id+"_alpha_6.png", textureCallback), 
                "c": texloader.load( "../../data/lego_16texture/mpi"+id+"_c.png" , textureCallback),
                "k1": texloader.load( "../../data/lego_16texture/mpi"+id+"_coeff1.png" , textureCallback),
                "k2": texloader.load( "../../data/lego_16texture/mpi"+id+"_coeff2.png" , textureCallback),
                "k3": texloader.load( "../../data/lego_16texture/mpi"+id+"_coeff3.png" , textureCallback),
                "k4": texloader.load( "../../data/lego_16texture/mpi"+id+"_coeff4.png" , textureCallback),
                "k5": texloader.load( "../../data/lego_16texture/mpi"+id+"_coeff5.png" , textureCallback),
                "k6": texloader.load( "../../data/lego_16texture/mpi"+id+"_coeff6.png" , textureCallback),
                "k7": texloader.load( "../../data/lego_16texture/mpi"+id+"_coeff7.png" , textureCallback),
                "k8": texloader.load( "../../data/lego_16texture/mpi"+id+"_coeff8.png" , textureCallback),
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
        this.controls.update();
        /////       
        this.write_camera_location();
        var bary = this.bary();     
        localStorage.setItem('bary_address',JSON.stringify(bary['ids']));
        for(var i = 0; i < 3; i++){
            //TODO: handle how to swap plane (applyMatrix4)
            this.composers[i].render();
        }
        this.finalComposer.render();
        ///////
        this.stats.end();
        requestAnimationFrame(this.render.bind(this));
    }
    cleanupPrecompile(){
        for(var i = 0; i < 3; i++){
            this.mpis[i].group.visible = false;
            if(i > 1){
                this.mpis[i].group.removeFromParent();
                this.scenes[i].add(this.mpis[i]);
            }
        }
        for(var i = 3; i < 30; i++){
            this.mpis[i].group.clear();
            this.mpis[i].group.removeFromParent();
        }
    }
    render(){
        for(var i = 0; i < 3; i++){
            this.renderer.compile(this.scenes[i], this.camera);
        }
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
    color2id(color){
        return parseInt(Math.round( parseFloat(color) / 255.0 * (this.cfg.c2ws.length - 1) ))
    }
    color2float(color){
        return parseFloat(color) / 255.0;
    }
    sterographicProjection(vec){
        var divder = (1.0 - vec.z)  + 1e-7;
        return  new THREE.Vector2(
            vec.x / divder,
            vec.y / divder
        );
    }
}
/////////////////////////////////////////////////////////
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
                    //nexapp.render();
                }
            );
        }
    };
    load_image_pixel('../../data/lego_16texture/bary_indices.png', function(p_inds, height, width){
        bary_ids = p_inds;
        bary_height = height;
        bary_width = width;
        waiting_return();
    });
    load_image_pixel('../../data/lego_16texture/bary_weight.png', function(p_weight, height, width){
        bary_weight = p_weight;
        waiting_return();
    });    
    $.getJSON("../../data/lego_16texture/config.json", function(cfg) {
        configs = cfg;
        waiting_return();
    });
    
});