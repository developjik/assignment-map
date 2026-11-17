// 개인 메모 — 공고/이벤트 하나에 붙는 내 메모를 localStorage 'am-notes' 에 둔다 (서버 없음).
//
//   { "<id>": { "text": "면접 11-24 14:00 …", "updated": "2026-11-17T23:12:04.120Z" } }
//
// 설계 원칙
// - 수집 데이터(data/*.json)와 섞지 않는다: 메모는 기기 안에만 있고, 옮길 때는 lib/backup 의 JSON 백업을 쓴다.
// - 조용히 실패한다: 사생활 모드·용량 초과로 저장이 막히면 저장된 것처럼 보이지 않게 saved=false 를 돌려준다.
// - 길이·개수를 스스로 제한한다: 남의 원문을 붙여 넣어도 localStorage(5MB)를 통째로 먹지 않게 한다.
// - 순수 함수만 둔다(react 없음) — web/tests 가 node_modules 없이 돌아야 한다. 저장소는 인자로 받는다.
export const NOTES_KEY = 'am-notes'
export const NOTES_EVENT = 'am-notes-changed'
export const NOTE_MAX_LENGTH = 2000
export const NOTES_MAX_ENTRIES = 500
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

// 저장할 수 있는 문자열인가 — 개행은 살리고, 줄 끝 공백과 과도한 빈 줄만 정리한다
export function sanitizeNote(text) {
  if (typeof text !== 'string') return ''
  const out = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out.slice(0, NOTE_MAX_LENGTH)
}

const storageOf = (storage) => {
  if (storage && typeof storage.getItem === 'function') return storage
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage && typeof globalThis.localStorage.getItem === 'function') return globalThis.localStorage
  } catch { /* 사생활 모드 */ }
  return null
}

const announce = () => {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(NOTES_EVENT))
  } catch { /* 무시 */ }
}

/**
 * 저장된 메모 전체를 읽는다. 형식이 깨진 항목·빈 메모·과한 개수는 걸러 낸다(멱등 읽기).
 * @param {Storage|null} [storage]
 * @returns {Record<string,{text:string,updated:string}>}
 */
export function readNotes(storage) {
  const st = storageOf(storage)
  if (!st) return {}
  let raw
  try { raw = JSON.parse(st.getItem(NOTES_KEY) || '{}') } catch { return {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || !k || BAD_KEYS.has(k)) continue
    // 예전/수동 형식(문자열만)도 받아 준다
    const text = sanitizeNote(typeof v === 'string' ? v : v && typeof v === 'object' ? v.text : '')
    if (!text) continue
    const updated = typeof v === 'object' && v && typeof v.updated === 'string' && v.updated ? v.updated : ''
    out[k] = { text, updated }
    if (Object.keys(out).length >= NOTES_MAX_ENTRIES) break
  }
  return out
}

const persist = (notes, st) => {
  if (!st) return false
  try { st.setItem(NOTES_KEY, JSON.stringify(notes)); return true } catch { return false }
}

/**
 * 메모 한 건을 저장한다. 빈 문자열이면 그 항목을 지운다.
 * @returns {{notes: Record<string,{text:string,updated:string}>, saved: boolean, stored: boolean}}
 *   stored = 내용이 실제로 남아 있는가(빈 메모를 지운 경우 false)
 */
export function writeNote(id, text, storage, now) {
  const st = storageOf(storage)
  // id 는 호출하는 쪽이 이미 대표 id 로 넘긴다(병합된 id → 대표 id 해석은 lib/alias 몫)
  const key = typeof id === 'string' ? id : ''
  if (!key) return { notes: readNotes(st), saved: false, stored: false }
  const notes = readNotes(st)
  const clean = sanitizeNote(text)
  const stamp = (now instanceof Date ? now : new Date()).toISOString()
  if (!clean) {
    if (!(key in notes)) return { notes, saved: true, stored: false }
    delete notes[key]
    const saved = persist(notes, st)
    if (saved) announce()
    return { notes, saved, stored: false }
  }
  notes[key] = { text: clean, updated: stamp }
  // 개수 상한을 넘으면 가장 오래 손대지 않은 메모부터 버린다(가장 최근 것부터 남긴다)
  const keys = Object.keys(notes)
  if (keys.length > NOTES_MAX_ENTRIES) {
    keys
      .sort((a, b) => String(notes[a].updated).localeCompare(String(notes[b].updated)))
      .slice(0, keys.length - NOTES_MAX_ENTRIES)
      .forEach((k) => { delete notes[k] })
  }
  const saved = persist(notes, st)
  if (saved) announce()
  return { notes, saved, stored: true }
}

/** 메모 한 건 읽기 (없으면 ''). */
export function noteFor(id, storage) {
  const notes = readNotes(storage)
  return notes[typeof id === 'string' ? id : '']?.text || ''
}

/** 메모가 있는 항목 수. */
export function notesCount(notes) {
  return Object.keys(notes || {}).filter((k) => !!notes[k]?.text).length
}

/** 백업 크기 감각용 — 저장되는 문자열의 바이트 수(대략). */
export function notesBytes(notes) {
  try { return JSON.stringify(notes || {}).length } catch { return 0 }
}

/** 저장소 키를 직접 다루는 도구(백업 복원)용 — 정규화된 메모 지도를 저장한다. */
export function writeAllNotes(notes, storage) {
  const st = storageOf(storage)
  const clean = {}
  for (const [k, v] of Object.entries(notes || {})) {
    if (typeof k !== 'string' || !k || BAD_KEYS.has(k)) continue
    const text = sanitizeNote(typeof v === 'string' ? v : v?.text)
    if (!text) continue
    clean[k] = { text, updated: typeof v === 'object' && v?.updated ? v.updated : '' }
    if (Object.keys(clean).length >= NOTES_MAX_ENTRIES) break
  }
  const saved = persist(clean, st)
  if (saved) announce()
  return { notes: clean, saved }
}
