import nodeResolve from "@rollup/plugin-node-resolve";

export default [{
    input: 'lib/index.js',
    output: {
        file: 'dist/index.js',
        format: 'esm'
    },
    name: 'dnn',
    plugins: [
        nodeResolve({
            dedupe: ["rxjs", "rxjs/operators"],
            module: true,
            jsnext: true,
            main: true,
            modulesOnly: true
        })
    ]
    }
]
