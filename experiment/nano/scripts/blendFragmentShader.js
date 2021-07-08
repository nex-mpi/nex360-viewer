var blendFragmentShader = `
precision highp float;

uniform sampler2D mpi1;
uniform sampler2D mpi2;
uniform sampler2D mpi3;
uniform float weight1;
uniform float weight2;
uniform float weight3;

varying vec2 vUv;
void main()
{
	//gl_FragColor = vec4(0.0,0.0,0.0,1.0);
	vec4 m1 = texture2D(mpi1, vUv);
	vec4 m2 = texture2D(mpi2, vUv);
	vec4 m3 = texture2D(mpi3, vUv);
	vec4 color = (weight1*m1) + (weight2*m2) + (weight3*m3);
	//vec4 color = m1;
	gl_FragColor = color;
}
`;