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
 
        // initial global thing
        var targetHeight = 800; // window.innerHeight
        var targetWidth = 800; // window.innerWidth 
        var ratio = targetWidth / targetHeight;
        this.camera = new THREE.PerspectiveCamera(this.cfg.fov_degree, ratio, 0.1, 1000 );
        this.camera.up.set( 0, 0, 1 );
        // WebGL renderer config
        this.renderer = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true}); 
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement );
        this.renderer.setSize( targetWidth, targetHeight);
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
            this.renderPasses.push(new THREE.RenderPass(this.scenes[i], this.camera));
            this.composers.push(new THREE.EffectComposer(this.renderer));
            this.composers[i].renderToScreen = false;
            this.composers[i].addPass(this.renderPasses[i]);
        }
        this.blendComposer = new THREE.EffectComposer(this.renderer);
        this.blendPass = new THREE.ShaderPass(new THREE.ShaderMaterial({
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
        this.blendComposer.addPass(this.blendPass);
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
                var layer_id = Math.floor(i / this.cfg.num_sublayers)
                this.materials[mpiId].push(new THREE.ShaderMaterial({
                    transparent: true,
                    side: THREE.DoubleSide,
                    uniforms: {    // custom uniforms (your textures)     
                        alpha_ch: {value: i % 4},                   
                        mpi_a: { type: "t", value: this.textures[mpiId]['a'][Math.floor(i/4)]},
                        mpi_b0_p: { type: "t", value: this.textures['b0_p']},
                        mpi_b0_p: { type: "t", value: this.textures['b1_p']},
                        mpi_b0_n: { type: "t", value: this.textures['b0_n']},
                        mpi_b1_n: { type: "t", value: this.textures['b1_n']},
                        mpi_c: { type: "t", value: this.textures[mpiId]['c'][layer_id]},
                        mpi_k1: { type: "t", value: this.textures[mpiId]['k'][layer_id][0]},
                        mpi_k2: { type: "t", value: this.textures[mpiId]['k'][layer_id][1]},
                        mpi_k3: { type: "t", value: this.textures[mpiId]['k'][layer_id][2]},
                        mpi_k4: { type: "t", value: this.textures[mpiId]['k'][layer_id][3]},
                        mpi_k5: { type: "t", value: this.textures[mpiId]['k'][layer_id][4]},
                        mpi_k6: { type: "t", value: this.textures[mpiId]['k'][layer_id][5]},
                    },
                    vertexShader: planeVertexShader,
                    fragmentShader: planeFragmentShader,
                }));                
                this.mpis[mpiId].planes.push(new THREE.Mesh(plane_geo, this.materials[mpiId][i])); 
                this.mpis[mpiId].planes[i].position.z = -depth; // TODO: support proper position]
                this.mpis[mpiId].group.add(this.mpis[mpiId].planes[i]);
            }
            this.mpis[mpiId].group.visible = true;
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
        var total_texture = (4*1) + (48 * 30) + (6 * 16 * 30) + (1 * 16* 30); 
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
            "b0_p": texloader.load("../../data/lego_nano/mpi_b0_p.png", textureCallback),
            "b1_p": texloader.load("../../data/lego_nano/mpi_b1_p.png", textureCallback),
            "b0_n": texloader.load("../../data/lego_nano/mpi_b0_n.png", textureCallback),
            "b1_n": texloader.load("../../data/lego_nano/mpi_b1_n.png", textureCallback),
        }
        for(var i = 0; i < this.cfg.c2ws.length; i++){
            var id = String(i).padStart(2, '0');
            this.textures[i] = {'a':[],'k':[],'c':[]};
            for(var j = 0; j < Math.floor(this.cfg.planes.length / 4); j++){
                var layer_id = String(j).padStart(2, '0')
                this.textures[i]['a'].push(texloader.load( "../../data/lego_nano/mpi"+id+"_a"+layer_id+".png", textureCallback));
            }
            for(var j = 0; j < this.cfg.num_layers; j++){
                var layer_id = String(j).padStart(2, '0')
                this.textures[i]['c'].push(texloader.load( "../../data/lego_nano/mpi"+id+"_c_l"+layer_id+".png", textureCallback));
            }
            for(var j = 0; j < this.cfg.num_layers; j++){
                var layer_id = String(j).padStart(2, '0')
                this.textures[i]['k'].push([])
                for(var k = 1; k <= 6; k++){
                    this.textures[i]['k'][j].push(texloader.load( "../../data/lego_nano/mpi"+id+"_k"+k+"_l"+layer_id+".png", textureCallback));
                }
            }
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
        var bary = this.bary();     
        this.write_camera_location(bary['ids']);
        for(var b = 0; b < 3; b++){
            //TODO: handle how to swap plane (applyMatrix4)
            var id = bary['ids'][b];
            if(this.mpis_ids[b] != id) {
                this.mpis[b].group.applyMatrix4(this.matrices['w2cs'][this.mpis_ids[b]]);
                this.mpis[b].group.applyMatrix4(this.matrices['c2ws'][id]);
                for(var planeId = 0; planeId < this.cfg.planes.length; planeId++){
                    this.mpis[b].planes[planeId].material = this.materials[id][planeId];
                }
                this.mpis_ids[b]= id;            
            }
            // render each MPI
            this.composers[b].render();
        }
        //render the weight 3-combine mpi
        this.blendPass.uniforms.weight1.value = bary['weights'][0];
        this.blendPass.uniforms.weight2.value = bary['weights'][1];
        this.blendPass.uniforms.weight3.value = bary['weights'][2];
        this.blendComposer.render();
        ///////
        this.stats.end();
        requestAnimationFrame(this.render.bind(this));
    }
    cleanupPrecompile(){
        for(var i = 0; i < 3; i++){
            this.mpis[i].group.visible = true;
            if(i > 0){
                this.mpis[i].group.removeFromParent();
                this.scenes[i].add(this.mpis[i].group);
            }
        }
        for(var i = 3; i < 30; i++){
            this.mpis[i].group.clear();
            this.mpis[i].group.removeFromParent();
        }
    }
    render(){
        /*
        for(var i = 0; i < 3; i++){
            this.renderer.compile(this.scenes[i], this.camera);
        }*/
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
        //this.write_bary_anchor(anchor);
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
    write_camera_location(ids){
        localStorage.setItem('bary_address',JSON.stringify(ids));
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
                    console.log('ready for nex app');
                    nexapp.render();
                }
            );
        }
    };
    load_image_pixel('../../data/lego_nano/bary_indices.png', function(p_inds, height, width){
        bary_ids = p_inds;
        bary_height = height;
        bary_width = width;
        waiting_return();
    });
    load_image_pixel('../../data/lego_nano/bary_weight.png', function(p_weight, height, width){
        bary_weight = p_weight;
        waiting_return();
    });    
    $.getJSON("../../data/lego_nano/config.json", function(cfg) {
        configs = cfg;
        waiting_return();
    });
    
});