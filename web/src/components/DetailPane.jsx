import { useEffect, useState } from 'react'
import { POLICY_LABEL, STATUS_LABEL, disp } from '../lib/labels'
import { downloadIcs } from '../lib/ics'
import { policyChangeByID } from '../lib/data'
import { reportIssueUrl } from '../lib/report'
import { deadlineTone, relativeText } from '../lib/deadline'
import GuidePane from './GuidePane'
import GuideProgressBadge from './GuideProgressBadge'
import RelatedList from './RelatedList'
import StatusPicker from './StatusPicker'

// 데스크톱 우측 고정 상세 패널 (k9s describe / Linear 우측 패널).
// 행을 고르면 표를 밀어내지 않고 이 패널이 붙는다. j/k 로 행을 옮기면 내용이 따라온다.
//
// PR B — 행과 역할을 가른다: 행은 식별·비교(제목·주최·정책·근거 1줄·D-day),
// 패널은 검증·행동(근거 인용 전문 → 전형/자격 → 공략 → 수집/추적).
const REL_DAYS = (dateStr) => {
  if (!dateStr) return ''
  const d = Math.round((Date.now() - new Date(dateStr + 'T03:00:00+09:00').getTime()) / 864e5)
  if (d <= 0) return '오늘'
  if (d === 1) return '어제'
  return d + '일 전'
}

const HIST_LABEL = {
  created: '발견', policy_changed: '정책 변경', deadline_changed: '마감 변경',
  deadline_extended: '마감 연장', status_changed: '상태 변경', hiring_link_changed: '채용연계 변경',
}
const labelOf = (v) => POLICY_LABEL[v] || STATUS_LABEL[v] || v

