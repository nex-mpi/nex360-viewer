 vec2 loc = vUv;
                loc[0] = vUv / float(num_col);
                loc[0] = loc[0] + (float(color_layer) / float(num_col));
                loc[1] = vUv / float(num_row);
                //gl_FragColor= vec4(1.0, 0.0, 0.0 ,0.1);
                vec3 color = texture(mpi_c, loc);
                gl_FragColor= vec4(color ,0.5);