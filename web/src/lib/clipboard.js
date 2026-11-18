// 클립보드 복사 — 한 곳에서만 다룬다 (공략 프롬프트·지원 전략 프롬프트가 같은 길을 쓴다).
//
// navigator.clipboard 는 보안 컨텍스트(https 또는 localhost)에서만 있고, 권한·포커스에 따라
// 거부될 수 있다. 그때는 textarea + execCommand('copy') 로 내려간다 — 구형 웹뷰·비보안
// 컨텍스트에서도 같은 버튼이 먹히게 하려는 것이다. 둘 다 막히면 false 를 돌려주고,
// 부른 쪽이 직접 고를 수 있는 화면(StrategyCopy 의 폴백 시트)을 연다.

export function copyText(text) {
  const t = String(text == null ? '' : text)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(() => true, () => fallbackCopy(t))
    }
  } catch { /* 권한 예외 — 폴백으로 내려간다 */ }
  return Promise.resolve(fallbackCopy(t))
}

// 화면 밖 textarea 를 만들어 선택하고 복사한다. 성공 여부만 돌려준다.
export function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.setAttribute('aria-hidden', 'true')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.left = '-1000px'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return !!ok
  } catch { return false }
}
