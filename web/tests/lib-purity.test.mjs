// 테스트 격리 가드 — web/tests/*.test.mjs 가 CI 에서 node_modules 없이 돌 수 있는지 검사한다.
//
// 왜: deploy 워크플로는 web/node_modules 설치(npm ci) **전에** 루트에서 `npm test` 를 돌린다.
// 그래서 테스트가 import 하는 모듈은 react 같은 패키지를 끌어오면 안 된다
// (PR #13 이후 freshness.test.mjs → freshness.js → 'react' 로 deploy 가 연속 실패했다).
// 테스트의 상대 import 를 따라가며 node: 내장 모듈 밖의 bare specifier 가 하나라도 나오면 실패시킨다.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TESTS_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = resolve(TESTS_DIR, '..')

// import ... from 'x' / export ... from 'x' / import 'x'
const SPECIFIER = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g

function specifiersOf(file) {
  const src = readFileSync(file, 'utf8')
  const out = []
  for (const m of src.matchAll(SPECIFIER)) out.push(m[1] || m[2])
  return out
}

function resolveRelative(from, spec) {
  const base = resolve(dirname(from), spec)
  for (const candidate of [base, base + '.js', base + '.jsx', base + '.mjs', join(base, 'index.js')]) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {}
  }
  return null
}

// 테스트에서 출발해 상대 import 를 따라가며 bare specifier(=패키지)를 모은다
function bareImportsOf(file, seen = new Set(), chain = [file]) {
  if (seen.has(file)) return []
  seen.add(file)
  const found = []
  for (const spec of specifiersOf(file)) {
    if (spec.startsWith('node:')) continue
    if (!spec.startsWith('.')) {
      found.push({ spec, chain: [...chain, spec] })
      continue
    }
    const target = resolveRelative(file, spec)
    assert.ok(target, `풀리지 않는 import: ${chain.join(' → ')} → ${spec}`)
    found.push(...bareImportsOf(target, seen, [...chain, target]))
  }
  return found
}

test('web 테스트는 react·node_modules 패키지 없이 돌아야 한다', () => {
  const tests = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.mjs'))
  assert.ok(tests.length > 0, '테스트 파일이 없다')
  const offenders = []
  for (const name of tests) {
    for (const { spec, chain } of bareImportsOf(join(TESTS_DIR, name))) {
      offenders.push(`${spec}  ←  ${chain.join(' → ')}`)
    }
  }
  assert.deepEqual(offenders, [], `테스트가 패키지를 끌어온다 (npm ci 전 npm test 가 깨진다):\n${offenders.join('\n')}`)
})
