var blendFragmentShader = `
uniform sampler2D bloomTexture;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;