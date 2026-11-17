import { useEffect, useRef, useState } from 'react'

// 필터 팝오버 — 상시 노출을 5묶음으로 줄이고 나머지 조건을 여기로 모은다.
// 값 한 줄이 곧 토글 한 줄이다(체크박스 없음). 값마다 지금 조건에서 남는 건수를 붙여
// "0건이 되는 길"을 누르기 전에 보여준다. 폭 320px, 그림자 없음, radius 0.
export default function FilterPopover({ open, onToggle, onClose, groups, presets, activePreset, onApplyPreset, appliedCount, onClear }) {
  const wrapRef = useRef(null)
  // 버튼 오른쪽에 320px이 안 남으면 오른쪽 맞춤 — 1024px 같은 폭에서 패널이 화면 밖으로 나간다
  const [side, setSide] = useState('left')

  const toggle = () => onToggle()

  // 열릴 때 위치를 정한다 — 버튼 오른쪽에 320px이 안 남으면 오른쪽 맞춤
  // (1024px 같은 폭에서 패널이 화면 밖으로 나갔다). 클릭이든 단축키든 같은 자리에서 처리한다.
  useEffect(() => {
    if (!open) return
    const r = wrapRef.current?.getBoundingClientRect()
    setSide(r && window.innerWidth - r.left < 344 ? 'right' : 'left')
  }, [open])

  // 바깥을 누르면 닫는다. Esc 는 목록 단축키가 먼저 받지 않도록 여기서도 잡아 둔다.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  return (
    <div className="fpop-wrap" ref={wrapRef}>
      <button
        type="button"
        className={'fopt fpop-btn' + (open ? ' on' : '') + (appliedCount ? ' has' : '')}
        aria-expanded={open}
        aria-controls="fpop"
        aria-haspopup="dialog"
        title="직군·내 진행·마감 범위·조건 필터 — 값마다 남는 건수를 보여준다"
        onClick={toggle}
      >
        필터
        {appliedCount > 0 && <span className="fpop-n">{appliedCount}</span>}
        <span className="fpop-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className="fpop-back" aria-hidden="true" onClick={onClose}></div>
          <div className={'fpop' + (side === 'right' ? ' right' : '')} id="fpop" role="dialog" aria-label="필터">
            <div className="fp-hd">
              <span className="fp-title">필터</span>
              <button type="button" className="fp-clear" onClick={onClear} disabled={appliedCount === 0}
                title="걸린 조건을 모두 푼다 (검색어·정렬은 그대로)">전체 해제</button>
              <button type="button" className="fp-x" onClick={onClose} aria-label="필터 닫기">닫기</button>
            </div>
            {groups.map((g) => (
              <div className="fp-g" key={g.id}>
                <div className="fp-gh">{g.label}</div>
                {g.rows.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className={'fp-row' + (row.on ? ' on' : '')}
                    aria-pressed={row.on}
                    onClick={row.pick}
                  >
                    <span className="fp-l">{row.label}</span>
                    <span className="fp-n">{row.count}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="fp-g">
              <div className="fp-gh">프리셋</div>
              <div className="fp-presets">
                {presets.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={'fp-preset' + (activePreset === p.id ? ' on' : '')}
                    aria-pressed={activePreset === p.id}
                    title={p.hint}
                    onClick={() => onApplyPreset(p)}
                  >{p.label}</button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
