// custom implement NumpyTextureLoader
class NumpyTextureLoader{
    constructor(){
        this.npy = new npyjs();
    }
    load(filePath, callback){   
        var self = this;     
        var texture = new THREE.DataTexture(
            new Float32Array(4 * 1 * 1), 
            1, 
            1, 
            THREE.RGBAFormat, 
            THREE.FloatType
        );
        texture.internalFormat = 'RGBA32F';
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