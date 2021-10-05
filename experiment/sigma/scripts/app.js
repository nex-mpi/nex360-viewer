class NeXviewerApp{
    constructor(path, cfg, p_bary_ids, p_bary_weights, p_bary_height, p_bary_width, callback){
        this.path = path;
        this.cfg = cfg
        this.bary_ids = p_bary_ids;
        this.bary_weights = p_bary_weights;
        this.bary_height = p_bary_height;
        this.bary_width = p_bary_width;
        this.bary_scaler = new THREE.Vector2(this.bary_width - 1.0, this.bary_height-1.0);
        this.bary_anchor = -1;
        console.log('THREEJS INIT');
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

        //init configuration
        if (typeof this.cfg.compose_mode === 'undefined'){
            this.cfg.compose_mode = 'bary';
        }
        if (typeof this.cfg.is_sigma === 'undefined'){
            this.cfg.is_sigma = true;
        }
        if (typeof this.cfg.controls_type === 'undefined'){
            this.cfg.controls_type = "manual";
        }
        if (typeof this.cfg.is_predicting === 'undefined'){
            this.cfg.is_predicting = false;
        }
        if (typeof this.cfg.is_smaa === 'undefined'){
            this.cfg.is_smaa = false;
        }
        if (typeof this.cfg.camera_position === 'undefined'){
            this.cfg.camera_position = {
                "x": 0.8205487132072449,
                "y": 3.3249945640563965,
                "z": 2.066666603088379
            };
        }
 
        // initial global thing
        var targetHeight = 800; // window.innerHeight
        var targetWidth = 800; // window.innerWidth 
        var ratio = targetWidth / targetHeight;
        this.camera = new THREE.PerspectiveCamera(this.cfg.fov_degree, ratio, 0.1, 1000 );
        this.camera.up.set( 0, 0, 1 );

        // WebGL renderer config
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            premultipliedAlpha: this.cfg.texture_ext != 'npy', //affact performance =X
            precision: "highp", //can be reduce for better performance
            stencil: false,
            depth: false,
            powerPreference: "high-performance",
            antialias: true
        });
        if(!this.renderer.capabilities.isWebGL2){
            document.getElementById("danger-modal").classList.add("is-active");
            document.getElementById("danger-model-text").innerHTML="<b>WEBGL2:</b> This page require WebGL2 to be render.";    
        }
        this.renderer.context.canvas.addEventListener("webglcontextlost", this.onContextLost, false);
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement );
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        console.log('DISABLE ZOOM');
        //this.renderer.setPixelRatio( window.devicePixelRatio ); //enable to render on HI-DPI screen
        this.renderer.setSize( targetWidth, targetHeight);
        this.renderer.setClearColor( 0xffffff, 1 ); //change to white background
        //this.renderer.setClearColor( 0x000000, 1 ); //black bg for debuging
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
            var composerTarget = undefined;
            if(this.cfg.texture_ext == 'npy'){
				composerTarget = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
					minFilter: THREE.LinearFilter,
					magFilter: THREE.LinearFilter,
					format: THREE.RGBAFormat,
                    type: THREE.FloatType
				});
				composerTarget.texture.name = 'EffectComposer.rt1';
            }
            this.renderPasses.push(new THREE.RenderPass(this.scenes[i], this.camera));
            this.composers.push(new THREE.EffectComposer(this.renderer, composerTarget));
            this.composers[i].renderToScreen = false;
            this.composers[i].addPass(this.renderPasses[i]);
            if(this.cfg.is_smaa){
                this.composers[i].addPass(new THREE.SMAAPass(targetWidth, targetHeight));    
            }
        }
        this.blendComposerTarget = undefined;
        if(this.cfg.texture_ext == 'npy'){
            this.blendComposerTarget = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.FloatType
            });
        }
        this.blendComposer = new THREE.EffectComposer(this.renderer, this.blendComposerTarget);
        //this.blendComposer.renderToScreen = false;
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
        if(this.cfg.is_smaa){
            this.blendComposer.addPass(new THREE.SMAAPass(targetWidth, targetHeight));
        }
        //document.body.appendChild(this.renderer.domElement );       
        this.capturer = new CCapture( { name: "nex360-predict", format: "png" } );
        document.getElementById('threejs-wrapper').appendChild(this.renderer.domElement );
    }
    initScene(){       
        // prepare scene     
        /*   
        const originBox = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const originMat = new THREE.MeshBasicMaterial( { color: 0xff0000, side: THREE.DoubleSide} );
        var cube = new THREE.Mesh( originBox, originMat )
        this.scene.add(cube);
        */
        this.resetCameraPose();
        this.materials = {};
        this.mpis = {};
        this.mpis_ids = [0,1,2];
        this.prev_id = 0;
        var fov_tan = Math.tan(this.cfg.fov_radian / 2.0);
        var plane_width_ratio = (this.cfg.width / 2.0 + this.cfg.offset) / this.cfg.width;
        for(var mpiId = 0; mpiId < 30; mpiId++) //this.cfg.c2ws.length
        {
            this.mpis[mpiId] = {
                "planes": [],
                "group": new THREE.Group()
            };
            this.materials[mpiId] = [];
            for(var i = 0; i < this.cfg.planes.length; i++){
                var depth = this.cfg.planes[i];
                var plane_width = fov_tan * (depth * plane_width_ratio) * 2.0;
                var plane_geo = new THREE.PlaneGeometry(plane_width, plane_width);
                var layer_id = Math.floor(i / this.cfg.num_sublayers)
                this.materials[mpiId].push(new THREE.ShaderMaterial({
                    transparent: true,
                    uniforms: {   
                        alpha_ch: {value: i % 4},
                        plane_id: {value: i},                   
                        mpi_a: { type: "t", value: this.textures[mpiId]['a'][Math.floor(i/4)]},
                        mpi_b0: { type: "t", value: this.textures['b0']},
                        mpi_b1: { type: "t", value: this.textures['b1']},
                        mpi_c: { type: "t", value: this.textures[mpiId]['c'][layer_id]},
                        mpi_k1: { type: "t", value: this.textures[mpiId]['k'][layer_id][0]},
                        mpi_k2: { type: "t", value: this.textures[mpiId]['k'][layer_id][1]},
                        mpi_k3: { type: "t", value: this.textures[mpiId]['k'][layer_id][2]},
                        mpi_k4: { type: "t", value: this.textures[mpiId]['k'][layer_id][3]},
                        mpi_k5: { type: "t", value: this.textures[mpiId]['k'][layer_id][4]},
                        mpi_k6: { type: "t", value: this.textures[mpiId]['k'][layer_id][5]},
                        is_sigma: { type: "t", value: this.cfg.is_sigma},
                        is_numpy: { type: "t", value: this.cfg.texture_ext == 'npy'},
                    },
                    vertexShader: planeVertexShader,
                    fragmentShader: planeFragmentShader,
                }));

                this.mpis[mpiId].planes.push(new THREE.Mesh(plane_geo, this.materials[mpiId][i])); 
                this.mpis[mpiId].planes[i].position.z = -depth; // TODO: support proper position]
                this.mpis[mpiId].group.add(this.mpis[mpiId].planes[i]);
            }
            var c2w = this.matrices['c2ws'][mpiId].clone();
            this.mpis[mpiId].group.applyMatrix4(c2w);
            this.scenes[0].add(this.mpis[mpiId].group);
        }
    }   
    loadTexture(callback){
        //document.getElementById('progress-texture-wrapper').style.display = 'block';
        $('#progress-barycentric-wrapper').hide();
        $('#progress-texture-wrapper').show();
        var self = this;
        var num_mpis = this.cfg.c2ws.length;
        var files_per_mpi = 48 + (6 * 16) + 16;
        // mpi_b + mpi_a + coeff + mpi_c
        var total_texture = (2*1) + (48 * num_mpis) + (6 * 16 * num_mpis) + (1 * 16* num_mpis); 
        var loaded_texture = 0;
        var texloader = new THREE.TextureLoader();
        var alphaLoader = texloader;
        if(this.cfg.texture_ext == 'npy'){
            alphaLoader = new THREE.NumpyTextureLoader();
        }
        console.log('texture ext: '+this.cfg.texture_ext)
        var mpi_a_type = this.cfg.is_sigma ? 's' : 'a';
        var self = this;
        var textureCallback = function(texture){
            loaded_texture++;
            document.getElementById('progress-texture-val').value = (loaded_texture / total_texture) * 100.0;
            document.getElementById('progress-texture-text').innerText = ''+loaded_texture+' / '+total_texture;
            self.renderer.initTexture(texture);
            if(loaded_texture >= total_texture){
                document.getElementById('progress-texture-wrapper').style.display = 'none';
                callback();
            }
        }
        
        this.textures = {
            "b0": alphaLoader.load(this.path+"/mpi_b0."+self.cfg.texture_ext, textureCallback),
            "b1": alphaLoader.load(this.path+"/mpi_b1."+self.cfg.texture_ext, textureCallback),
        }
        var count_mpi_load = 0;
        var loaded_files_on_mpi = 0;
        var loadTextureCallback = function(texture){
            textureCallback(texture);
            loaded_files_on_mpi++;
            if(loaded_files_on_mpi>=files_per_mpi){
                count_mpi_load++;
                if(count_mpi_load < num_mpis){
                    loaded_files_on_mpi = 0;
                    window.setTimeout(function(){
                        loadMpis(count_mpi_load);
                    }, 10); // need to a delay to fool chrome to avoid insufficient load error.
                }
            }
        }        
        var loadMpis = function(mpiId){
            var id = String(mpiId).padStart(2, '0');
            self.textures[mpiId] = {'a':[],'k':[],'c':[]};            
            for(var j = 0; j < Math.floor(self.cfg.planes.length / 4); j++){
                var layer_id = String(j).padStart(2, '0')
                self.textures[mpiId]['a'].push(alphaLoader.load(self.path+"/mpi"+id+"_"+mpi_a_type+layer_id+"."+self.cfg.texture_ext, loadTextureCallback));
            }                
            for(var j = 0; j < self.cfg.num_layers; j++){
                var layer_id = String(j).padStart(2, '0')
                self.textures[mpiId]['c'].push(alphaLoader.load(self.path+"/mpi"+id+"_c_l"+layer_id+"."+self.cfg.texture_ext, loadTextureCallback));
            }                       
            for(var j = 0; j < self.cfg.num_layers; j++){
                var layer_id = String(j).padStart(2, '0')
                self.textures[mpiId]['k'].push([])
                for(var k = 1; k <= 6; k++){
                    self.textures[mpiId]['k'][j].push(alphaLoader.load(self.path+"/mpi"+id+"_k"+k+"_l"+layer_id+"."+self.cfg.texture_ext, loadTextureCallback));
                }
            }
        }
        loadMpis(0);         
    }
    initMatrices(){
        this.matrices = {
            'c2ws': [],
            'w2cs': [],
            'nerf_c2ws': [],
            'nerf_w2cs': [],
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
        if(typeof this.cfg.nerf_path !== 'undefined'){
            for(var i = 0; i < this.cfg.nerf_path.frames.length; i++){
                var c2w_arr = this.cfg.nerf_path.frames[i].transform_matrix;
                var c2w = new THREE.Matrix4();
                c2w.set(
                    c2w_arr[0][0], c2w_arr[0][1], c2w_arr[0][2], c2w_arr[0][3],
                    c2w_arr[1][0], c2w_arr[1][1], c2w_arr[1][2], c2w_arr[1][3],
                    c2w_arr[2][0], c2w_arr[2][1], c2w_arr[2][2], c2w_arr[2][3],
                    c2w_arr[3][0], c2w_arr[3][1], c2w_arr[3][2], c2w_arr[3][3] 
                );
                this.matrices['nerf_c2ws'].push(c2w);
                this.matrices['nerf_w2cs'].push(c2w.clone().invert());
            }
        }
    }
    animate(){
        this.stats.begin();
        this.requestFrame = requestAnimationFrame(this.animate.bind(this));
        if(this.cfg.controls_type == "manual") this.controls.update();
        if(this.cfg.controls_type == "nerf")  this.nextNerfCameraPose(); //this.updateNeRFCameraPose();
        this.composeFrame();
        this.stats.end();
    }
    rotateMpi(b, id){
        if(this.mpis_ids[b] != id) {
            this.mpis[b].group.applyMatrix4(this.matrices['w2cs'][this.mpis_ids[b]]);
            this.mpis[b].group.applyMatrix4(this.matrices['c2ws'][id]);
            for(var planeId = 0; planeId < this.cfg.planes.length; planeId++){
                this.mpis[b].planes[planeId].material = this.materials[id][planeId];
            }
            this.mpis_ids[b]= id;            
        }
    }
    composeFrame(){
        if(this.cfg.compose_mode == 'closet'){
            this.composeSingle();
        } else {
            this.composeBary();
        }
    }
    composeSingle(){
        var bary = this.bary();
        var id = 0;
        if(bary.weights[1] >= bary.weights[0] && bary.weights[1] >= bary.weights[2]) id = 1;
        if(bary.weights[2] >= bary.weights[0] && bary.weights[2] >= bary.weights[1]) id = 2;
        id = bary['ids'][id];
        this.write_camera_location([id]);
        this.rotateMpi(0, id);
        this.composers[0].render();  
    }
    composeBary(){       
        var bary = this.bary();  
        this.write_camera_location(bary['ids']);
        var sum_weight = bary['weights'][0] + bary['weights'][1] + bary['weights'][2];
        for(var b = 0; b < 3; b++){
            bary['weights'][b] = bary['weights'][b] / sum_weight;
            var id = bary['ids'][b];
            this.rotateMpi(b, id);
            // render each MPI
            this.composers[b].render();            
         }
         /*
         bary['weights'][0] = 1.0;
         bary['weights'][1] = 0.0;
         bary['weights'][2] = 0.0;
         */
         //render the weight 3-combine mpi
         this.blendPass.uniforms.weight1.value = bary['weights'][0];
         this.blendPass.uniforms.weight2.value = bary['weights'][1];
         this.blendPass.uniforms.weight3.value = bary['weights'][2];
         this.blendComposer.render();
    }
    precompile(){
        for(var i = 0; i < 3; i++){
            this.renderer.compile(this.scenes[i], this.camera);
        }
        for(var i = 0; i < 3; i++){
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
        this.precompile();      
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
        var ids = [], weights = [];
        for(var i = 0; i < 3; i++){
            if(this.cfg.texture_ext == 'npy'){ 
                ids.push(this.bary_ids[anchor+i]);
                weights.push(this.bary_weights[anchor+i]);            
            }else{
                ids.push(this.color2id(this.bary_ids[anchor+i]));
                weights.push(this.color2float(this.bary_weights[anchor+i]));
            }
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
        var num_channel = 4;
        if( this.cfg.texture_ext == 'npy'){
            num_channel = 3;
        }
        return (v.x * this.bary_width + v.y) * num_channel;
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
    onContextLost(event) {
        event.preventDefault();
        document.getElementById("danger-modal").classList.add("is-active");
        document.getElementById("danger-model-text").innerHTML="<b>WEBGL_CONTEXT_LOSS:</b> Your machine doesn't have enough memory to render this scene";
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
    regisControl(){
        var self = this;
        $("#control-bar").show();
        $("#sel-plane-combine").change(function(e){
            self.cfg.compose_mode = this.value;
            if(this.value == "closet"){
                self.composers[0].renderToScreen = true;
            }else{
                self.composers[0].renderToScreen = false;
            }
        });
        $("#sel-control-type").change(function(e){
            //reset camera rotation
            self.cfg.controls_type = this.value;        
            self.resetCameraPose();
        });
        $("#btn-predict").click(function(e){
            window.cancelAnimationFrame(self.requestFrame);
            $("#control-bar").hide();
            $("#rendering-status-warpper").show();
            $("#rendering-count").text(1);
            $("#rendering-total").text(self.matrices['nerf_c2ws'].length);
            $("#rendering-state-predicting").show();
            self.cfg.nerf_path.frame_id = 0;
            self.capturer.start();
            self.predictFrame();
        });
    }
    predictFrame(){
        $("#rendering-count").text(this.cfg.nerf_path.frame_id + 1);
        console.log('predicting... frame:'+this.cfg.nerf_path.frame_id)
        this.stats.begin();
        this.nextNerfCameraPose();
        this.composeFrame();
        this.capturer.capture(this.renderer.domElement);
        this.stats.end();

        if(this.cfg.nerf_path.frame_id == 1){
            const blendBuffer = this.blendComposer.writeBuffer
            var rawPixelData = new Float32Array(blendBuffer.width * blendBuffer.height*4);
            // re-rendered to  texture to save a file. Should change to render only 1 time and save to file
            this.blendComposer.renderToScreen = false;
            this.composeFrame();
            this.renderer.readRenderTargetPixels(this.blendComposerTarget, 0, 0, blendBuffer.width, blendBuffer.height, rawPixelData);
            this.blendComposer.renderToScreen = true;
            console.log('predict the readRenderTargetPixels...');
            export2json({"image_data":Array.from(rawPixelData)}, 'r_'+(this.cfg.nerf_path.frame_id-1)+'.json'); 
        }

        if(this.cfg.nerf_path.frame_id > this.matrices['nerf_c2ws'].length){
            return this.predictSave();
        }else{
            this.requestFrame = window.requestAnimationFrame(this.predictFrame.bind(this));
        }

    }
    predictSave(){
        this.cfg.nerf_path.frame_id = 0;
        $("#rendering-state-predicting").hide();
        $("#rendering-state-output").show();
        this.capturer.stop();
        this.capturer.save();
        this.resetCameraPose();
        $("#rendering-state-output").hide();
        $("#rendering-status-warpper").hide();
        $("#control-bar").show();
        this.animate();
    }
    resetCameraPose(){
        if(this.cfg.controls_type == "nerf"){
            //reset camera position   
            this.camera.position.set(0,0,0);
            this.camera.rotation.set(0,0,0);           
            this.camera.up.set( 0, 1, 0 );                
        }else{
            this.camera.up.set( 0, 0, 1 );
            this.camera.position.set(
                this.cfg.camera_position.x,
                this.cfg.camera_position.y,
                this.cfg.camera_position.z
            ); 
        }    
    }
    nextNerfCameraPose(){
        var frame_id = this.cfg.nerf_path.frame_id % this.matrices['nerf_c2ws'].length;
        this.setNeRFCameraPose(frame_id);
        this.cfg.nerf_path.frame_id++;
    }
    setNeRFCameraPose(frame_id){
        this.camera.position.set(0,0,0);
        this.camera.rotation.set(0,0,0);
        this.camera.applyMatrix4(this.matrices['nerf_c2ws'][frame_id]);
    }
    vr(){
        var self = this;
        this.precompile();
        this.renderer.xr.enabled = true;
        document.body.appendChild(THREE.VRButton.createButton(this.renderer) );
        console.log('registered button');
        this.renderer.setAnimationLoop(function(){
            self.composeBary();
        });
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
    img.onerror = function(){
        console.error('failed to load: '+ url);
    }
}
$(document).ready(function() {
    console.log('version save to file');
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    if (typeof params.scene === 'undefined'){
        params.scene = '../../data/lego_single_basis/';
    }

    var need_return = 4;
    var count_return = 0;
    var configs = null, bary_ids = null, bary_weight = null, transforms_test = null;
    var bary_height = 0, bary_width = 0;
    var waiting_return = function(){
        count_return++;
        if(count_return >= need_return){
            if(transforms_test !== null){
                configs.nerf_path = transforms_test;
            }
            window.app = new NeXviewerApp(
                params.scene, configs, bary_ids, bary_weight, bary_height, bary_width,
                function(nexapp){
                    if (typeof params.vr !== 'undefined'){
                        console.log('VR rendering');
                        nexapp.vr();
                    }else{
                        console.log('PC rendering');
                        nexapp.regisControl();                  
                        nexapp.render();                            
                    }
                }
            );
        }
    };
   
    $.getJSON(params.scene+"/config.json").done(function(cfg){
        configs = cfg;
        waiting_return();
        var ext = 'png';
        if (typeof cfg.texture_ext !== 'undefined' && cfg.texture_ext == 'npy'){
            console.log('load npy weight')
            var npy = new npyjs();
            npy.load(params.scene+'/bary_indices.npy', function(data){
                bary_ids = data.data;
                bary_height = data.shape[0];
                bary_width = data.shape[1];
                waiting_return();
            });
            npy.load(params.scene+'/bary_weight.npy', function(data){
                bary_weight = data.data;
                waiting_return();
            });
        }else{
            load_image_pixel(params.scene+'/bary_indices.png', function(p_inds, height, width){
                bary_ids = p_inds;
                bary_height = height;
                bary_width = width;
                waiting_return();
            });
            load_image_pixel(params.scene+'/bary_weight.png', function(p_weight, height, width){
                bary_weight = p_weight;
                waiting_return();
            });
        }
    }).fail(function(err){
        document.getElementById("danger-modal").classList.add("is-active");
        document.getElementById("danger-model-text").innerHTML="<b>404:</b> Scene \""+params.scene+"\" doesn't not found";
    });
    $.getJSON(params.scene+"/transforms_test.json").done(function(transforms){
        transforms.frame_id = 0;
        transforms_test = transforms;
    }).always(function(){
        waiting_return();
    })
});