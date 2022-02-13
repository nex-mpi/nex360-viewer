// World for visualization

class NeXworld{
    constructor(cfg){
        this.cfg = cfg
        this.intial();
    }
    intial(){
        // inital global thing
        this.scene = new THREE.Scene();
        var ratio = window.innerWidth / window.innerHeight
        this.previous_mpi = [0,0,0];
        this.camera = new THREE.PerspectiveCamera(this.cfg.fov_degree, ratio, 0.1, 1000 );
        this.camera.up.set( 0, 1, 0 );
        this.renderer = new THREE.WebGLRenderer({ alpha: true }); 
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.setClearColor( 0x3a3a3a, 1 ); //change to white background
        document.body.appendChild(this.renderer.domElement );       
        // prepare scene  
        var grid_size = (this.cfg.dataset_type == 'tank') ? 3 : 10;
        var sphere_size = (this.cfg.dataset_type == 'tank') ? 0.05 : 0.1;
        var cone_sharp =  (this.cfg.dataset_type == 'tank') ? 0.15 : 0.3;
        //add grid
        var gridGround = new THREE.GridHelper( grid_size, 30,0x777777, 0x777777 );
        this.scene.add(gridGround);
        this.virtual_camera =  new THREE.Mesh( new THREE.SphereGeometry(sphere_size, 32, 32), new THREE.MeshBasicMaterial( { color: 0x00ffff, side: THREE.DoubleSide} ) );
        this.virtual_camera.position.z = 4.0;
        this.scene.add(this.virtual_camera);
        //this.projected_camera =  new THREE.Mesh( new THREE.SphereGeometry(0.1, 32, 32), new THREE.MeshBasicMaterial( { color: 0xffff00, side: THREE.DoubleSide} ) );
        //this.scene.add(this.projected_camera);
        const objLoader = new THREE.OBJLoader();
        var self = this;
        objLoader.load(
            this.cfg['scene_url'] + '/mesh_basecolor.obj', function ( object ) {
                var light = new THREE.AmbientLight(0xffffff);
                self.scene.add(light);
                self.scene.add(object);
            },
            function (xhr) {
            },
            function (error) {
                console.error(error)
            }
        )

        this.init_texture();
        // load texture;
        this.camera.position.z = 20;
        if(this.cfg.dataset_type == "blender"){
            this.camera.position.set(-0.3453558364400958, 6.487606184146768, 10.417565564878583);
        }else if(this.cfg.dataset_type == "tank"){
            this.camera.position.set(1.7902465040373388, 0.6028678793124961, 0.035601054228582465);
        }
        this.mpis = {};
        this.coneMat = new THREE.MeshBasicMaterial( { color: 0xff0000, side: THREE.DoubleSide} );
        this.coneTargetMat = new THREE.MeshBasicMaterial( { color: 0x00ff00, side: THREE.DoubleSide} );
        for(var i = 0; i < this.cfg.c2ws.length; i++)
        {
            const cone_geo = new THREE.ConeGeometry(sphere_size, cone_sharp);  
            this.mpis[i] = {}              
            this.mpis[i]['cone'] = new THREE.Mesh(cone_geo, this.coneMat); 
            this.mpis[i]['cone'].rotation.x = Math.PI / 2.0;
            var c2w = this.matrices['c2ws'][i].clone();
            this.mpis[i]['cone'].applyMatrix4(c2w);
            this.scene.add(this.mpis[i]['cone']);
        }
        this.mpis[0]['cone'].material = this.coneTargetMat;
    }
    init_texture(){
        this.matrices = {
            'c2ws': [],
            'w2cs': []
        }
        for(var i = 0; i < this.cfg.c2ws.length; i++){
            var c2w_arr = this.cfg.c2ws[i];
            var c2w = new THREE.Matrix4();
            //set is row major, internal is column major
            c2w.set(
                c2w_arr[0][0], c2w_arr[0][1], c2w_arr[0][2], c2w_arr[0][3],
                c2w_arr[1][0], c2w_arr[1][1], c2w_arr[1][2], c2w_arr[1][3],
                c2w_arr[2][0], c2w_arr[2][1], c2w_arr[2][2], c2w_arr[2][3],
                c2w_arr[3][0], c2w_arr[3][1], c2w_arr[3][2], c2w_arr[3][3] 
            );
            this.matrices['c2ws'].push(c2w);
            //this.matrices['w2cs'].push(c2w.clone().invert());
        }
        var c2w = new THREE.Matrix4();        
    }
    animate(){
        this.renderer.render(this.scene, this.camera );
        this.controls.update();  
        requestAnimationFrame(this.render.bind(this));
    }
    render(){
        this.renderer.compile(this.scene, this.camera);
        this.animate();
    }
}

$(document).ready(function() {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    if (typeof params.scene === 'undefined'){
        params.scene = 'data/lego_v2';
    }
    
    
    $.getJSON(params.scene + '/config.json', function(cfg) {
        cfg['scene_url'] = params.scene;
        window.app = new NeXworld(cfg);
        window.app.render();    
        function onStorageChange(){
            var camera_location = localStorage.getItem('camera_location');
            if(camera_location != null){
                camera_location = JSON.parse(camera_location);
                this.app.virtual_camera.position.x = camera_location.x;
                this.app.virtual_camera.position.y = camera_location.y;
                this.app.virtual_camera.position.z = camera_location.z;
            }
            /*
            var projected_location = localStorage.getItem('projected_camera_location');
            if(projected_location != null){
                projected_location = JSON.parse(projected_location);
                this.app.projected_camera.position.x = projected_location.x;
                this.app.projected_camera.position.y = projected_location.y;
                this.app.projected_camera.position.z = projected_location.z;
            }
            */
            var bary_address = localStorage.getItem('bary_address');
            if(bary_address != null){
                bary_address = JSON.parse(bary_address);
                if(bary_address.length != this.app.previous_mpi.length){
                    for(var i = 0; i < this.app.previous_mpi.length; i++){
                        this.app.mpis[this.app.previous_mpi[i]].cone.material = this.app.coneMat;
                    }
                }
                for(var i = 0; i < bary_address.length; i++){
                    this.app.mpis[this.app.previous_mpi[i]].cone.material = this.app.coneMat;
                    this.app.mpis[bary_address[i]].cone.material = this.app.coneTargetMat;
                    this.app.previous_mpi[i] = bary_address[i]
                }
            }
        }
        onStorageChange();  
        window.addEventListener("storage", onStorageChange, false);
    }); 
    $.getJSON(params.scene + '/transforms_train.json',function(){
        

    }).fail(function(){})
    
});