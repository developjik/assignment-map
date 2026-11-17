// 내 기록 JSON 백업/복원 — 관심·지원 상태·가이드 체크·개인 메모를 한 파일로 내보내고 되돌린다.
//
// 서버가 없으므로 사용자의 기록은 브라우저 localStorage 에만 있다. 브라우저 데이터를 지우거나
// 기기를 바꾸면 그대로 사라지기 때문에, 한 파일로 내보내고 다시 불러오는 길을 둔다.
//
// 파일 모양 (version 1)
// {
//   "app": "assignment-map", "version": 1, "exported_at": "2026-11-17T14:20:00.000Z",
//   "counts": { "starred": 3, "statuses": 2, "checks": 17, "notes": 4 },
//   "data": { "starred": ["wanted:wd391332"], "statuses": {"id":"in_progress"},
//             "checks": {"frontend-spa:0": true}, "notes": {"id": {"text":"…","updated":"…"}} }
// }
//
// 복원 모드
//   merge   내 기록은 그대로 두고 백업에만 있는 항목을 더한다(충돌은 내 쪽 유지 — 지우지 않는 것이 기본)
//   replace 지금 기록을 백업 내용으로 바꾼다(내보낸 시점으로 되돌린다)
//
// 순수 함수만 둔다(react 없음). 저장소는 인자로 받아 테스트에서 가짜 저장소를 쓸 수 있다.
import { NOTES_KEY, NOTE_MAX_LENGTH, NOTES_MAX_ENTRIES, readNotes, sanitizeNote, writeAllNotes } from './notes.js'

export const BACKUP_APP = 'assignment-map'
export const BACKUP_VERSION = 1

// 아래 키는 각 저장 모듈의 키와 같아야 한다(테스트가 소스에서 확인한다).
//   am-starred  lib/starred.js  STARRED_KEY
//   am-status   lib/statuses.js STATUS_KEY
//   am-guide-checks lib/guideProgress.js CHECKS_KEY
//   am-notes    lib/notes.js    NOTES_KEY
export const KEYS = {
  starred: 'am-starred',
  statuses: 'am-status',
  checks: 'am-guide-checks',
  notes: NOTES_KEY,
}
export const MODES = [
  { id: 'merge', label: '합치기', hint: '내 기록은 그대로 두고 백업에만 있는 항목을 더한다' },
  { id: 'replace', label: '덮어쓰기', hint: '지금 기록을 백업 내용으로 바꾼다(내보낸 시점으로 되돌린다)' },
]
const STATUS_VALUES = new Set(['in_progress', 'submitted'])
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const storageOf = (storage) => {
  if (storage && typeof storage.getItem === 'function') return storage
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage && typeof globalThis.localStorage.getItem === 'function') return globalThis.localStorage
  } catch { /* 사생활 모드 */ }
  return null
}
const readJSON = (st, key, fallback) => {
  if (!st) return fallback
  try {
    const v = JSON.parse(st.getItem(key) || 'null')
    return v === null ? fallback : v
  } catch { return fallback }
}
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

// ---- 정규화: 백업 파일은 손으로 고칠 수 있으므로 들어오는 값을 전부 좁힌다 ----
export function sanitizeStarred(list) {
  const out = []
  for (const id of Array.isArray(list) ? list : []) {
    if (typeof id !== 'string') continue
    const v = id.trim()
    if (!v || v.length > 120 || BAD_KEYS.has(v)) continue
    if (!out.includes(v)) out.push(v)
  }
  return out
}

export function sanitizeStatuses(map) {
  const out = {}
  for (const [k, v] of Object.entries(isObj(map) ? map : {})) {
    if (typeof k !== 'string' || !k || k.length > 120 || BAD_KEYS.has(k)) continue
    if (!STATUS_VALUES.has(v)) continue
    out[k] = v
  }
  return out
}

export function sanitizeChecks(map) {
  const out = {}
  for (const [k, v] of Object.entries(isObj(map) ? map : {})) {
    if (typeof k !== 'string' || !k || k.length > 160 || BAD_KEYS.has(k)) continue
    if (v !== true && v !== false) continue
    if (!v) continue // 체크 해제는 저장하지 않는다(키가 곧 체크)
    out[k] = true
  }
  return out
}

