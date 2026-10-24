import { useMemo, useState } from 'react'
import { platforms } from '../lib/data'

export default function Platforms() {
  const [region, setRegion] = useState('all')
  const items = useMemo(() => platforms.filter(p => region === 'all' || p.region === region), [region])
  return (
    <>
      <div className="fr">
        <span className="fl">지역</span>
        {[['all', `전체 ${platforms.length}`], ['kr', `국내 ${platforms.filter(p => p.region === 'kr').length}`], ['global', `해외 ${platforms.filter(p => p.region === 'global').length}`]].map(([id, label]) => (
          <button key={id} className={'fopt' + (region === id ? ' on' : '')} aria-pressed={region === id} onClick={() => setRegion(id)}>{label}</button>
        ))}
      </div>
      <div className="twrap pwrap">
        <table>
          <thead><tr>
            <th>서비스</th><th>분류</th><th>개인 이용</th><th>FE 평가</th><th>채용 연계</th><th>링크</th>
          </tr></thead>
          <tbody>
            {items.map((p, i) => (
              <tr key={p.id} className={i % 2 ? 'z' : ''} title={p.trend_2025_26 || ''}>
                <td><span className="co">{p.name}</span><div style={{ color: 'var(--faint)', fontSize: 10.5 }}>{p.operator}</div></td>
                <td className="typ">{p.category}</td>
                <td className="typ">{p.individual_use}</td>
                <td className="typ">{p.fe_support}</td>
                <td className="typ">{p.hiring_integration}</td>
                <td>{p.url && <a href={p.url} target="_blank" rel="noreferrer">열기</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
