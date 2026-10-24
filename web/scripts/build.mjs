#!/usr/bin/env node
// build — commit hash 주입 → rollup → index.html/styles.css 복사. 순수 JS, 네이티브 바이너리 없음.
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { rollup } from 'rollup'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cwd = process.cwd()

let commit = 'dev'
try { commit = execSync('git rev-parse --short HEAD', { cwd: cwd + '/..' }).toString().trim() } catch {}

fs.writeFileSync(cwd + '/src/lib/commit.js', `// build.mjs가 생성\nexport default '${commit}'\n`)

const plugins = [
  require('@rollup/plugin-node-resolve').default({ extensions: ['.js', '.jsx'] }),
  require('@rollup/plugin-commonjs')(),
  require('@rollup/plugin-json')(),
  require('@rollup/plugin-babel').default({
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'automatic' }]],
    extensions: ['.js', '.jsx'], babelHelpers: 'bundled', exclude: 'node_modules/**',
  }),
]

const bundle = await rollup({ input: cwd + '/src/main.jsx', plugins, external: [] })
await bundle.write({ file: cwd + '/dist/assets/app.js', format: 'iife', name: 'AssignmentMap',
  intro: "const process={env:{NODE_ENV:'production'}};" })
await bundle.close()

const html = fs.readFileSync(cwd + '/index.html', 'utf8')
  .replace('./assets/app.js', `./assets/app.js?v=${commit}-${Date.now().toString(36)}`)
  .replace('./styles.css', `./styles.css?v=${commit}-${Date.now().toString(36)}`)
fs.writeFileSync(cwd + '/dist/index.html', html)
fs.copyFileSync(cwd + '/src/styles.css', cwd + '/dist/styles.css')

const kb = (fs.statSync(cwd + '/dist/assets/app.js').size / 1024).toFixed(1)
console.log(`BUILD OK — dist/assets/app.js ${kb}KB (commit ${commit})`)
