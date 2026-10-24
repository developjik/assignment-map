import { platforms } from '../lib/data'
export default function Platforms() {
  return (
    <div className="twrap">
      <table>
        <thead><tr>
          <th>서비스</th><th>지역</th><th>분류</th><th>개인 이용</th><th>FE 평가</th><th>채용 연계</th><th>2025-26 동향</th><th>링크</th>
        </tr></thead>
        <tbody>
          {platforms.map((p, i) => (
            <tr key={p.id} className={i % 2 ? 'z' : ''}>
              <td><span className="co">{p.name}</span><div style={{ color: 'var(--faint)', fontSize: 10.5 }}>{p.operator}</div></td>
              <td className="typ">{p.region === 'kr' ? '국내' : '해외'}</td>
              <td className="typ">{p.category}</td>
              <td className="typ">{p.individual_use} {p.cost && p.cost !== '—' ? `(${p.cost})` : ''}</td>
              <td className="typ" style={{ maxWidth: 200 }}>{p.fe_support}</td>
              <td className="typ" style={{ maxWidth: 180 }}>{p.hiring_integration}</td>
              <td className="typ" style={{ maxWidth: 220 }}>{p.trend_2025_26}</td>
              <td>{p.url && <a href={p.url} target="_blank" rel="noreferrer">열기</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
