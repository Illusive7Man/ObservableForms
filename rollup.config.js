import nodeResolve from "@rollup/plugin-node-resolve";
import sourcemaps from "rollup-plugin-sourcemaps";

export default [{
    input: 'src/js/index.js',
    output: {
        file: 'dist/index.js',
        format: 'esm',
        sourcemap: true
    },
    name: 'dnn',
    plugins: [
        nodeResolve({
            dedupe: ["rxjs", "rxjs/operators"],
            module: true,
            jsnext: true,
            main: true,
            modulesOnly: true
        }),
        sourcemaps()
    ],
    // dev optimizations
    // treeshake: false
    }
]
