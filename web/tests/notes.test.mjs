// lib/notes — 개인 메모 저장 규칙(localStorage 'am-notes').
// 저장 모양·정리 규칙·실패 처리(사생활 모드·용량)를 고정한다.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NOTES_KEY, NOTE_MAX_LENGTH, NOTES_MAX_ENTRIES, noteFor, notesBytes, notesCount,
  readNotes, sanitizeNote, writeAllNotes, writeNote,
} from '../src/lib/notes.js'

function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    dump: () => Object.fromEntries(map),
  }
}
const broken = () => ({
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
})

test('sanitizeNote: 줄 끝 공백·과한 빈 줄·앞뒤 공백만 정리하고 개행은 살린다', () => {
  assert.equal(sanitizeNote('  면접 11-24 14:00  \n\n\n\n준비물: 노트북  '), '면접 11-24 14:00\n\n준비물: 노트북')
  assert.equal(sanitizeNote('a\r\nb'), 'a\nb')
  assert.equal(sanitizeNote('   '), '')
  assert.equal(sanitizeNote(null), '')
  assert.equal(sanitizeNote(42), '')
  assert.equal(sanitizeNote('x'.repeat(NOTE_MAX_LENGTH + 50)).length, NOTE_MAX_LENGTH)
})

test('writeNote → readNotes: 저장·읽기·덮어쓰기, updated 는 넘긴 시각', () => {
  const st = fakeStorage()
  const when = new Date('2026-11-17T14:20:00.000Z')
  const res = writeNote('jobkorea:50283588', ' 서류 마감 11-15, 결과 대기 ', st, when)
  assert.equal(res.saved, true)
  assert.equal(res.stored, true)
  const notes = readNotes(st)
  assert.deepEqual(notes['jobkorea:50283588'], { text: '서류 마감 11-15, 결과 대기', updated: '2026-11-17T14:20:00.000Z' })
  assert.equal(noteFor('jobkorea:50283588', st), '서류 마감 11-15, 결과 대기')
  assert.equal(noteFor('없는:id', st), '')

  writeNote('jobkorea:50283588', '다시 씀', st, new Date('2026-11-17T15:00:00.000Z'))
  assert.equal(readNotes(st)['jobkorea:50283588'].text, '다시 씀')
  assert.equal(notesCount(readNotes(st)), 1)
  assert.ok(notesBytes(readNotes(st)) > 0)
})

test('writeNote: 빈 값은 항목을 지운다(키를 남기지 않는다)', () => {
  const st = fakeStorage()
  writeNote('a', '메모', st)
  const res = writeNote('a', '   ', st)
  assert.equal(res.stored, false)
  assert.deepEqual(readNotes(st), {})
  assert.deepEqual(JSON.parse(st.getItem(NOTES_KEY)), {})
})

test('readNotes: 깨진 JSON·배열·문자열 아닌 값은 버리고, 예전 형식(문자열)은 받아 준다', () => {
  assert.deepEqual(readNotes(fakeStorage({ [NOTES_KEY]: '{not json' })), {})
  assert.deepEqual(readNotes(fakeStorage({ [NOTES_KEY]: '[]' })), {})
  const legacy = fakeStorage({ [NOTES_KEY]: JSON.stringify({ a: '예전 메모', b: { text: '새 형식', updated: '2026-11-01T00:00:00.000Z' }, c: { text: '   ' }, __proto__: 'x' }) })
  const notes = readNotes(legacy)
  assert.equal(notes.a.text, '예전 메모')
  assert.equal(notes.b.updated, '2026-11-01T00:00:00.000Z')
  assert.equal('c' in notes, false, '빈 메모는 읽지 않는다')
})

test('writeNote: 저장이 막히면(사생활 모드) saved=false 를 돌려주고 조용히 넘어간다', () => {
  const res = writeNote('a', '메모', broken())
  assert.equal(res.saved, false)
  assert.equal(res.stored, true)
  assert.deepEqual(readNotes(broken()), {})
})

test('개수 상한: 넘치면 가장 오래된 updated 부터 버린다', () => {
  const st = fakeStorage()
  const base = Date.parse('2026-11-01T00:00:00.000Z')
  for (let i = 0; i < NOTES_MAX_ENTRIES + 3; i++) {
    writeNote('id-' + i, '메모 ' + i, st, new Date(base + i * 60000))
  }
  const notes = readNotes(st)
  assert.equal(Object.keys(notes).length, NOTES_MAX_ENTRIES)
  assert.equal('id-0' in notes, false, '가장 오래된 메모가 먼저 사라진다')
  assert.equal('id-' + (NOTES_MAX_ENTRIES + 2) in notes, true)
})

test('writeAllNotes(백업 복원 경로): 정규화해서 통째로 저장한다', () => {
  const st = fakeStorage()
  writeAllNotes({ a: { text: ' 가 ', updated: '2026-11-02T00:00:00.000Z' }, b: '  ' }, st)
  assert.deepEqual(readNotes(st), { a: { text: '가', updated: '2026-11-02T00:00:00.000Z' } })
})
