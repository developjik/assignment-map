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
  const [tab, setTab] = useState(() => (location.hash.match(/t=(\w+)/) || [])[1] || 'all')
  const [q, setQ] = useState(() => decodeURIComponent((location.hash.match(/q=([^&]+)/) || [])[1] || ''))
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
      if (e.key === 'Escape' && document.activeElement.id === 'q') setQ('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 뷰 상태를 URL 해시로 (공유/복원) — 탭과 검색어
  useEffect(() => {
    const h = tab === 'all' && !q ? '' : `#t=${tab}${q ? '&q=' + encodeURIComponent(q) : ''}`
    history.replaceState(null, '', location.pathname + h)
  }, [tab, q])

  const counts = useMemo(() => ({
    all: rows.filter(r => r.open).length,
    postings: rows.filter(r => r.kind === 'posting' && r.open).length,
    hackathon: rows.filter(r => r.type === '해커톤' && r.open).length,
    competition: rows.filter(r => r.type === '대회' && r.open).length,
    contest: rows.filter(r => r.type === '공모전' && r.open).length,
    meetup: rows.filter(r => ['밋업','컨퍼런스','워크샵'].includes(r.type) && r.open).length,
    platforms: platforms.length, news: news.length, changelog: runs.length,
  }), [])

  return (
    <div className="app">
      <header className="hd">
        <span className="logo"><span className="mk" aria-hidden="true"></span>과제지도</span>
        <span className="ver">v0.1.0</span>
        <span className="tagline">AI로 만들어 제출하는 모든 기회 | 매일 03:00 수집</span>
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
            {recent.map((n) => <button key={n} onClick={() => setQ(n)}>{n}</button>)}
          </div>
        )}
      </header>
      <Rail tab={tab} setTab={setTab} counts={counts} review={stats.review} />
      <main className="main">
        {tab === 'platforms' ? (
          <Platforms />
        ) : tab === 'news' ? (
          <News q={q} />
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
          <span>데이터: <a href="https://www.wanted.co.kr" target="_blank" rel="noreferrer">원티드</a> <a href="https://jumpit.saramin.co.kr" target="_blank" rel="noreferrer">점핏</a> <a href="https://www.jobkorea.co.kr" target="_blank" rel="noreferrer">잡코리아</a> <a href="https://www.wevity.com" target="_blank" rel="noreferrer">위비티</a> <a href="https://devpost.com" target="_blank" rel="noreferrer">Devpost</a> <a href="https://lablab.ai" target="_blank" rel="noreferrer">lablab</a> | 규칙 v3</span>
          <span>마지막 수집 {stats.lastRun || '-'} 03:00 KST | commit {commit} | <a href="https://github.com/developjik/assignment-map" target="_blank" rel="noreferrer">리포</a> | <a href="https://github.com/developjik/assignment-map/issues" target="_blank" rel="noreferrer">오탐 신고</a></span>
        </footer>
      </main>
    </div>
  )
}
