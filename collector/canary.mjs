#!/usr/bin/env node
// canary.mjs — 수집 지표 밴드 검증(조용한 파서 실패를 시끄러운 경보로)
//
// 규칙: 파서가 조용히 빈 결과를 내는 사고(11-05 `<li>` 리터럴, 11-15 잡코리아 속성 순서)를
// 막는 장치. 루틴은 수집 후 지표 개수를 모아 이 스크립트에 넘기고, VIOLATION이 있으면
// run notes에 CANARY 줄을 남기고 해당 소스를 sources.json watch 강등 후보로 기록한다.
//
// 사용:
//   node collector/canary.mjs '{"wevity-list-per-page":15,"devpost-open-total":59}'
//   node collector/canary.mjs counts.json
//   cat counts.json | node collector/canary.mjs
// exit 0 = 밴드 내, exit 1 = VIOLATION 있음
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(import.meta.dirname, '..')

/** @returns {{lines:string[], violations:string[]}} */
export function checkCanaries(counts, bands) {
  const lines = []
  const violations = []
  const names = Object.keys(counts)
  if (names.length === 0) {
    const line = 'CANARY VIOLATION  (입력 지표 0건) — 수집이 전부 실패했거나 counts를 못 모았다. 조용한 OK로 넘기지 않는다'
    return { lines: [line], violations: [line] }
  }
  for (const name of names) {
    const band = bands[name]
    if (!band) {
      lines.push(`CANARY NO-BAND  ${name} = ${value} — canaries.json에 밴드 정의 추가 고려`)
      continue
    }
    const inBand = Number(value) >= band.min && Number(value) <= band.max
    const tag = inBand ? 'OK         ' : 'VIOLATION  '
    const line = `CANARY ${tag}${name} = ${value} (${band.min}~${band.max})${inBand ? '' : ' — ' + (band.note || '')}`
    lines.push(line)
    if (!inBand) violations.push(line)
  }
  return { lines, violations }
}

function readCounts(arg) {
  if (arg && !arg.startsWith('{')) return JSON.parse(fs.readFileSync(arg, 'utf8'))
  if (arg) return JSON.parse(arg)
  return JSON.parse(fs.readFileSync(0, 'utf8'))
}

// CLI (모듈로 import 되었을 때는 실행하지 않는다)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bands = JSON.parse(fs.readFileSync(path.join(repo, 'collector', 'canaries.json'), 'utf8')).bands
  const { lines, violations } = checkCanaries(readCounts(process.argv[2]), bands)
  for (const l of lines) console.log(l)
  if (violations.length) {
    console.error(`CANARY FAIL — ${violations.length}개 지표가 밴드 밖. run notes에 기록하고 소스 watch 강등을 검토한다.`)
    process.exit(1)
  }
  console.log('CANARY OK — 전 지표 밴드 내')
}
