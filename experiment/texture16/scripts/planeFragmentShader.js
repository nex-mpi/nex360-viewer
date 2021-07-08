var planeFragmentShader =  `
#ifdef GL_ES
precision highp float;
#endif
#define EPSILON 0.000000001

uniform sampler2D mpi_a1;
uniform sampler2D mpi_a2;
uniform sampler2D mpi_a3;
uniform sampler2D mpi_a4;
uniform sampler2D mpi_a5;
uniform sampler2D mpi_a6;
uniform sampler2D mpi_b;
uniform sampler2D mpi_c;
uniform sampler2D mpi_k1;
uniform sampler2D mpi_k2;
uniform sampler2D mpi_k3;
uniform sampler2D mpi_k4;
uniform sampler2D mpi_k5;
uniform sampler2D mpi_k6;
uniform sampler2D mpi_k7;
uniform sampler2D mpi_k8;

uniform int plane_id;
uniform float depth;

varying vec2 vUv;
varying vec3 vCoord; 


void main(void)
{
    gl_FragColor= vec4(1.0, 0.0, 0.0, 0.1);
}
`;