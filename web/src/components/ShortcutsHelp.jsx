import { useEffect, useRef } from 'react'

// 키보드 단축키 도움말 — `?` 로 열고 Esc 로 닫는다. 다크 터미널 톤 유지.
const KEYS = [
  { keys: ['j', 'k'], desc: '다음 행 / 이전 행' },
  { keys: ['↓', '↑'], desc: '다음 행 / 이전 행 (j k 와 같다)' },
  { keys: ['Enter'], desc: '선택한 행 상세 펼치기 / 접기' },
  { keys: ['o'], desc: '선택한 행의 원문 공고를 새 탭으로 열기' },
  { keys: ['s'], desc: '선택한 행 관심(별표) 토글' },
  { keys: ['/'], desc: '검색창으로 이동' },
  { keys: ['Esc'], desc: '검색창 포커스 해제 / 상세 닫기' },
  { keys: ['?'], desc: '이 도움말 열기 / 닫기' },
]

export default function ShortcutsHelp({ onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="kh-back" onClick={onClose} role="presentation">
      <div
        className="kh"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kh-title"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kh-hd">
          <span className="kh-title" id="kh-title">키보드 단축키</span>
          <button type="button" className="kh-x" onClick={onClose} aria-label="도움말 닫기">Esc</button>
        </div>
        <table className="kh-tb">
          <tbody>
            {KEYS.map((k) => (
              <tr key={k.desc}>
                <td className="kh-k">
                  {k.keys.map((key, i) => (
                    <span key={key}>
                      {i > 0 && <span className="kh-alt">또는</span>}
                      <span className="kbd">{key}</span>
                    </span>
                  ))}
                </td>
                <td className="kh-d">{k.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="kh-ft">표에 포커스를 두지 않아도 된다 | 입력 중에는 단축키가 걸리지 않는다</div>
      </div>
    </div>
  )
}
