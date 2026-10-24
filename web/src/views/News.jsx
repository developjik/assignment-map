import { useMemo } from 'react'
import { news } from '../lib/data'

const tagCls = (t) => t === '국내' ? 'tag-misc' : /요구|필수|허용|금지|정책/.test(t) ? 'tag-pol' : 'tag-stat'
const normDate = (d) => !d ? '' : /^\d{4}$/.test(d) ? d : (d.length >= 7 ? d.slice(0, 7) : d)

export default function News({ q }) {
  const items = useMemo(() => {
    const ql = (q || '').trim().toLowerCase()
    return news.filter(n => !ql || `${n.topic} ${n.content} ${n.tag} ${n.source}`.toLowerCase().includes(ql))
  }, [q])
  return (
    <div className="sec">
      <h2>트렌드 / 뉴스 / 정책 {items.length !== news.length ? `(${items.length}/${news.length})` : ''}</h2>
      {items.map((n, i) => (
        <div className="news-it" key={n.id || i}>
          <div><span className={`tag-l ${tagCls(n.tag)}`}>{n.tag}</span><span className="t">{n.topic}</span></div>
          <div className="c">{n.content}</div>
          <div className="m">
            {normDate(n.date)}
            {' | '}
            <a href={`https://news.google.com/search?q=${encodeURIComponent(n.source + ' ' + n.topic)}`} target="_blank" rel="noreferrer">{n.source}</a>
          </div>
        </div>
      ))}
      {items.length === 0 && <div className="empty-id"><div className="l1">검색어에 걸리는 기사가 없다.</div><div className="l2">Esc로 해제한다.</div></div>}
    </div>
  )
}
