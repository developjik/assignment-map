const ITEMS = [
  { id: 'all', label: '전체 기회' },
  { id: 'postings', label: '채용 과제' },
  { id: 'hackathon', label: '해커톤' },
  { id: 'competition', label: '대회·챌린지' },
  { id: 'contest', label: '공모전' },
  { id: 'platforms', label: '플랫폼' },
  { id: 'news', label: '트렌드·뉴스' },
  { id: 'changelog', label: '변경로그' },
  { id: 'method', label: '방법론' },
]

export default function Rail({ tab, setTab, counts, review }) {
  return (
    <nav className="rail" aria-label="섹션">
      {ITEMS.map((it, i) => (
        <button
          key={it.id}
          className={'ritem' + (tab === it.id ? ' on' : '') + (i === 5 ? ' rail-gap' : '')}
          style={i === 5 ? { marginTop: 10 } : undefined}
          onClick={() => setTab(it.id)}
          aria-current={tab === it.id ? 'page' : undefined}
        >
          <span>{it.label}</span>
          <span className={'n' + (it.id === 'all' && review ? ' hl' : '')}>
            {counts[it.id] !== undefined ? counts[it.id] : ''}
          </span>
        </button>
      ))}
    </nav>
  )
}
