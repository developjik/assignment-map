// URL 해시 상태 — 탭/검색어/필터를 한 곳에서 읽고 쓴다.
// 쓰기는 항상 "지금 해시에 병합"이라 여러 뷰가 각자 자기 키만 갱신해도 서로를 지우지 않는다.
// history.replaceState만 쓰므로 뒤로가기 기록을 더럽히지 않고 hashchange도 스스로 발생시키지 않는다.

export function readHash() {
  const out = {}
  const raw = (typeof location === 'undefined' ? '' : location.hash).replace(/^#/, '')
  if (!raw) return out
  for (const part of raw.split('&')) {
    if (!part) continue
    const i = part.indexOf('=')
    const k = i < 0 ? part : part.slice(0, i)
    const v = i < 0 ? '' : part.slice(i + 1)
    if (!k) continue
    try { out[k] = decodeURIComponent(v) } catch { out[k] = v }
  }
  return out
}

// patch: { key: value } — null/undefined/'' 이면 키를 지운다.
export function writeHash(patch) {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  const cur = readHash()
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') delete cur[k]
    else cur[k] = String(v)
  }
  const parts = Object.entries(cur).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  const h = parts.length ? '#' + parts.join('&') : ''
  const url = location.pathname + location.search + h
  if (location.pathname + location.search + location.hash !== url) history.replaceState(null, '', url)
}

// 필터 → 해시 파라미터 (기본값은 지운다). 딥링크로 공유할 수 있는 최소 집합.
const PROG_IDS = ['interested', 'in_progress', 'submitted']

export function filterPatch(s) {
  return {
    policy: s.policy === 'all' ? null : s.policy,
    jobfam: s.jobfam === 'fe' ? 'fe' : null,
    status: s.status === 'open' ? null : s.status,
    prog: PROG_IDS.includes(s.prog) ? s.prog : null,
    hiring: s.hiringOnly ? '1' : null,
    changed: s.changedOnly ? '1' : null,
    starred: s.starredOnly ? '1' : null,
  }
}

// 해시 → 필터 상태 (없거나 이상한 값이면 기본값)
export function filtersFromHash(h) {
  const policySet = ['required', 'allowed_graded', 'allowed', 'unspecified']
  return {
    policy: policySet.includes(h.policy) ? h.policy : 'all',
    jobfam: h.jobfam === 'fe' ? 'fe' : 'all',
    status: h.status === 'all' ? 'all' : 'open',
    prog: PROG_IDS.includes(h.prog) ? h.prog : '',
    hiringOnly: h.hiring === '1',
    changedOnly: h.changed === '1',
    starredOnly: h.starred === '1',
  }
}
