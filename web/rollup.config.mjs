import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import babel from '@rollup/plugin-babel'

export default {
  input: 'src/main.jsx',
  output: { file: 'dist/assets/app.js', format: 'iife', name: 'AssignmentMap', sourcemap: false },
  plugins: [
    resolve({ extensions: ['.js', '.jsx'] }),
    commonjs(),
    json(),
    babel({ presets: [['@babel/preset-react', { runtime: 'automatic' }]], extensions: ['.js', '.jsx'], babelHelpers: 'bundled', exclude: 'node_modules/**' }),
  ],
}
