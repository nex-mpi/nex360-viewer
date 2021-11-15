import json 
import numpy as np

CONFIG_FILE = 'data/lego_v2_wrong_basis/config_bak.json'
OUTPUT_FILE = 'data/lego_v2_wrong_basis/config.json'

def convert_pose(C2W):
    flip_yz = np.eye(4)
    flip_yz[1, 1] = -1
    flip_yz[2, 2] = -1
    C2W = np.matmul(C2W, flip_yz)
    return C2W

def opencv2opengl(c2w):
    mat = np.zeros_like(c2w)
    mat[..., 0, 0] = 1.0
    mat[..., 1, 1] = -1.0
    mat[..., 2, 2] = -1.0
    mat[..., 3, 3] = 1.0
    c2w = c2w @ mat #flip camera rotation inward / outward
    c2w =  mat @ c2w #flip camera translation
    return c2w


def main():

    with open(CONFIG_FILE, 'r') as f:
        data = json.load(f)
    c2ws = np.asarray(data['c2ws']) 
    basis_align = np.asarray(data['basis_align'])
    basis_align = np.linalg.inv(basis_align)
    for i in range(c2ws.shape[0]):
        c2ws[i] = opencv2opengl(c2ws[i])
    data['c2ws'] = c2ws.tolist()
    data['basis_align'] = basis_align.tolist()
    print(data['basis_align'][0])
    exit()
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(data,f,sort_keys=True, indent=4)
    print('FINISHED CONVERT')

if __name__ == '__main__':
    main()