export function sanitizeNotes(map) {
  const out = {}
  for (const [k, v] of Object.entries(isObj(map) ? map : {})) {
    if (typeof k !== 'string' || !k || k.length > 120 || BAD_KEYS.has(k)) continue
    const text = sanitizeNote(typeof v === 'string' ? v : v?.text)
    if (!text) continue
    const updated = isObj(v) && typeof v.updated === 'string' ? v.updated : ''
    out[k] = { text: text.slice(0, NOTE_MAX_LENGTH), updated }
    if (Object.keys(out).length >= NOTES_MAX_ENTRIES) break
  }
  return out
}

/** 지금 브라우저 저장소의 내 기록을 읽는다. */
export function readState(storage) {
  const st = storageOf(storage)
  return {
    starred: sanitizeStarred(readJSON(st, KEYS.starred, [])),
    statuses: sanitizeStatuses(readJSON(st, KEYS.statuses, {})),
    checks: sanitizeChecks(readJSON(st, KEYS.checks, {})),
    notes: sanitizeNotes(readNotes(st)),
  }
}

export function summarize(state) {
  const s = state || {}
  return {
    starred: (s.starred || []).length,
    statuses: Object.keys(s.statuses || {}).length,
    checks: Object.keys(s.checks || {}).length,
    notes: Object.keys(s.notes || {}).length,
  }
}

export function totalCount(counts) {
  const c = counts || {}
  return (c.starred || 0) + (c.statuses || 0) + (c.checks || 0) + (c.notes || 0)
}

/** 백업 파일 본문(객체)을 만든다. */
export function buildBackup(state, now = new Date()) {
  const clean = {
    starred: sanitizeStarred(state?.starred),
    statuses: sanitizeStatuses(state?.statuses),
    checks: sanitizeChecks(state?.checks),
    notes: sanitizeNotes(state?.notes),
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: (now instanceof Date ? now : new Date()).toISOString(),
    counts: summarize(clean),
    data: clean,
  }
}

export function serializeBackup(payload) {
  return JSON.stringify(payload, null, 2) + '\n'
}

