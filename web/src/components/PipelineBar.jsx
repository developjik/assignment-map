import { PIPELINE, HOT_WINDOW, pipelineSummary } from '../lib/pipeline'

// 지원 파이프라인 요약 바 — 목록 위 한 줄.
//
// 왜 표가 아니라 바인가: 이 앱의 표는 "무엇이 열려 있나"를 보여주고, 사용자가 남긴 기록
// (관심·과제중·제출완료)은 상세 패널 안에만 있었다. 지원은 표의 정렬이 아니라 흐름이라,
// 지금 내 기록이 어느 단계에 몇 건 있는지와 그중 마감이 급한 것이 몇 건인지를 한 줄로 둔다.
//
// 조작은 기존 축 하나만 쓴다 — 필터 팝오버의 '내 진행'(prog)과 같은 상태라서, 칩을 누르면
// 조건 칩 줄에도 같은 조건이 서고 URL 해시(#prog=interested)로도 공유된다. 새 저장 키는 없다.
export default function PipelineBar({ counts, prog, onPick, hotDays = HOT_WINDOW }) {
  if (!counts || !counts.total) return null
  const summary = pipelineSummary(counts, hotDays)
  return (
    <div className={'pl' + (counts.hot ? ' hot' : '')} role="group" aria-label="지원 파이프라인">
      <span className="pl-k" title="내 기록(관심·과제중·제출완료)으로 센 지금 목록의 진행 상황">파이프라인</span>
      {PIPELINE.map((s) => {
        const n = counts[s.id] || 0
        const hot = (counts.hotBy && counts.hotBy[s.id]) || 0
        const on = prog === s.id
        return (
          <button key={s.id} type="button"
            className={'pl-b ' + s.cls + (on ? ' on' : '') + (n ? '' : ' z')}
            aria-pressed={on}
            onClick={() => onPick(s.id)}
            title={n
              ? `${s.label} ${n}건만 본다${hot ? ` | 그중 D-${hotDays} 이내 ${hot}건` : ''} | 다시 누르면 해제`
              : `${s.label}으로 남긴 건이 없다 | 행의 지원 상태 버튼이나 상세 패널에서 표시한다`}>
            <span className="pl-l">{s.label}</span>
            <b className="pl-n">{n}</b>
            {hot > 0 && <span className="pl-hot" aria-label={`D-${hotDays} 이내 ${hot}건`}>임박 {hot}</span>}
          </button>
        )
      })}
      <span className="pl-u" title="아직 관심·지원 상태를 남기지 않은 건">{counts.unset}건 미설정</span>
      {counts.hot > 0 && (
        <span className="pl-warn" title={`관심·과제중 중 마감이 D-${hotDays} 이내인 건`}>
          D-{hotDays} 이내 {counts.hot}건
        </span>
      )}
      <span className="sr" role="status">{summary}</span>
    </div>
  )
}
