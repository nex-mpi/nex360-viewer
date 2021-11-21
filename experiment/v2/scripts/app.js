class NeXviewerApp{
    constructor(cfg, callback){
        this.prepareConfig(cfg);
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
    simpleCube(owner){
        //add simple cube to scene to make sure everything work
        const geometry = new THREE.BoxGeometry();
        const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
        console.log(owner);
        owner.cube = new THREE.Mesh( geometry, material );
        owner.scenes[0].add(owner.cube)
        owner.scenes[1].add(owner.cube)
        owner.scenes[2].add(owner.cube)
    }
    prepareConfig(cfg){
        this.cfg = cfg;
        //init configuration
        if (typeof this.cfg.compose_mode === 'undefined'){
            if(this.cfg.hasOwnProperty('delaunay') && this.cfg['delaunay']){
                this.cfg.compose_mode = 'bary';
            } else{
                this.cfg.compose_mode = 'linear';
                $('#sel-plane-combine option[value=bary]').hide();
            }
            // update ui selector
            $('#sel-plane-combine option[value='+this.cfg.compose_mode+']').attr('selected','selected');
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
        if (typeof this.cfg.offset === 'undefined'){
            this.cfg.offset = 0;
        }
        if (typeof this.cfg.num_basis === 'undefined'){
            this.cfg.num_basis = 8;
        }
        if (typeof this.cfg.background_color === 'undefined'){
            this.background_color = "white";
        }
        if (typeof this.cfg.camera_position === 'undefined'){
            //set default camera location to first MPI location
            var mpi_id = 27;
            this.cfg.camera_position = {
                "x": this.cfg.c2ws[mpi_id][0][3],
                "y": this.cfg.c2ws[mpi_id][1][3],
                "z": this.cfg.c2ws[mpi_id][2][3]
            };
        }
        if(this.cfg.hasOwnProperty('delaunay') && this.cfg['delaunay']){
            //prepare barycentric
            this.cfg['bary']['scaler'] = new THREE.Vector2(this.cfg['bary']['width'] - 1.0, this.cfg['bary']['height']-1.0);
            this.cfg['bary']['anchor'] = -1;
        }
        //prepare zip.js
        var zip_workers =  ["../../scripts/thrid-party/z-worker.js"]
        zip.configure({ workerScripts: { deflate: zip_workers, inflate: zip_workers} });
    }
    initThreejs(){
        // intial stat
        this.stats = new Stats();
        this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
        document.body.appendChild(this.stats.dom);
 
        // initial global thing
        var targetHeight = this.cfg['height'];
        var targetWidth = this.cfg['width']; // window.innerWidth 
        var ratio = targetWidth / targetHeight;
        //find fov_degree, which are fov in vertical direction
        // @see https://threejs.org/docs/#api/en/cameras/PerspectiveCamera.fov
        //var fov_height_tan = 0.5 * this.cfg['height']  / this.cfg['focal']
        var fov_radian = 2.0 * Math.atan(0.5 * this.cfg['height'] /  this.cfg['focal']) ;
        this.cfg.fov_degree = fov_radian * 180 / Math.PI
        this.camera = new THREE.PerspectiveCamera(this.cfg.fov_degree, ratio, 0.0001, 1000 );
        this.camera.filmGauge = this.cfg['width'];
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
        var glContext = this.renderer.getContext();
        var maxTextureSize = glContext.getParameter(glContext.MAX_TEXTURE_SIZE);
        var maxImageUnit = glContext.getParameter(glContext.MAX_TEXTURE_IMAGE_UNITS)
        if(!this.renderer.capabilities.isWebGL2) error_dialogue("<b>WEBGL2:</b> This page require WebGL2 to be render.");
        this.renderer.context.canvas.addEventListener("webglcontextlost", function(event){
            event.preventDefault();
            error_dialogue("<b>WEBGL_CONTEXT_LOSS:</b> Your machine doesn't have enough memory to render this scene");
        }, false);
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement );
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        //this.renderer.setPixelRatio( window.devicePixelRatio ); //enable to render on HI-DPI screen
        this.renderer.setSize( targetWidth, targetHeight);
        if(this.background_color == 'black'){
            this.renderer.setClearColor( 0x000000, 1 );
        } else {
            this.renderer.setClearColor( 0xffffff, 1 );
        }
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
        this.captured_frame = [];
        document.getElementById('threejs-wrapper').appendChild(this.renderer.domElement );
    }
    getPlaneDepth(planeId, mpiId){
        if(Array.isArray(this.cfg.planes[0])){
            return this.cfg.planes[mpiId][planeId]
        }else{
            return this.cfg.planes[planeId]
        }
    }
    countPlanes(mpiId){
        if(Array.isArray(this.cfg.planes[0])){
            return this.cfg.planes[mpiId].length;
        }else{
            return this.cfg.planes.length;
        }
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
        var num_mpis = this.textures["num"]["mpi"].length;
        if(num_mpis < 2){
            this.mpis_ids = [0,0,0];
        }else{
            this.mpis_ids = [0,1,2];
        }
        var fov_width_tan = 0.5 * this.cfg['width']  / this.cfg['focal']; 
        var fov_height_tan = 0.5 * this.cfg['height']  / this.cfg['focal'];
        for(var mpiId = 0; mpiId < num_mpis; mpiId++) 
        {
            var plane_width_ratio = ((this.cfg['width'] / 2.0) + this.cfg['offset'][mpiId]) / (this.cfg['width']  / 2.0);
            var plane_height_ratio = ((this.cfg['height']  / 2.0) + this.cfg['offset'][mpiId]) / (this.cfg['height']  / 2.0);   
            this.mpis[mpiId] = {
                "planes": [],
                "group": new THREE.Group()
            };
            this.materials[mpiId] = [];
            var basis_align = new THREE.Matrix3();
            var m = this.cfg.basis_align[mpiId];
            basis_align.set(m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[0][1], m[2][2]);
            for(var i = 0; i < this.cfg['planes'][mpiId].length; i++){
                var depth = this.cfg['planes'][mpiId][i];
                var plane_width = fov_width_tan * (depth * plane_width_ratio) * 2.0;
                var plane_height = fov_height_tan * (depth * plane_height_ratio) * 2.0;
                var plane_geo = new THREE.PlaneGeometry(plane_width, plane_height);
                var layer_id = Math.floor(i / this.cfg.num_sublayers[mpiId])
                this.materials[mpiId].push(new THREE.ShaderMaterial({
                    transparent: true,
                    uniforms: {   
                        alpha_ch: {value: i % 4},
                        plane_id: {value: i},
                        basis_align: {value: basis_align},
                        mpi_a: { type: "t", value: this.textures[mpiId]['alpha'][Math.floor(i/4)]},
                        mpi_b0: { type: "t", value: this.textures[mpiId]['basis'][0]},
                        mpi_b1: { type: "t", value: this.textures[mpiId]['basis'][1]},
                        mpi_c: { type: "t", value: this.textures[mpiId]['color'][layer_id]},
                        mpi_k0: { type: "t", value: this.textures[mpiId]['coeff'][layer_id][0]},
                        mpi_k1: { type: "t", value: this.textures[mpiId]['coeff'][layer_id][1]},
                        mpi_k2: { type: "t", value: this.textures[mpiId]['coeff'][layer_id][2]},
                        mpi_k3: { type: "t", value: this.textures[mpiId]['coeff'][layer_id][3]},
                        mpi_k4: { type: "t", value: this.textures[mpiId]['coeff'][layer_id][4]},
                        mpi_k5: { type: "t", value: this.textures[mpiId]['coeff'][layer_id][5]},
                    },
                    vertexShader: planeVertexShader,
                    fragmentShader: planeFragmentShader,
                }));
                this.mpis[mpiId].planes.push(new THREE.Mesh(plane_geo, this.materials[mpiId][i])); 
                this.mpis[mpiId].planes[i].position.z = -depth; 
                this.mpis[mpiId].group.add(this.mpis[mpiId].planes[i]);
            }
            var c2w = this.matrices['c2ws'][mpiId].clone();
            this.mpis[mpiId].group.applyMatrix4(c2w);
            //this.scenes[0].add(this.mpis[mpiId].group);
        }
        //add inital scene
        for(var i = 0; i < 3; i++){
            this.scenes[i].add(this.mpis[this.mpis_ids[i]].group);
        }
    }   
    loadTexture(callback){
        //document.getElementById('progress-texture-wrapper').style.display = 'block';
        $('#progress-barycentric-wrapper').hide();
        $('#progress-texture-wrapper').show();
        //TODO: REMOVE when debug
        var self = this;
        var num_mpis = this.cfg.c2ws.length;
        /*
        var num_mpis = 1;
        this.cfg.compose_mode = 'closet';
        this.composers[0].renderToScreen = true;
        this.blendComposer.renderToScreen = false;
        */
        //count number of files to load.
        var num_files = {'total': 0, 'mpi':[]};
        for(let i = 0; i < num_mpis; i++){
            let mpi_files = {};
            mpi_files['alpha'] = Math.ceil(this.cfg['planes'][i].length / 4); 
            mpi_files['basis'] = Math.ceil(this.cfg['num_basis'] / 4); 
            mpi_files['color'] = this.cfg['num_layers'][i];
            mpi_files['coeff'] = Math.ceil(this.cfg['num_basis'] * 3 / 4); 
            mpi_files['total'] = mpi_files['alpha'] + mpi_files['basis'] + mpi_files['color'] + (this.cfg['num_layers'][i] * mpi_files['coeff']);
            num_files['mpi'].push(mpi_files)
            num_files['total'] += mpi_files['total'];
        }
        this.textures = {'num': num_files}
        var loaded_texture = 0;
        var texloader = new THREE.TextureLoader();
        var alphaLoader = texloader;
        if(this.cfg.texture_ext == 'npy'){
            alphaLoader = new THREE.NumpyTextureLoader();
        }
        var self = this;
        var progressbarUpdate = function(){
            loaded_texture++;
            document.getElementById('progress-texture-val').value = (loaded_texture / num_files['total']) * 100.0;
            document.getElementById('progress-texture-text').innerText = ''+loaded_texture+' / '+num_files['total'];
            if(loaded_texture >= num_files['total']){
                document.getElementById('progress-texture-wrapper').style.display = 'none';
                callback();
            }
        }
        var count_mpi_load = 0;
        var loaded_files_on_mpi = 0;
        var mpiTextureCallback = function(texture){
            loaded_files_on_mpi++;
            self.renderer.initTexture(texture);
            if(loaded_files_on_mpi>=num_files['mpi'][count_mpi_load]['total']){
                count_mpi_load++;
                if(count_mpi_load < num_mpis){
                    loaded_files_on_mpi = 0;
                    window.setTimeout(function(){
                        loadMpis(count_mpi_load);
                    }, 10); // need to a delay to fool chrome to avoid insufficient load error.
                }
            }
            progressbarUpdate();
        }  
        var loadMpis = function(mpiId){
            self.textures[mpiId] = {'alpha':[],'basis':[],'color':[], 'coeff': []};      
            var shortkey = {'alpha': 'a', 'basis': 'b', 'color': 'c', 'coeff': 'k'};
            var mpi_pad_id = String(mpiId).padStart(2, '0');
            // load alpha/basis/color texture
            ['alpha', 'basis', 'color'].forEach(function(keyname){
                for(var j=0; j < num_files['mpi'][mpiId][keyname]; j++){
                    var layer_id = String(j).padStart(2, '0')
                    var url = self.cfg['scene_url']+"/mpi"+mpi_pad_id+"_"+shortkey[keyname]+layer_id+"."+self.cfg.texture_ext;
                    var texture = alphaLoader.load(url, mpiTextureCallback)
                    self.textures[mpiId][keyname].push(texture);
                }
            })
            // load coefficent texture
            for(var j=0; j<num_files['mpi'][mpiId]['color']; j++){
                var layerTextures = [];
                var layer_id = String(j).padStart(2, '0')
                for(var k = 0; k < num_files['mpi'][mpiId]['coeff']; k++){
                    var url = self.cfg['scene_url']+"/mpi"+mpi_pad_id+"_k"+layer_id+"_"+k+"."+self.cfg.texture_ext;
                    var texture = alphaLoader.load(url, mpiTextureCallback);
                    layerTextures.push(texture);
                }
                self.textures[mpiId]['coeff'].push(layerTextures);
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
        var nerf2glmat = new THREE.Matrix4();
        nerf2glmat.set(
            1.0,  0.0, 0.0, 0.0,
            0.0,  0.0, 1.0, 0.0,
            0.0, -1.0, 0.0, 0.0,
            0.0,  0.0, 0.0, 1.0
        );
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
                //c2w.premultiply(nerf2glmat)
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
    rotateMpi(scene_id, mpi_id){
        var prev_id = this.mpis_ids[scene_id];
        if(prev_id == mpi_id && this.scenes[scene_id].children.length== 1) return ; // do not update if no change
        //clear scene
        for( var i = this.scenes[scene_id].children.length - 1; i >= 0; i--) { 
            this.scenes[scene_id].remove(this.scenes[scene_id].children[i]); 
        }
        //add mpi to scene
        this.scenes[scene_id].add(this.mpis[mpi_id].group);
        if(this.scenes[scene_id].children.length != 1){
            console.error("detech: mpi_id => "+mpi_id);
        }
        this.mpis_ids[scene_id] = mpi_id;
    }
    setSceneDepth(scene_id, mpi_id, applyMaterial=true){
        for(var planeId = 0; planeId < this.mpis[scene_id].planes.length; planeId++){
            if(applyMaterial) this.mpis[scene_id].planes[planeId].material = this.materials[mpi_id][planeId];
            this.mpis[scene_id].planes[planeId].position.z = -this.cfg.planes[mpi_id][planeId];
        }
    }
    getSceneDepth(scene_id){
        var output  = [];
        for(var planeId = 0; planeId < 192; planeId++){
            output.push(this.mpis[scene_id].planes[planeId].position.z);
        }
        return output;
    }
    composeFrame(){
        console.log(this.cfg.compose_mode);
        if(this.cfg.compose_mode == 'closet'){
            this.composeSingle();
        } else if (this.cfg.compose_mode == 'linear'){
            this.composeLinear();
        } else if(this.cfg.compose_mode == 'bary'){
            this.composeBary();
        }else{
            console.error('composeFrame failed to use cfg.compose_mode == ' + this.cfg.compose_mode);
        }
    }
    composeSingle(){
        var linear = this.linear();
        //linear is sorted by distance, so it garantee that first on the list is always cloest MPI.
        var id = linear['ids'][0];
        this.write_camera_location([id]);
        this.rotateMpi(0, id);
        this.composers[0].render();  
    }
    projectCamToRing(){
        var mpi00_cam = new THREE.Vector3(this.cfg.c2ws[0][0][3], this.cfg.c2ws[0][1][3], this.cfg.c2ws[0][2][3]);
        var position = this.camera.position.clone();
        var mpi_radius = mpi00_cam.length();
        var cam_radius = position.length();
        var focal = this.cfg.focal;
        var cy = this.cfg.height / 2.0;
        var cx = this.cfg.width / 2.0
        //note that, need to flip y,z axis.
        var intrinsic = new THREE.Matrix3();
        intrinsic.set(
            focal,   0.0,  cx,
              0.0, -focal,  cy,
              0.0,   0.0, -1.0
        )
        var c2w = this.camera.matrixWorld.clone().elements;
        var rot = new THREE.Matrix3();
        rot.set(
            c2w[0], c2w[4], c2w[8],
            c2w[1], c2w[5], c2w[9],
            c2w[2], c2w[6], c2w[10]           
        );
        var direction = new THREE.Vector3(cx, cy, 1.0); 
        direction.applyMatrix3(intrinsic.clone().invert());
        direction.applyMatrix3(rot);
        //solve for (position + vec_size * direction)**2 = (mpi_radius) ** 2
        //using quadratic formular @see https://en.wikipedia.org/wiki/Quadratic_formula
        var b = (position.x * direction.x) + (position.y * direction.y) + (position.z * direction.z);
        var c =  (cam_radius * cam_radius) - (mpi_radius * mpi_radius);
        var vec_size = -b - Math.sqrt((b*b) - c);
        var projected_cam = position.clone().addScaledVector(direction, vec_size);
        return projected_cam;
    }
    linear(){
        //return weights and ids same as bary function
        var projected_cam = this.projectCamToRing();
        var distances = []
        for(var i=0; i < this.cfg['c2ws'].length; i++){
            var c2w = this.cfg['c2ws'][i];
            var distance = new THREE.Vector3(c2w[0][3], c2w[1][3], c2w[2][3])
            distance.sub(projected_cam)
            distances.push({'id': i, 'distance': distance.length()});
        }
        var mpi_inds = distances.sort(function(a,b){
            return a['distance'] > b['distance'];
        })
        var w0 = mpi_inds[1]['distance'];
        var w1 = mpi_inds[0]['distance'];
        var w_sum = w0 + w1;
        return {
            'ids': [mpi_inds[0]['id'], mpi_inds[1]['id']],
            'weights': [w0 / w_sum, w1 / w_sum],
        };
    }
    composeLinear(){
       var linear = this.linear();
       this.write_camera_location(linear['ids']);
       for(var b = 0; b < 2; b++){
           this.rotateMpi(b, linear['ids'][b]);
           this.composers[b].render();  
       }
       this.blendPass.uniforms.weight1.value = linear['weights'][0];
       this.blendPass.uniforms.weight2.value = linear['weights'][1];
       this.blendPass.uniforms.weight3.value = 0.0;
       this.blendComposer.render();
    }
    composeBary(){       
        var bary = this.bary();  
        this.write_camera_location(bary['ids']);
        // same mpi can render only onetime, so we combine weight (avoid scene graph conflict)
        if(bary['ids'][0] == bary['ids'][1]){
            bary['weights'][0] += bary['weights'][1];
            bary['weights'][1] = 0.0;
            bary['weights'][1] = 0.0;
            this.mpis_ids[1] = bary['ids'][0];
        }
        if(bary['ids'][0] == bary['ids'][2]){
            bary['weights'][0] += bary['weights'][2];
            bary['weights'][2] = 0.0;
            this.mpis_ids[2] = bary['ids'][0];
        }
        if(bary['ids'][1] == bary['ids'][2]){
            bary['weights'][1] += bary['weights'][2];
            bary['weights'][2] = 0.0;
            this.mpis_ids[2] = bary['ids'][1];
        }
        var sum_weight = bary['weights'][0] + bary['weights'][1] + bary['weights'][2];
        for(var b = 0; b < 3; b++){
            if(bary['weights'][b] == 0.0) continue;
            bary['weights'][b] = bary['weights'][b] / sum_weight;
            var id = bary['ids'][b];
            this.rotateMpi(b, id);
            /*
            if(this.scenes[b].children.length != 1){
                console.error("detech: scene=> " + b+" mpi_id => "+id);
                //console.log(bary['ids']);
                //console.log(bary['weights'][b]);
                console.log(this.mpis_ids);
                console.log(bary['ids']);
                console.log(bary['weights'][b]);
            }*/
            // render each MPI_scene
            this.composers[b].render();            
         }
         /*
         bary['weights'][0] = 1.0;
         bary['weights'][1] = 0.0;
         bary['weights'][2] = 0.0;
         */
         //render the weight 3-combine mpi_scene
         this.blendPass.uniforms.weight1.value = bary['weights'][0];
         this.blendPass.uniforms.weight2.value = bary['weights'][1];
         this.blendPass.uniforms.weight3.value = bary['weights'][2];
         this.blendComposer.render();
    }
    precompile(){
        var num_mpi = this.textures["num"]["mpi"].length;
        for(var i = 0; i < 3; i++){
            this.renderer.compile(this.scenes[i], this.camera);
        }        
    }
    render(){  
        this.precompile();      
        this.animate();
    }
    bary(){
        var cam_loc = this.camera.position.clone();
        // convert to opencv converntion
        cam_loc.y = cam_loc.y * -1;
        cam_loc.z = cam_loc.z * -1;
        var stereo_loc = this.sterographicProjection(cam_loc.normalize());
        var anchor = this.getBaryAnchor(stereo_loc);
        this.writeBaryAnchor(anchor);
        if(anchor == this.anchor && this.bary_data) return this.bary_data;
        this.anchor = anchor;
        var ids = [], weights = [];
        for(var i = 0; i < 3; i++){
            if(this.cfg.texture_ext == 'npy'){ 
                ids.push(this.cfg['bary']['ids'][anchor+i]);
                weights.push(this.cfg['bary']['weights'][anchor+i]);            
            }else{
                ids.push(this.color2id(this.cfg['bary']['ids'][anchor+i]));
                weights.push(this.color2float(this.cfg['bary']['weights'][anchor+i]));
            }
        }
        this.bary_data = {"ids": ids, "weights": weights};
        return this.bary_data;        
    }
    getBaryAnchor(v){
        // get the location in data array of bary_indices/bary_weight from stereo_loc
        v.clampScalar(-1.0,1.0);
        v.addScalar(1.0);
        v.multiplyScalar(0.5);
        v.multiply(this.cfg['bary']['scaler']);
        v.round();
        // if we draw png to canvas first it will become 4 channel
        var num_channel = (this.cfg.texture_ext == 'png') ? 4 : 3;
        return (v.y * this.cfg['bary']['width'] + v.x) * num_channel;
    }
    writeBaryAnchor(anchor){ 
        anchor = anchor / 4;       
        localStorage.setItem('bary_anchor',JSON.stringify({
            'x': anchor % this.cfg['bary']['width'], 
            'y': Math.floor(anchor / this.cfg['bary']['width'],)
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
        // y is "up" or a projection axis
        var divder = (1.0 - vec.y)  + 1e-7;
        return  new THREE.Vector2(
            vec.x / divder,
            vec.z / divder
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
            self.predictFrame();
        });
    }
    predictFrame(){
        $("#rendering-count").text(this.cfg.nerf_path.frame_id + 1);
        this.stats.begin();
        this.nextNerfCameraPose();
        if(this.cfg.texture_ext == "npy"){
            //save raw float32 output from webgl
            this.composeFrame(); //render the image to canvas
            const blendBuffer = this.blendComposer.writeBuffer
            var rawPixelData = new Float32Array(blendBuffer.width * blendBuffer.height*4);
            // re-rendered to  texture to save a file. Should change to render only 1 time and save to file
            this.blendComposer.renderToScreen = false;
            this.composeFrame();  
            this.blendComposer.renderToScreen = true;
            this.captured_frame.push(rawPixelData);
        }else{
            //capture png from canvas
            this.composeFrame();
            var pixelData = this.renderer.domElement.toDataURL();
            this.captured_frame.push(pixelData);
        }

        if(this.cfg.nerf_path.frame_id >= this.matrices['nerf_c2ws'].length){
            return this.predictSave();
        }else{
            this.requestFrame = window.requestAnimationFrame(this.predictFrame.bind(this));
        }

    }
    async predictSave(){
        if(this.cfg.texture_ext == 'npy'){
            for(var i = 0; i < this.captured_frame.length; i++){
                this.captured_frame[i] = Array.from(this.captured_frame[i])
            }
            export2json({"images": this.captured_frame}, 'rendered.json'); 
        }else{
            try {
                $("#rendering-state-predicting").hide();
                $("#rendering-text").show();
                //create zip and download 
                var zipWriter = new zip.ZipWriter(new zip.BlobWriter("application/zip"));
                for(var i = 0; i < this.captured_frame.length; i++){
                    $("#rendering-text").html("<b>adding files to zip...</b> "+i+" / "+this.captured_frame.length);
                    var fileName = (''+i).padStart(4, '0') + '.png'
                    await zipWriter.add(
                        fileName, 
                        new zip.Data64URIReader(this.captured_frame[i]), 
                        {
                            bufferedWrite: true,
                        }
                    );
                }
                //download zip from blob
                const blobData = await zipWriter.close({
                    "onprogress": function(step_id, num_step){
                        $("#rendering-text").text("compressing zip "+step_id+" / "+num_step);
                    }
                })
                const blobURL = URL.createObjectURL(blobData);
                const anchor = document.createElement("a");
				const clickEvent = new MouseEvent("click");
				anchor.href = blobURL;
				anchor.download = "nex360.zip";
				anchor.dispatchEvent(clickEvent);
            } catch (error) {
                alert(error);
            }
        }
        this.captured_frame = [];
        this.cfg.nerf_path.frame_id = 0;
        $("#rendering-text").hide();
        $("#rendering-state-predicting").hide();
        $("#rendering-state-output").show();
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
            this.camera.up.set( 0, 1, 0 );
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
function error_dialogue(message){
    document.getElementById("danger-modal").classList.add("is-active");
    document.getElementById("danger-model-text").innerHTML=message;
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
        callback(undefined, {'data':data, 'height': this.height, 'width': this.width});
    }
    img.onerror = function(err){
        callback(err);
    }
}
// ON READY
$(document).ready(function() {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    if (typeof params.scene === 'undefined'){
        params.scene = '../../data/lego_v2/';
    }
    //first seek for config.js
    $.getJSON(params.scene+"/config.json").done(function(cfg){
        var need_return = 1;
        var count_return = 0;
        var waiting_return = function(){
            count_return++;
            if(count_return >= need_return){
                window.app = new NeXviewerApp(cfg,
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
        }
        cfg['scene_url'] = params.scene;
        //check if use denaulay 
        var  has_delaunay =  cfg.hasOwnProperty('delaunay') && cfg['delaunay'];
        if(has_delaunay){
            // need to load bary_ids and bary_weights;
            cfg['bary'] = {};
            need_return += 2;
            if(cfg.texture_ext == 'npy'){
                var npy = new npyjs();
                npy.load(params.scene+'/bary_indices.npy', function(data){
                    cfg['bary']['ids'] = data.data;
                    cfg['bary']['height'] = data.shape[0];
                    cfg['bary']['width'] = data.shape[1];
                    waiting_return();
                });
                npy.load(params.scene+'/bary_weight.npy', function(data){
                    cfg['bary']['weight'] = bary_weight;
                    waiting_return();
                });
            }else{
                load_image_pixel(params.scene+'/bary_indices.png', function(err, data){
                    if(err) error_dialogue("<b>404:</b> Scene \""+params.scene+"\" require bary_indices.png");
                    cfg['bary']['ids'] = data['data'];
                    cfg['bary']['height'] = data['height'];
                    cfg['bary']['width'] = data['width'];
                    waiting_return();
                });
                load_image_pixel(params.scene+'/bary_weight.png', function(err, data){
                    if(err) error_dialogue("<b>404:</b> Scene \""+params.scene+"\" require bary_weight.png");
                    cfg['bary']['weights'] = data['data'];
                    waiting_return();
                });
            }
        }
        $.getJSON(params.scene+"/transforms_test.json").done(function(transforms){
            transforms.frame_id = 0;
            cfg['nerf_path'] = transforms;
        }).always(function(){
            waiting_return();
        })
        
    }).fail(function(err){
        console.error(err);
        error_dialogue("<b>404:</b> Scene \""+params.scene+"\" doesn't not found");
    })
});