export default function Ticker({ stats, spark }) {
  const max = Math.max(1, ...spark)
  const pts = spark.map((v, i) => `${(i * 72) / Math.max(1, spark.length - 1)},${14 - (v / max) * 12}`).join(' ')
  return (
    <div className="strip" role="status" aria-label="요약 통계">
      <span className="sq">추적 <b>{stats.tracked}</b></span>
      <span className="sq">AI 정책 명시 <b className="up">{stats.aiExplicit}</b></span>
      <span className="sq">7일 정책 변경 <b className="yl">{stats.policyChanged7d}</b></span>
      <span className="sq">D-7 이내 <b className="up">{stats.d7}</b></span>
      <span className="sq">채용 연계 <b className="bl">{stats.hiring}</b></span>
      <span className="sq">검토 필요 <b className="yl">{stats.review}</b></span>
      <span className="spark">
        7일 신규
        <svg width="72" height="16" aria-hidden="true" focusable="false">
          <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth="1.2" />
        </svg>
      </span>
    </div>
  )
}
