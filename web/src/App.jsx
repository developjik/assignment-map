import { useEffect, useMemo, useState } from 'react'
import { rows, platforms, news, runs, stats, sparkPoints, commit, meta, ddayText } from './lib/data'
import Rail from './components/Rail'
import Ticker from './components/Ticker'
import Opportunities from './views/Opportunities'
import Platforms from './views/Platforms'
import News from './views/News'
import Changelog from './views/Changelog'
import Method from './views/Method'

const TABS = ['all', 'postings', 'hackathon', 'competition', 'contest', 'platforms', 'news', 'changelog', 'method']

export default function App() {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('am-recent') || '[]') } catch { return [] }
  })

  const onVisit = (r) => {
    setRecent(prev => {
      const next = [r.name, ...prev.filter(n => n !== r.name)].slice(0, 5)
      localStorage.setItem('am-recent', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault(); document.getElementById('q')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const counts = useMemo(() => ({
    all: rows.filter(r => r.open).length,
    postings: rows.filter(r => r.kind === 'posting' && r.open).length,
    hackathon: rows.filter(r => r.type === '해커톤' && r.open).length,
    competition: rows.filter(r => r.type === '대회' && r.open).length,
    contest: rows.filter(r => r.type === '공모전' && r.open).length,
    platforms: platforms.length, news: news.length, changelog: runs.length,
  }), [])

  return (
    <div className="app">
      <header className="hd">
        <span className="logo"><span className="mk" aria-hidden="true"></span>과제지도</span>
        <span className="ver">v0.1.0</span>
        <span className="right">
          <span className="sbox">
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="기업, 대회명, 키워드 검색" aria-label="검색" />
            <span className="kbd">/</span>
          </span>
          <span className="live"><i aria-hidden="true"></i>{stats.lastRun ? `수집 ${stats.lastRun}` : '미실행'}</span>
        </span>
        {recent.length > 0 && (
          <div className="recent">
            <span>최근 조회</span>
            {recent.map((n) => <a key={n} onClick={() => setQ(n)}>{n}</a>)}
          </div>
        )}
      </header>
      <Rail tab={tab} setTab={setTab} counts={counts} review={stats.review} />
      <main className="main">
        {tab === 'platforms' ? (
          <Platforms />
        ) : tab === 'news' ? (
          <News />
        ) : tab === 'changelog' ? (
          <Changelog />
        ) : tab === 'method' ? (
          <Method />
        ) : (
          <>
            <Ticker stats={stats} spark={sparkPoints} />
            <Opportunities
              rows={rows}
              type={tab}
              q={q}
              setQ={setQ}
              onVisit={onVisit}
            />
          </>
        )}
        <footer className="ft">
          <span>데이터: 원티드 점핏 잡코리아 위비티 Devpost lablab 뉴스RSS | 규칙 v3 | 수집 로그 runs/</span>
          <span>마지막 수집 {stats.lastRun || '-'} 03:00 KST | commit {commit} | <a href="https://github.com/developjik/assignment-map" target="_blank" rel="noreferrer">리포</a> | <a href="https://github.com/developjik/assignment-map/issues" target="_blank" rel="noreferrer">오탐 신고</a></span>
        </footer>
      </main>
    </div>
  )
}
