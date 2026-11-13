import { policyChanges, runs } from '../lib/data'
import { POLICY_LABEL } from '../lib/labels'

const SITELOG = [
  { date: '2026-11-13', text: '표 위에 마감 티커를 올렸다 — D-3로 굴러들어온 건이 3.8초마다 한 칸씩 흐르고, 누르면 그 건만 남는다. 키보드는 o로 원문, ↑↓까지 받고 ?로 단축키 전체를 편다. 휴대폰에서는 레일과 필터가 한 줄 가로 스크롤 칩이 되고, 행 높이를 키워 엄지로 누르기 좋게 바꿨다.' },
  { date: '2026-11-12', text: '검색을 표 안으로 끌어내렸다 — 기업, 주최, 상금, 기술 스택이 한 인덱스에서 걸린다. 조건 두 개(채용연계만, 정책변경만)와 마감/최신 정렬, .ics 내보내기, RSS·JSON 피드까지 이번 패스에 붙였다.' },
  { date: '2026-10-24', text: '카드를 죽이고 표를 주인으로 앉혔다. 이제 모든 컬럼이 정렬을 듣는다. j/k로 행을 걷는 것도 된다 — k9s에서 훔쳤다.' },
  { date: '2026-10-24', text: 'NEW와 채용연계 배지를 amber로 옮겼다. 빨강은 정책 이야기에만 쓴다 — 블룸버그가 그렇게 산 지 40년쯤 됐다.' },
  { date: '2026-10-24', text: '마감이 3일 안으로 굴러들어오면 행이 저절로 붉어진다. 놓치지 말라고.' },
]

const polLabel = (v) => POLICY_LABEL[v] || v || '-'

export default function Changelog({ onPick }) {
  const lastPolicy = policyChanges[0]
  return (
    <div className="sec">
      <h2>AI 정책 변경 기업</h2>
      <p className="lede">
        채용 과제에서 AI를 쓰게 만든 기업, 쓰는 방식을 바꾼 기업만 모았다. 정책 변경은 매일 수집 런이 원문 문구로 확인한 것만 기록한다
        {lastPolicy ? ` | 마지막 기록 ${lastPolicy.date}` : ''} | 총 {policyChanges.length}건
      </p>
      {policyChanges.length === 0 ? (
        <div className="cl-none">아직 기록이 없다. 수집 런이 정책 변경을 잡으면 여기와 표의 정책변경 배지에 함께 쌓인다.</div>
      ) : (
        <div className="polchg">
          {policyChanges.map((c) => (
            <div className="pc-it" key={c.id + c.date}>
              <span className="d">{c.date}</span>
              <span className="who">
                <button className="pc-name" onClick={() => onPick && onPick(c.name)} title="표에서 이 기업만 보기">{c.name}</button>
                {c.kind === 'posting' ? <span className="pc-kind">채용 공고</span> : <span className="pc-kind">이벤트</span>}
              </span>
              <span className="pc-dir">{polLabel(c.from)} → <b>{polLabel(c.to)}</b></span>
              {c.evidence && <span className="pc-ev">"{c.evidence.slice(0, 160)}{c.evidence.length > 160 ? '...' : ''}"</span>}
              {c.url && <a href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>원문</a>}
            </div>
          ))}
        </div>
      )}
      <h2 style={{ marginTop: 22 }}>사이트 변경 이력</h2>
      {SITELOG.map((s, i) => (
        <div className="cl-it" key={'site' + i}>
          <span className="d">{s.date}</span>
          <span className="s">{s.text}</span>
        </div>
      ))}
      <h2 style={{ marginTop: 18 }}>수집 변경 로그 (일별 diff)</h2>
      {runs.map((r, i) => (
        <div className="cl-it" key={r.date + i}>
          <span className="d">{r.date}</span>
          <span className="s">{r.summary}</span>
          {r.policy_changed && r.policy_changed.length > 0 && (
            <div className="s" style={{ color: 'var(--yellow)' }}>정책 변경: {r.policy_changed.join(', ')}</div>
          )}
          {r.new_events && r.new_events.length > 0 && (
            <div className="s" style={{ color: 'var(--faint)' }}>신규 이벤트: {r.new_events.join(', ')}</div>
          )}
          {r.notes && <div className="s" style={{ color: 'var(--faint)', marginTop: 2 }}>{r.notes.slice(0, 300)}{r.notes.length > 300 ? '...' : ''}</div>}
        </div>
      ))}
    </div>
  )
}
