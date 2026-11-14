import { useEffect, useMemo, useState } from 'react'
import { meta, rows, platforms, news, runs, stats, commit } from './lib/data'
import { readHash, writeHash } from './lib/hash'
import { useStaleness } from './lib/freshness'
import Rail from './components/Rail'
import Opportunities from './views/Opportunities'
import Calendar from './views/Calendar'
import Platforms from './views/Platforms'
import News from './views/News'
import Changelog from './views/Changelog'
import Method from './views/Method'

// meetup 을 빼면 #t=meetup 딥링크가 'all' 로 떨어진다 (PR #3 리뷰 지적)
const TABS = ['all', 'postings', 'hackathon', 'competition', 'contest', 'meetup', 'calendar', 'platforms', 'news', 'changelog', 'method']

export default function App() {
  const [tab, setTab] = useState(() => {
    const t = readHash().t
    return TABS.includes(t) ? t : 'all'
  })
  const [q, setQ] = useState(() => readHash().q || '')
  // 수집이 2일 이상 멈췄는지는 브라우저에서 매번 다시 센다 (빌드 시점에 굳히지 않는다)
  const stale = useStaleness(meta.last_run)
  // 해시의 t= 가 바뀌면(링크 붙여넣기, 뒤로/앞으로) 탭도 따라간다
  useEffect(() => {
    const onHash = () => {
      const t = readHash().t
      setTab(TABS.includes(t) ? t : 'all')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
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

  // 탭·검색어를 URL 해시에 병합한다 — 필터 키(policy 등)는 Opportunities가 쓴다
  useEffect(() => {
    writeHash({ t: tab === 'all' ? null : tab, q: q || null })
  }, [tab, q])

  const counts = useMemo(() => ({
    all: rows.filter(r => r.open).length,
    postings: rows.filter(r => r.kind === 'posting' && r.open).length,
    hackathon: rows.filter(r => r.type === '해커톤' && r.open).length,
    competition: rows.filter(r => r.type === '대회' && r.open).length,
    contest: rows.filter(r => r.type === '공모전' && r.open).length,
    meetup: rows.filter(r => ['밋업','컨퍼런스','워크샵'].includes(r.type) && r.open).length,
    calendar: rows.filter(r => r.open && r.deadline).length,
    platforms: platforms.length, news: news.length, changelog: runs.length,
  }), [])

  return (
    <div className="app">
      {/* 헤더 = 검색이 사는 유일한 자리. 표 위 검색줄(.fsearch)은 없앴다. */}
      <header className="hd">
        <span className="logo"><span className="mk" aria-hidden="true"></span>과제지도</span>
        <span className="ver">v0.1.0</span>
        <span className="tagline">AI로 만들어 제출하는 모든 기회 | 매일 03:00 수집</span>
        <span className="right">
          <span className="sbox">
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="기업, 대회명, 기술 스택 검색" aria-label="검색"
              title="공백으로 여러 단어를 넣으면 모두 포함하는 행만 남는다" autoComplete="off" />
            {q && <button type="button" className="sclr" onClick={() => setQ('')} aria-label="검색어 지우기">×</button>}
            <span className="kbd">/</span>
          </span>
          <span className="live"><i aria-hidden="true"></i>{stats.lastRun ? `수집 ${stats.lastRun}` : '미실행'}</span>
        </span>
        {stale.stale && (
          <span className="stale" role="status" title="마지막 수집 이후 오래 지났다. 수집이 재개되면 이 배지는 저절로 사라진다">
            <i aria-hidden="true"></i>수집 지연 (마지막: {meta.last_run} | {stale.days}일 전)
          </span>
        )}
        {recent.length > 0 && (
          <div className="recent">
            <span>최근 조회</span>
            {recent.map((n) => <button key={n} onClick={() => setQ(n)}>{n}</button>)}
          </div>
        )}
      </header>
      <Rail tab={tab} setTab={setTab} counts={counts} review={stats.review} />
      <main className="main">
        {tab === 'calendar' ? (
          <Calendar rows={rows} onVisit={onVisit} />
        ) : tab === 'platforms' ? (
          <Platforms />
        ) : tab === 'news' ? (
          <News q={q} />
        ) : tab === 'changelog' ? (
          <Changelog onPick={(name) => { setTab('all'); setQ(name) }} />
        ) : tab === 'method' ? (
          <Method />
        ) : (
          <Opportunities
            rows={rows}
            type={tab}
            q={q}
            setQ={setQ}
            setTab={setTab}
            onVisit={onVisit}
          />
        )}
        <footer className="ft">
          <span>데이터: <a href="https://www.wanted.co.kr" target="_blank" rel="noreferrer">원티드</a> <a href="https://jumpit.saramin.co.kr" target="_blank" rel="noreferrer">점핏</a> <a href="https://www.jobkorea.co.kr" target="_blank" rel="noreferrer">잡코리아</a> <a href="https://www.wevity.com" target="_blank" rel="noreferrer">위비티</a> <a href="https://devpost.com" target="_blank" rel="noreferrer">Devpost</a> <a href="https://lablab.ai" target="_blank" rel="noreferrer">lablab</a> | 규칙 v3</span>
          <span>마지막 수집 {stats.lastRun || '-'} 03:00 KST | 골든케이스 6/6 | commit {commit} | <a href="./feed.xml">RSS</a> <a href="./feed.json">JSON 피드</a> | <a href="https://github.com/developjik/assignment-map" target="_blank" rel="noreferrer">리포</a> | <a href="https://github.com/developjik/assignment-map/issues" target="_blank" rel="noreferrer">오탐 신고</a></span>
        </footer>
      </main>
    </div>
  )
}
