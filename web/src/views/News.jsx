import { news } from '../lib/data'
export default function News() {
  return (
    <div className="sec">
      <h2>트렌드 / 뉴스 / 정책</h2>
      {news.map((n, i) => (
        <div className="news-it" key={n.id || i}>
          <div><span className="tag">{n.tag}</span><span className="t">{n.topic}</span></div>
          <div className="c">{n.content}</div>
          <div className="m">{n.date || ''} | {n.source}</div>
        </div>
      ))}
    </div>
  )
}
