// lib/backup — 관심·지원 상태·가이드 체크·개인 메모의 JSON 내보내기/불러오기.
// 파일 모양·검증(남의 파일 거부)·두 복원 모드(합치기/덮어쓰기)·저장 키 일치를 고정한다.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BACKUP_VERSION, KEYS, MODES, backupFileName, buildBackup, exportBackup, parseBackup,
  planRestore, readState, restoreBackup, serializeBackup, summarize, totalCount, writeState,
} from '../src/lib/backup.js'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib')

function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    dump: () => Object.fromEntries(map),
  }
}
const WHEN = new Date('2026-11-17T14:20:00.000Z')

const CURRENT = {
  starred: ['wanted:wd391332', 'ko-0005'],
  statuses: { 'jobkorea:50283588': 'submitted' },
  checks: { 'frontend-spa:0': true, 'frontend-spa:1': true },
  notes: { 'wanted:wd391332': { text: '포트폴리오 링크 정리', updated: '2026-11-17T10:00:00.000Z' } },
}
const INCOMING = {
  starred: ['ko-0005', 'wevity:112299'],
  statuses: { 'jobkorea:50283588': 'in_progress', 'jumpit:55361658': 'in_progress' },
  checks: { 'frontend-spa:1': true, 'ai-agent:2': true },
  notes: {
    'wanted:wd391332': { text: '내 메모가 더 최신', updated: '2026-11-18T00:00:00.000Z' },
    'ko-0005': { text: '백업에만 있던 메모', updated: '2026-11-10T00:00:00.000Z' },
  },
}

test('저장 키가 각 모듈의 키와 같다 (백업이 엉뚱한 키를 쓰지 않게 소스에서 확인)', () => {
  const pairs = [
    ['starred.js', 'STARRED_KEY', KEYS.starred],
    ['statuses.js', 'STATUS_KEY', KEYS.statuses],
    ['guideProgress.js', 'CHECKS_KEY', KEYS.checks],
    ['notes.js', 'NOTES_KEY', KEYS.notes],
  ]
  for (const [file, name, key] of pairs) {
    const src = readFileSync(join(SRC, file), 'utf8')
    assert.match(src, new RegExp(`${name}\\s*=\\s*['"]${key}['"]`), `${file} 의 ${name} 가 ${key} 와 다르다`)
  }
})

test('buildBackup·serializeBackup: 파일 모양(app·version·exported_at·counts·data)', () => {
  const payload = buildBackup(CURRENT, WHEN)
  assert.equal(payload.app, 'assignment-map')
  assert.equal(payload.version, BACKUP_VERSION)
  assert.equal(payload.exported_at, WHEN.toISOString())
  assert.deepEqual(payload.counts, { starred: 2, statuses: 1, checks: 2, notes: 1 })
  assert.equal(totalCount(payload.counts), 6)
  assert.deepEqual(payload.data.starred, CURRENT.starred)
  const text = serializeBackup(payload)
  assert.ok(text.endsWith('\n'))
  assert.deepEqual(parseBackup(text).data, payload.data, '내보낸 것을 그대로 다시 읽는다')
  assert.equal(backupFileName(WHEN), 'assignment-map-backup-2026-11-17.json')
})

test('parseBackup: 남의 파일·깨진 파일·새 버전은 이유를 담아 거부한다', () => {
  assert.throws(() => parseBackup(''), /빈 파일/)
  assert.throws(() => parseBackup('{'), /JSON/)
  assert.throws(() => parseBackup('[]'), /형식이 아닙니다/)
  assert.throws(() => parseBackup(JSON.stringify({ app: 'other-app', data: { starred: [] } })), /다른 앱의 백업/)
  assert.throws(() => parseBackup(JSON.stringify({ app: 'assignment-map', version: 99, data: { starred: ['a'] } })), /더 새로운 버전/)
  assert.throws(() => parseBackup(JSON.stringify({ app: 'assignment-map', version: 1 })), /data 가 없습니다/)
  assert.throws(() => parseBackup(JSON.stringify({ app: 'assignment-map', version: 1, data: { unknown: 1 } })), /옮길 기록/)
})

