// 상단 압축 밴드의 통계 묶음 — 한 줄에 6개 지표 + 7일 스파크.
// 예전에는 티커(.strip)와 수집 메타(.ctxbar)가 각각 한 줄씩 먹었지만, 이제 .band 안에 나란히 선다.
export default function Ticker({ stats, spark }) {
  const max = Math.max(1, ...spark)
  const pts = spark.map((v, i) => `${(i * 72) / Math.max(1, spark.length - 1)},${14 - (v / max) * 12}`).join(' ')
  const sum = spark.reduce((s, v) => s + v, 0)
  return (
    <span className="sqs" role="status" aria-label="요약 통계">
      <span className="sq">추적 <b>{stats.tracked}</b></span>
      <span className="sq">AI 명시 <b className="up">{stats.aiExplicit}</b></span>
      <span className="sq">7일 변경 <b className="yl">{stats.policyChanged7d}</b></span>
      <span className="sq">D-7 <b className="up">{stats.d7}</b></span>
      <span className="sq">채용연계 <b className="bl">{stats.hiring}</b></span>
      <span className="sq">검토 <b className="yl">{stats.review}</b></span>
      <span className="spark" title={`최근 수집 7회 동안 신규 ${sum}건`}>
        7일 +{sum}
        <svg width="72" height="16" aria-hidden="true" focusable="false">
          <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth="1.2" />
        </svg>
      </span>
    </span>
  )
}
