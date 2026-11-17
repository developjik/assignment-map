// 병합된 id 해석 — collector/dedupe.mjs 가 남기는 `merged_into`(중복 행 → 대표행)를 따라간다.
//
// 왜 필요한가: 병합은 행을 지우지 않고 `merged_into` 로 표시한 뒤 화면·피드에서만 감춘다(스펙 1-2).
// 사용자의 관심(am-starred)·지원 상태(am-status)는 **id 문자열**로 저장되므로, 사용자가 감춰진
// id 에 별표를 남겨 두었다면 병합 뒤에는 목록에서 그 별표가 사라진다. 저장값을 읽을 때 대표 id 로
// 옮겨 읽으면 사용자가 남긴 기록이 그대로 살아 있다.
//
// 순수 함수만 둔다(react·localStorage 없음) — web/tests 가 node_modules 없이 돌아야 한다.

/**
 * 레코드 배열에서 id → 대표 id 지도를 만든다. 체인(A→B, B→C)은 끝까지 따라가 해소한다.
 * @param {{id?: string, merged_into?: string}[]} records
 * @returns {Map<string, string>} 중복 id → 대표 id (대표행 자신은 넣지 않는다)
 */
export function buildAliasMap(records) {
  const direct = new Map()
  for (const r of records || []) {
    if (!r || typeof r.id !== 'string' || !r.id) continue
    if (typeof r.merged_into === 'string' && r.merged_into && r.merged_into !== r.id) direct.set(r.id, r.merged_into)
  }
  const out = new Map()
  for (const id of direct.keys()) {
    let cur = direct.get(id)
    const seen = new Set([id])
    while (direct.has(cur) && !seen.has(cur)) { seen.add(cur); cur = direct.get(cur) }
    out.set(id, cur)
  }
  return out
}

/** id 하나를 대표 id 로 해석한다. 지도에 없으면 그대로 돌려준다. */
export function canonicalId(id, aliases) {
  if (typeof id !== 'string' || !id) return id
  const hit = aliases && typeof aliases.get === 'function' ? aliases.get(id) : undefined
  return hit || id
}

/** id 배열을 대표 id 로 해석하고 중복을 걷는다(순서는 처음 나온 순서). */
export function canonicalIds(ids, aliases) {
  const out = []
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string' || !id) continue
    const c = canonicalId(id, aliases)
    if (!out.includes(c)) out.push(c)
  }
  return out
}

/** 지도에 넣으면 안 되는 키(프로토타입 오염 경로) */
const BAD_KEY = (k) => k === '__proto__' || k === 'constructor' || k === 'prototype'

/**
 * {id: 값} 지도의 키를 대표 id 로 옮긴다. 같은 대표 id 로 두 값이 모이면
 * 이미 있던 쪽(대표 id 로 저장돼 있던 값)을 남긴다 — 화면에 보이는 쪽이 사용자가 마지막에 본 값이다.
 * @param {Record<string,string>} map
 * @param {Map<string,string>} aliases
 * @param {(v:string)=>number} [rank] 충돌 시 더 나아간 값을 고르는 순위(없으면 기존 값 유지)
 */
export function canonicalMap(map, aliases, rank) {
  const out = {}
  const entries = Object.entries(map || {}).filter(([k]) => typeof k === 'string' && k && !BAD_KEY(k))
  // 대표 id 로 저장된 값을 먼저 넣는다 — 같은 값이 모이면 화면에 보이던 쪽이 남는다
  entries.sort(([a], [b]) => Number(canonicalId(a, aliases) !== a) - Number(canonicalId(b, aliases) !== b))
  for (const [k, v] of entries) {
    const id = canonicalId(k, aliases)
    if (!(id in out)) { out[id] = v; continue }
    if (rank && rank(v) > rank(out[id])) out[id] = v
  }
  return out
}