// 마감일 당일 23:59 KST 까지 남은 시간 — 30초마다 다시 센다
function useCountdown(deadline) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [deadline])
  if (!deadline) return null
  const end = new Date(deadline + 'T23:59:59+09:00').getTime()
  if (Number.isNaN(end)) return null
  const ms = end - now
  if (ms <= 0) return { over: true, text: '마감 지남' }
  const d = Math.floor(ms / 864e5)
  const h = Math.floor((ms % 864e5) / 36e5)
  const m = Math.floor((ms % 36e5) / 6e4)
  const text = d > 0 ? `${d}일 ${h}시간 남음` : h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`
  return { over: false, text }
}

// 큰 마감 숫자도 표와 같은 낱말·톤을 쓴다 (PR E)
const ddBig = (r) => relativeText(r.dd, r.open)

function KV({ k, v }) {
  if (!v) return null
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  )
}

// 접히는 섹션 — 운영 메모(공략·수집/추적)는 기본으로 닫아 두고, 머리줄에 요약만 남긴다
function FoldSec({ id, label, summary, open, onToggle, children }) {
  return (
    <section className="dp-sec">
      <button type="button" className="dp-sec-h" aria-expanded={open} aria-controls={id}
        onClick={onToggle} title={open ? `${label} 접기` : `${label} 펼치기`}>
        <span className="k">{label}</span>
        {summary && <span className="dp-sec-sum">{summary}</span>}
        <span className="dp-sec-x" aria-hidden="true">{open ? '접기' : '펼치기'}</span>
      </button>
      {open && <div id={id} className="dp-sec-b">{children}</div>}
    </section>
  )
}

export default function DetailPane({ r, rows = [], starred, onStar, onClose, onPickRelated }) {
  const cd = useCountdown(r.deadline)
  const change = policyChangeByID.get(r.id)
  const hist = (r.history || []).filter((h) => h.event !== 'created')
  const quotes = (r.evidenceAll && r.evidenceAll.length ? r.evidenceAll : [r.evidenceFull || r.evidence]).filter(Boolean)
  const memos = (r.evidenceMemo || []).filter(Boolean)
  const tone = deadlineTone(r.dd, r.open)
  const ddCls = 'dp-dd big ' + (tone === 'hot' ? 'hot' : tone === 'over' ? 'pass' : tone === 'calm' ? 'calm' : 'base')
  const [track, setTrack] = useState(false)

  // 다른 행으로 옮기면 접힘 상태는 기본값으로 돌린다 (한 행의 판단을 다음 행에 물려주지 않는다)
  useEffect(() => { setTrack(false) }, [r.id])

  const checkLine = r.checked ? `확인 ${r.checked.slice(5)}` : ''
  const reviewLine = r.review === 'needs_review' ? '검토 필요' : r.review === 'confirmed' ? '검토 완료' : (r.review || '')

  return (
    <aside className="dpane" aria-label="선택한 기회 상세" role="region">
      <div className="dp-hd">
        <span className="dp-kicker">{r.kind === 'posting' ? '채용 과제' : r.type}</span>
        {r.hiring && <span className="badge">채용연계</span>}
        {change && <span className="badge chg">정책변경</span>}
        <GuideProgressBadge r={r} full />
        <button type="button" className="dp-x" onClick={onClose} aria-label="상세 패널 닫기 (Esc)">닫기 Esc</button>
      </div>

      <h2 className="dp-name">{disp(r.name)}</h2>
      {r.title && r.title !== r.name && <div className="dp-title">{disp(r.title)}</div>}
      <div className="dp-sub">{disp(r.sub) || '대상/주최 미상'}</div>

      <div className="dp-ddwrap">
        <span className={ddCls}>{ddBig(r)}</span>
        <span className="dp-ddmeta">
          {r.deadline
            ? <>{r.deadline} 마감{cd ? <> | {cd.text}</> : null}</>
            : <>마감일 미정 | 원문에서 확인</>}
        </span>
      </div>

      {/* 핵심 동작은 제목·마감 바로 아래 — 공략·이력을 다 스크롤하지 않아도 보인다.
          행에서 뺀 .ics 는 여기 상단에서 받는다 (PR B) */}
      <div className="dp-acts dp-acts-top">
        {r.url
          ? <a className="ics act primary" href={r.url} target="_blank" rel="noreferrer" title="원문 공고를 새 탭으로 연다 (o)">원문 열기</a>
          : <span className="dp-none">원문 미확보 (수집 {r.first || r.checked || '-'})</span>}
        <button type="button" className={'ics act starbtn' + (starred ? ' on' : '')} onClick={() => onStar(r.id)}
          title={starred ? '관심 목록에서 뺀다 (s)' : '관심 목록에 담는다 (s)'}>
          {starred ? '관심 해제' : '관심 등록'}
        </button>
        {r.deadline
          ? <button type="button" className="ics act" title={`${r.deadline} 종일 일정으로 캘린더에 넣는다`}
            onClick={() => downloadIcs([r])}>마감 .ics</button>
          : <span className="dp-none">마감일 미정 | .ics 없음</span>}
      </div>

      <div className="dp-status">
        <span className="dp-status-k">지원 상태</span>
        <StatusPicker id={r.id} />
      </div>

      {/* 1. 근거 인용 — 공고 원문 문장만. 수집가의 판단은 아래 수집 메모로 내려간다 */}
      <section className="dp-sec">
        <h3>AI 정책 / 근거 인용</h3>
        <div className="dp-polline">
          <span className={`pol ${r.policy.cls}`}><i aria-hidden="true"></i>{POLICY_LABEL[r.policyKey] || r.policy.label}</span>
          {r.policyRaw && <span className="dp-raw">원문: {disp(r.policyRaw)}</span>}
        </div>
        {quotes.length > 0
          ? quotes.map((q, i) => <blockquote className="dp-q" key={i}>{disp(q)}</blockquote>)
          : <p className="dp-none">원문 근거 문장이 아직 없다 | 정책 단단은 원문에서만 한다</p>}
        {change && (
          <p className="dp-chg">{change.date} 정책 변경: {labelOf(change.from)} → {labelOf(change.to)}
            {change.evidence ? <span className="dp-raw"> | {disp(change.evidence)}</span> : null}
          </p>
        )}
      </section>

      {/* 2. 전형 / 자격 */}
      <section className="dp-sec">
        <h3>전형 / 자격</h3>
        {r.process
          ? <p className="dp-proc">{disp(r.process)}</p>
          : <p className="dp-none">전형 절차가 수집되지 않았다 | 원문 공고에서 확인한다</p>}
        <dl className="dp-kv">
          <KV k="과제 유형" v={r.kind === 'posting' ? (r.assignment || '') : (r.format || '')} />
          <KV k="포지션" v={(r.positions || []).join(' | ')} />
          <KV k="상금" v={disp(r.prize)} />
          <KV k="팀" v={r.team ? (r.team === 'solo' ? '개인' : r.team) : ''} />
          <KV k="결과 발표" v={r.resultDate || ''} />
        </dl>
      </section>

      {/* 3. AI 공략 — 긴 본문이라 기본은 접힌 상태로 둔다 */}
      <GuidePane r={r} defaultOpen={false} />

      {/* 4. 수집 / 추적 — 표에서 뺀 확인일·출처와 수집기 메모가 사는 곳 */}
      <FoldSec id="dp-track" label="수집 / 추적" open={track} onToggle={() => setTrack((v) => !v)}
        summary={[checkLine, reviewLine].filter(Boolean).join(' | ')}>
        <dl className="dp-kv">
          <KV k="상태" v={STATUS_LABEL[r.status] || r.status} />
          <KV k="확인" v={r.checked ? `${r.checked} (${REL_DAYS(r.checked)})` : '-'} />
          <KV k="발견" v={r.first || '-'} />
          <KV k="출처" v={disp(r.source)} />
          <KV k="검토" v={reviewLine} />
        </dl>
        {(memos.length > 0 || r.note || r.stateRaw) && (
          <div className="dp-memo">
            <span className="dp-memo-k">수집 메모</span>
            {memos.map((m, i) => <p key={i}>{disp(m)}</p>)}
            {r.note && <p>{disp(r.note)}</p>}
            {r.stateRaw && <p>{disp(r.stateRaw)}</p>}
          </div>
        )}
        {hist.length > 0 && (
          <div className="dp-memo">
            <span className="dp-memo-k">기록</span>
            {hist.map((h, i) => (
              <p key={i} className="dp-hist">
                <span className="d">{h.date}</span>
                <span className="ev">{HIST_LABEL[h.event] || h.event}</span>
                {h.from && h.to ? ` ${labelOf(h.from)} → ${labelOf(h.to)}` : ''}
                {h.evidence ? <span className="dp-raw"> | {disp(h.evidence)}</span> : null}
              </p>
            ))}
          </div>
        )}
      </FoldSec>

      <RelatedList r={r} rows={rows} onPick={onPickRelated} />

      <div className="dp-acts dp-acts-bottom">
        <a className="ics act rep" href={reportIssueUrl(r)} target="_blank" rel="noreferrer"
          title="정보가 틀렸거나 AI 정책이 바뀌었을 때 GitHub 이슈로 미리 채워 보낸다">정보 수정·AI 정책 제보</a>
      </div>
      <div className="dp-foot">j k 로 행을 옮기면 이 패널이 따라온다 | Esc 닫기</div>
    </aside>
  )
}