export function backupFileName(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now)
  const p = (n) => String(n).padStart(2, '0')
  return `assignment-map-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}

/** 내보낼 파일 텍스트를 바로 만든다(저장소 → 직렬화). */
export function exportBackup(storage, now = new Date()) {
  const state = readState(storage)
  return { text: serializeBackup(buildBackup(state, now)), counts: summarize(state), fileName: backupFileName(now) }
}

/**
 * 백업 파일 텍스트를 해석한다. 우리 파일이 아니면 이유를 담아 던진다(화면이 그대로 보여 준다).
 * @returns {{app:string, version:number, exported_at:string, counts:object, data:{starred:string[],statuses:object,checks:object,notes:object}}}
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('빈 파일입니다. 내보낸 JSON 파일을 골라 주세요.')
  let raw
  try { raw = JSON.parse(text) } catch { throw new Error('JSON 으로 읽지 못했습니다. 파일이 잘렸는지 확인해 주세요.') }
  if (!isObj(raw)) throw new Error('백업 파일 형식이 아닙니다. 내보낸 JSON 파일을 골라 주세요.')
  if (raw.app !== undefined && raw.app !== BACKUP_APP) throw new Error(`다른 앱의 백업입니다 (app=${String(raw.app).slice(0, 40)}).`)
  if (raw.version !== undefined && (typeof raw.version !== 'number' || raw.version < 1)) throw new Error('백업 version 값을 읽지 못했습니다.')
  if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) throw new Error(`더 새로운 버전의 백업입니다 (version ${raw.version}). 사이트를 새로 고친 뒤 다시 시도해 주세요.`)
  const data = isObj(raw.data) ? raw.data : null
  if (!data) throw new Error('백업에 data 가 없습니다. 내보낸 JSON 파일을 골라 주세요.')
  const known = ['starred', 'statuses', 'checks', 'notes'].filter((k) => data[k] !== undefined)
  if (!known.length) throw new Error('백업에 옮길 기록(관심·지원 상태·가이드 체크·개인 메모)이 없습니다.')
  const clean = {
    starred: sanitizeStarred(data.starred),
    statuses: sanitizeStatuses(data.statuses),
    checks: sanitizeChecks(data.checks),
    notes: sanitizeNotes(data.notes),
  }
  return {
    app: BACKUP_APP,
    version: typeof raw.version === 'number' ? raw.version : BACKUP_VERSION,
    exported_at: typeof raw.exported_at === 'string' ? raw.exported_at : '',
    counts: summarize(clean),
    data: clean,
  }
}

const newer = (a, b) => String(a || '').localeCompare(String(b || ''))

/**
 * 복원 계획을 세운다(쓰기는 하지 않는다 — 화면이 먼저 무엇이 바뀌는지 보여 줄 수 있게).
 * @returns {{next:object, stats:{added:object, updated:object, kept:object, mode:string}}}
 */
export function planRestore(current, incoming, mode = 'merge') {
  const cur = {
    starred: sanitizeStarred(current?.starred),
    statuses: sanitizeStatuses(current?.statuses),
    checks: sanitizeChecks(current?.checks),
    notes: sanitizeNotes(current?.notes),
  }
  const inc = {
    starred: sanitizeStarred(incoming?.starred),
    statuses: sanitizeStatuses(incoming?.statuses),
    checks: sanitizeChecks(incoming?.checks),
    notes: sanitizeNotes(incoming?.notes),
  }
  if (mode === 'replace') {
    return {
      next: inc,
      stats: { mode, added: summarize(inc), updated: { starred: 0, statuses: 0, checks: 0, notes: 0 }, kept: { starred: 0, statuses: 0, checks: 0, notes: 0 } },
    }
  }
  const added = { starred: 0, statuses: 0, checks: 0, notes: 0 }
  const updated = { starred: 0, statuses: 0, checks: 0, notes: 0 }
  const kept = { starred: 0, statuses: 0, checks: 0, notes: 0 }

  const starred = [...cur.starred]
  for (const id of inc.starred) {
    if (starred.includes(id)) kept.starred++
    else { starred.push(id); added.starred++ }
  }

  const statuses = { ...cur.statuses }
  for (const [id, v] of Object.entries(inc.statuses)) {
    if (!(id in statuses)) { statuses[id] = v; added.statuses++ }
    else if (statuses[id] === v) kept.statuses++
    else kept.statuses++ // 충돌 — 내 쪽 유지(합치기는 지우지 않는다)
  }

  const checks = { ...cur.checks }
  for (const k of Object.keys(inc.checks)) {
    if (checks[k]) kept.checks++
    else { checks[k] = true; added.checks++ }
  }

  const notes = { ...cur.notes }
  for (const [id, n] of Object.entries(inc.notes)) {
    if (!(id in notes)) { notes[id] = n; added.notes++ }
    else if (newer(n.updated, notes[id].updated) > 0) { notes[id] = n; updated.notes++ }
    else kept.notes++ // 내 메모가 더 최신이거나 같은 시각 — 내 것 유지
  }

  return { next: { starred, statuses, checks, notes }, stats: { mode: 'merge', added, updated, kept } }
}

/** 복원 계획을 실제 저장소에 쓴다. */
export function writeState(state, storage) {
  const st = storageOf(storage)
  if (!st) return { saved: false, written: [] }
  const written = []
  const put = (key, value) => {
    try { st.setItem(key, JSON.stringify(value)); written.push(key) } catch { /* 용량 초과·사생활 모드 */ }
  }
  put(KEYS.starred, sanitizeStarred(state?.starred))
  put(KEYS.statuses, sanitizeStatuses(state?.statuses))
  put(KEYS.checks, sanitizeChecks(state?.checks))
  writeAllNotes(sanitizeNotes(state?.notes), st)
  written.push(KEYS.notes)
  return { saved: written.length === 4, written }
}

/**
 * 파일 텍스트 → 저장까지 한 번에. 저장 전 계획이 필요하면 parseBackup + planRestore + writeState 를 쓴다.
 * @returns {{stats:object, counts:object, saved:boolean}}
 */
export function restoreBackup(text, { mode = 'merge', storage, } = {}) {
  const st = storageOf(storage)
  const incoming = parseBackup(text)
  const plan = planRestore(readState(st), incoming.data, mode)
  const { saved } = writeState(plan.next, st)
  return { stats: plan.stats, counts: summarize(plan.next), saved }
}
