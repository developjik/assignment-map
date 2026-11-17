// 필터 프리셋 — 이름 붙은 조건 조합 3종.
//
// 저장소를 따로 만들지 않는다: 적용은 언제나 지금의 필터 상태(=URL 해시)로 흘러가므로
// 프리셋을 눌러도 location.hash 만 바뀌고, 그 링크를 열면 같은 화면이 그대로 재현된다.
// localStorage 에는 "정의"만 둔다 (기본 3종을 처음 한 번 써 두고, 이후에는 저장된 정의를 읽는다).
const KEY = 'am-filter-presets'

export const DEFAULT_PRESETS = [
  {
    id: 'd3',
    label: 'D-3 임박',
    hint: '진행중이면서 마감이 3일 이내인 건',
    filters: { policy: 'all', jobfam: 'all', status: 'open', prog: '', dd: '3', hiringOnly: false, changedOnly: false, starredOnly: false },
  },
  {
    id: 'ai-required',
    label: 'AI 필수',
    hint: '과제에 AI 활용을 요구하는 건',
    filters: { policy: 'required', jobfam: 'all', status: 'open', prog: '', dd: '', hiringOnly: false, changedOnly: false, starredOnly: false },
  },
  {
    id: 'starred',
    label: '관심',
    hint: '별표해 둔 건',
    filters: { policy: 'all', jobfam: 'all', status: 'open', prog: '', dd: '', hiringOnly: false, changedOnly: false, starredOnly: true },
  },
]

const FILTER_KEYS = ['policy', 'jobfam', 'status', 'prog', 'dd', 'hiringOnly', 'changedOnly', 'starredOnly']

// 저장된 정의를 기본값 위에 덮는다. 깨진 값은 버리고 기본값을 쓴다.
export function loadPresets() {
  let stored = null
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { stored = null }
  if (!Array.isArray(stored)) {
    savePresets(DEFAULT_PRESETS)
    return DEFAULT_PRESETS
  }
  const byId = new Map()
  for (const p of stored) {
    if (!p || typeof p.id !== 'string' || typeof p.label !== 'string' || !p.filters) continue
    const filters = {}
    for (const k of FILTER_KEYS) if (k in p.filters) filters[k] = p.filters[k]
    byId.set(p.id, { id: p.id, label: p.label, hint: typeof p.hint === 'string' ? p.hint : '', filters })
  }
  // 기본 3종은 항상 남는다 — 저장소가 비었거나 일부만 남아도 프리셋 줄이 비지 않는다
  return DEFAULT_PRESETS.map((d) => {
    const s = byId.get(d.id)
    return { ...d, ...(s || {}), filters: { ...d.filters, ...((s && s.filters) || {}) } }
  })
}

export function savePresets(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* 사생활 모드 */ }
}

// 지금 필터 상태가 어느 프리셋과 같은지 (없으면 빈 문자열)
export function matchPreset(presets, state) {
  const key = (f) => FILTER_KEYS.map((k) => JSON.stringify(f[k] ?? DEFAULT_PRESETS[0].filters[k])).join('|')
  const now = key(state)
  const hit = presets.find((p) => key(p.filters) === now)
  return hit ? hit.id : ''
}
