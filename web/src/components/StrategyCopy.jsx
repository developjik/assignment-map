import { useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/clipboard'
import { buildStrategyPrompt, strategyButtonLabel } from '../lib/strategy'

// AI 제출 전략 프롬프트 복사 — 상세 패널(.dpane)과 좁은 화면 아코디언(.hx)이 같은 버튼을 쓴다.
//
// 버튼 하나에 세 가지 상태가 있다: 평소 / 복사됨(1.6초) / 복사 실패.
// 실패는 조용히 넘기지 않는다. 클립보드가 막힌 브라우저에서는 프롬프트 전문을 선택해 둔
// 시트를 열어 직접 복사하게 한다 (그 경우에도 사용자는 한 번에 끝낼 수 있어야 한다).

function CheckIcon() {
  return (
    <svg className="sc-ck" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2 6.4l2.7 2.7L10 3.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  )
}

function PromptSheet({ text, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const ta = ref.current
    if (ta) { ta.focus(); ta.select() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sc-back" role="dialog" aria-modal="true" aria-label="AI 전략 프롬프트">
      <div className="sc">
        <div className="sc-hd">
          <span className="sc-title">AI 전략 프롬프트</span>
          <button type="button" className="sc-x" onClick={onClose} aria-label="프롬프트 창 닫기">닫기 Esc</button>
        </div>
        <p className="sc-lede">이 브라우저가 클립보드 복사를 막았다. 아래 글자가 이미 선택되어 있으니 Ctrl+C (맥은 Command+C) 로 복사한다.</p>
        <textarea ref={ref} className="sc-ta" readOnly value={text} spellCheck="false" aria-label="복사할 프롬프트 전문" />
        <div className="sc-ft">
          <button type="button" className="sc-x" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

export default function StrategyCopy({ r, btnClass = 'ics act strat' }) {
  const [copied, setCopied] = useState(false)
  const [failText, setFailText] = useState('')
  const timer = useRef(null)

  // 다른 행으로 옮기면 피드백은 그 행의 것이 아니다 — 되돌린다
  useEffect(() => { setCopied(false) }, [r.id])
  useEffect(() => () => clearTimeout(timer.current), [])

  const run = () => {
    const text = buildStrategyPrompt(r)
    if (!text) return
    copyText(text).then((ok) => {
      if (!ok) { setFailText(text); return }
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <>
      <button type="button" className={btnClass + (copied ? ' on' : '')} onClick={run}
        aria-label={copied ? `${r.name} AI 전략 프롬프트 복사됨` : `${r.name} AI 전략 프롬프트 복사`}
        title="이 공고의 회사·포지션·마감·AI 정책·전형·원문 근거와 내 포지셔닝을 담은 프롬프트를 복사한다 | 과제 설계·어필 포인트·제출 체크리스트를 요청하는 글">
        {copied ? <><CheckIcon />복사됨</> : strategyButtonLabel}
      </button>
      {failText && <PromptSheet text={failText} onClose={() => setFailText('')} />}
    </>
  )
}
