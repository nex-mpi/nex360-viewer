// custom implement NumpyTextureLoader
class NumpyTextureLoader{
    constructor(format=format){
        this.npy = new npyjs();
        if(!format) format = THREE.RGBAFormat;
        this.format = format;
    }
    load(filePath, callback){   
        var self = this;     
        var texture = new THREE.DataTexture(
            new Float32Array(4 * 1 * 1), 
            1, 
            1, 
            this.format, 
            THREE.FloatType
        );
        texture.flipY = true; //flip to keep same behavior
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        this.npy.load(filePath, function(data){
            texture.image.data = data.data;
            texture.image.height = data.shape[0];
            texture.image.width = data.shape[1];
            texture.needsUpdate = true;
            callback(texture);
        });
        return texture;
    }
}

THREE.NumpyTextureLoader = NumpyTextureLoader;