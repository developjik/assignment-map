import { useEffect, useMemo, useRef, useState } from 'react'
import { guideById, guides, matchGuide } from '../lib/guides'
import { readChecks, writeChecks } from '../lib/guideProgress'

// AI 실전 과제 공략 — 우측 2-Pane 패널과 모바일 아코디언이 같은 컴포넌트를 쓴다.
// 데이터는 빌드 타임에 data/guides/*.md 에서 컴파일된 JSON 이고, 여기서는 고른 행에
// 어떤 아키타입을 붙일지(lib/guides.js)와 체크 상태/복사 피드백만 다룬다.
// 체크는 lib/guideProgress 를 거쳐 저장한다 — 행 배지가 같은 변경 신호를 받는다.

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text))
  }
  return Promise.resolve(fallbackCopy(text))
}

// 클립보드 API 가 막힌 환경(비보안 컨텍스트, 구형 웹뷰)에서도 복사가 되게 한다
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

export default function GuidePane({ r, inline = false }) {
  const auto = useMemo(() => matchGuide(r), [r.id])
  const [pickedId, setPickedId] = useState(null)
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(-1)
  const [checks, setChecks] = useState(readChecks)
  const timer = useRef(null)

  // 행을 옮기면 직접 고른 아키타입은 풀고 그 행의 매핑으로 돌아간다
  useEffect(() => { setPickedId(null) }, [r.id])
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => { writeChecks(checks) }, [checks])

  const picked = pickedId ? guideById(pickedId) : null
  const g = picked || auto.guide
  const reason = picked ? '직접 선택' : auto.reason

  const done = g.checklist.filter((_, i) => checks[g.id + ':' + i]).length
  const total = g.checklist.length

  const toggle = (key) => setChecks((c) => ({ ...c, [key]: !c[key] }))
  const resetChecks = () => setChecks((c) => {
    const next = { ...c }
    for (let i = 0; i < total; i += 1) delete next[g.id + ':' + i]
    return next
  })

  const copy = (text, i) => {
    copyText(text).then((ok) => {
      if (!ok) return
      setCopied(i)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(-1), 1500)
    })
  }

  const Wrap = inline ? 'div' : 'section'
  const wrapCls = inline ? 'gp gp-in' : 'dp-sec gp'
  const Head = inline ? 'div' : 'h3'

  return (
    <Wrap className={wrapCls} aria-label="AI 실전 과제 공략">
      <div className="gp-head">
        <Head className={inline ? 'gp-h' : undefined}>AI 실전 과제 공략</Head>
        <button type="button" className="gp-fold" aria-expanded={open}
          onClick={() => setOpen((v) => !v)} title={open ? '공략 접기' : '공략 펼치기'}>
          {open ? '접기' : '펼치기'}
        </button>
      </div>

      {open && (
        <>
          <div className="gp-id">
            <span className="gp-badge">{g.badge}</span>
            <span className="gp-why">매핑: {reason}</span>
          </div>
          <p className="gp-sum">{g.summary}</p>

          <div className="gp-tabs" role="group" aria-label="공략 아키타입 선택">
            {guides.map((it) => (
              <button key={it.id} type="button"
                className={'gp-tab' + (it.id === g.id ? ' on' : '')}
                aria-pressed={it.id === g.id}
                title={it.label}
                onClick={() => setPickedId(it.id === auto.guide.id ? null : it.id)}>{it.badge}</button>
            ))}
          </div>

          <div className="gp-block">
            <span className="gp-k">과제 본질</span>
            {g.essence.map((p, i) => <p className="gp-ess" key={i}>{p}</p>)}
          </div>

          <div className="gp-block">
            <span className="gp-k">AI 워크플로 <span className="gp-n">{g.steps.length}단계</span></span>
            <ol className="gp-steps">
              {g.steps.map((s) => (
                <li key={s.n}>
                  <span className="gp-sn" aria-hidden="true">{String(s.n).padStart(2, '0')}</span>
                  <div className="gp-sb">
                    <span className="gp-st">{s.title}</span>
                    {s.body.map((b, i) => <p key={i}>{b}</p>)}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="gp-block">
            <span className="gp-k">실전 프롬프트 <span className="gp-n">{g.prompts.length}개</span></span>
            {g.prompts.map((p, i) => (
              <div className="gp-pr" key={p.title}>
                <div className="gp-prh">
                  <span className="gp-prt">{p.title}</span>
                  <button type="button" className={'gp-cp' + (copied === i ? ' on' : '')}
                    onClick={() => copy(p.text, i)}
                    aria-label={`${p.title} 프롬프트 복사`}>{copied === i ? '복사됨' : '복사'}</button>
                </div>
                <pre className="gp-code"><code>{p.text}</code></pre>
              </div>
            ))}
          </div>

          <div className="gp-block">
            <span className="gp-k">탈락 방지 체크 <span className="gp-n">{done}/{total}</span></span>
            <ul className="gp-ck">
              {g.checklist.map((c, i) => {
                const key = g.id + ':' + i
                const on = !!checks[key]
                return (
                  <li key={key}>
                    <button type="button" className={'gp-cki' + (on ? ' on' : '')}
                      aria-pressed={on} onClick={() => toggle(key)}>
                      <span className="bx" aria-hidden="true">{on ? '[x]' : '[ ]'}</span>
                      <span className="tx">{c}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="gp-ckf">
              <span>체크는 이 브라우저에만 저장된다</span>
              <button type="button" className="gp-reset" onClick={resetChecks} disabled={!done}>초기화</button>
            </div>
          </div>
        </>
      )}
    </Wrap>
  )
}
