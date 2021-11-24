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
        //add grid
        var gridGround = new THREE.GridHelper( 10, 30,0x777777, 0x777777 );
        this.scene.add(gridGround);
        //gridGround.rotation.x = Math.PI / 2;
      
        // BUILD A LEGO
        const originBox = new THREE.BoxGeometry(0.65, 1.2, 0.01);
        const originMat = new THREE.MeshBasicMaterial( { color: 0xcdba92, side: THREE.DoubleSide} );
        /*
        var lego_group = new THREE.Group();
        lego_group.add(new THREE.Mesh( originBox, originMat ))
        var lego_mainbox = new THREE.Mesh( new THREE.BoxGeometry(0.4, 0.8, 0.6), new THREE.MeshBasicMaterial( { color: 0xf6c924, side: THREE.DoubleSide} ) )
        lego_mainbox.position.y = 0.2;
        lego_mainbox.position.z = 0.3;
        lego_group.add(lego_mainbox);
        var lego_pickup = new THREE.Mesh( new THREE.BoxGeometry(0.3, 0.4, 0.2), new THREE.MeshBasicMaterial( { color: 0x957c1a, side: THREE.DoubleSide} ) )
        lego_pickup.position.y = -0.2;
        lego_pickup.position.z = 0.6;
        lego_group.add(lego_pickup);
        this.scene.add(lego_group);
        */

        this.virtual_camera =  new THREE.Mesh( new THREE.SphereGeometry(0.1, 32, 32), new THREE.MeshBasicMaterial( { color: 0x00ffff, side: THREE.DoubleSide} ) );
        this.projected_camera =  new THREE.Mesh( new THREE.SphereGeometry(0.1, 32, 32), new THREE.MeshBasicMaterial( { color: 0xffff00, side: THREE.DoubleSide} ) );
        this.virtual_camera.position.z = 4.0;
        this.scene.add(this.virtual_camera);
        this.scene.add(this.projected_camera);
        this.init_texture();
        // load texture;
        this.camera.position.z = 20; // TODO: support proper position        
        this.mpis = {};
        this.coneMat = new THREE.MeshBasicMaterial( { color: 0xff0000, side: THREE.DoubleSide} );
        this.coneTargetMat = new THREE.MeshBasicMaterial( { color: 0x00ff00, side: THREE.DoubleSide} );
        for(var i = 0; i < this.cfg.c2ws.length; i++)
        {
            const cone_geo = new THREE.ConeGeometry(0.1, 0.5);  
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
            var projected_location = localStorage.getItem('projected_camera_location');
            if(projected_location != null){
                projected_location = JSON.parse(projected_location);
                this.app.projected_camera.position.x = projected_location.x;
                this.app.projected_camera.position.y = projected_location.y;
                this.app.projected_camera.position.z = projected_location.z;
            }
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
    
});