test('parseBackup: 손으로 고친 값은 좁힌다(타입·길이·상태값·프로토타입 키)', () => {
  const payload = parseBackup(JSON.stringify({
    app: 'assignment-map', version: 1, exported_at: 12,
    data: {
      starred: ['ok', 'ok', '', 7, 'x'.repeat(200), '__proto__'],
      statuses: { a: 'submitted', b: 'interested', c: 123, __proto__: 'submitted' },
      checks: { 'g:0': true, 'g:1': false, 'g:2': 'yes' },
      notes: { a: { text: '  메모  ' }, b: '옛 형식', c: { text: '' } },
    },
  }))
  assert.deepEqual(payload.data.starred, ['ok'])
  assert.deepEqual(payload.data.statuses, { a: 'submitted' })
  assert.deepEqual(payload.data.checks, { 'g:0': true })
  assert.equal(payload.data.notes.a.text, '메모')
  assert.equal(payload.data.notes.b.text, '옛 형식')
  assert.equal('c' in payload.data.notes, false)
  assert.equal(payload.exported_at, '', '잘못된 exported_at 은 빈 값')
})

test('planRestore(merge): 내 기록을 지우지 않고, 백업에만 있는 항목을 더한다', () => {
  const { next, stats } = planRestore(CURRENT, INCOMING, 'merge')
  assert.deepEqual(next.starred, ['wanted:wd391332', 'ko-0005', 'wevity:112299'])
  assert.deepEqual(next.statuses, { 'jobkorea:50283588': 'submitted', 'jumpit:55361658': 'in_progress' }, '충돌은 내 쪽 유지')
  assert.deepEqual(Object.keys(next.checks).sort(), ['ai-agent:2', 'frontend-spa:0', 'frontend-spa:1'])
  assert.equal(next.notes['wanted:wd391332'].text, '내 메모가 더 최신')
  assert.equal(next.notes['ko-0005'].text, '백업에만 있던 메모')
  assert.deepEqual(stats.added, { starred: 1, statuses: 1, checks: 1, notes: 1 })
  assert.deepEqual(stats.updated, { starred: 0, statuses: 0, checks: 0, notes: 1 }, '백업 메모가 더 최신이라 갱신')
  assert.deepEqual(stats.kept, { starred: 1, statuses: 1, checks: 1, notes: 0 })
  assert.equal(stats.mode, 'merge')
})

test('planRestore(merge): 백업 메모가 더 최신이면 갱신하고 그 수를 센다', () => {
  const { next, stats } = planRestore(
    { notes: { a: { text: '옛것', updated: '2026-11-01T00:00:00.000Z' } } },
    { notes: { a: { text: '새것', updated: '2026-11-20T00:00:00.000Z' } } },
    'merge',
  )
  assert.equal(next.notes.a.text, '새것')
  assert.equal(stats.updated.notes, 1)
})

test('planRestore(replace): 지금 기록을 백업 내용으로 바꾼다', () => {
  const { next, stats } = planRestore(CURRENT, INCOMING, 'replace')
  assert.deepEqual(next.starred, INCOMING.starred)
  assert.deepEqual(next.statuses, INCOMING.statuses, '충돌도 백업 쪽으로')
  assert.deepEqual(next.notes, INCOMING.notes)
  assert.equal(stats.mode, 'replace')
  assert.deepEqual(stats.kept, { starred: 0, statuses: 0, checks: 0, notes: 0 })
})

test('readState·writeState·restoreBackup: 저장소 왕복이 실제로 남는다', () => {
  const st = fakeStorage()
  writeState(CURRENT, st)
  assert.deepEqual(readState(st), CURRENT)

  const text = serializeBackup(buildBackup(INCOMING, WHEN))
  const res = restoreBackup(text, { mode: 'merge', storage: st })
  assert.equal(res.saved, true)
  assert.equal(res.counts.starred, 3)
  const after = readState(st)
  assert.ok(after.starred.includes('wevity:112299'))
  assert.equal(after.statuses['jobkorea:50283588'], 'submitted')
  assert.equal(after.notes['wanted:wd391332'].text, '내 메모가 더 최신')

  const rep = restoreBackup(text, { mode: 'replace', storage: st })
  assert.equal(rep.counts.starred, 2)
  assert.deepEqual(readState(st).starred, INCOMING.starred)
})

test('exportBackup: 지금 저장소에서 바로 파일 텍스트와 이름을 만든다', () => {
  const st = fakeStorage()
  writeState(CURRENT, st)
  const { text, counts, fileName } = exportBackup(st, WHEN)
  assert.deepEqual(counts, summarize(CURRENT))
  assert.equal(fileName, 'assignment-map-backup-2026-11-17.json')
  assert.deepEqual(parseBackup(text).data, CURRENT)
})

test('MODES: 복원 방식 두 가지가 화면과 같은 id·설명을 쓴다', () => {
  assert.deepEqual(MODES.map((m) => m.id), ['merge', 'replace'])
  for (const m of MODES) assert.ok(m.hint.length > 8)
})
