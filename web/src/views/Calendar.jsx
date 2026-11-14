import { useEffect, useMemo, useState } from 'react'
import { POLICY_LABEL, disp } from '../lib/labels'
import { downloadIcs } from '../lib/ics'
import { kstToday } from '../lib/freshness'
import { useStarred } from '../lib/starred'
import DetailPane from '../components/DetailPane'

// 마감 캘린더 — 모집 중인 공고·해커톤·대회·공모전의 마감일을 격자로 본다.
// 표가 "무엇이 있나"라면 여기는 "언제 몰려 있나"다. 날짜를 고르면 그날 마감 목록이,
// 항목을 고르면 우측 상세 패널이 열린다. .ics 는 보이는 범위 그대로 내려받는다.
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const DAY = 864e5
const CAL_TYPES = new Set(['해커톤', '대회', '공모전'])
const KIND_CLS = { posting: 'posting', 해커톤: 'hackathon', 대회: 'competition', 공모전: 'contest' }
const KIND_LABEL = { posting: '채용 과제', hackathon: '해커톤', competition: '대회', contest: '공모전' }

const pad2 = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const dowOf = (dateStr) => new Date(dateStr + 'T00:00:00Z').getUTCDay()
const addDays = (dateStr, n) => new Date(Date.parse(dateStr + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
const parseYmd = (dateStr) => {
  const [y, m, d] = String(dateStr || '').split('-').map(Number)
  return { y, m: (m || 1) - 1, d: d || 1 }
}
const monthLabel = (dateStr) => {
  const { y, m } = parseYmd(dateStr)
  return `${y}년 ${m + 1}월`
}
const shortLabel = (dateStr) => {
  const { m, d } = parseYmd(dateStr)
  return `${m + 1}/${d}`
}

function calKind(r) {
  return r.kind === 'posting' ? 'posting' : KIND_CLS[r.type]
}

export default function Calendar({ rows, onVisit }) {
  const today = kstToday()
  const [cursor, setCursor] = useState(() => kstToday())
  const [view, setView] = useState(() => localStorage.getItem('am-cal-view') || 'month')
  const [day, setDay] = useState(null)
  const [selId, setSelId] = useState(null)
  const [starredIds, toggleStar] = useStarred()

  useEffect(() => { localStorage.setItem('am-cal-view', view) }, [view])

  // 캘린더 대상: 모집 중 + 마감일이 있는 채용 과제와 해커톤·대회·공모전
  const calRows = useMemo(
    () => rows.filter((r) => r.open && r.deadline && (r.kind === 'posting' || CAL_TYPES.has(r.type))),
    [rows])

  const byDate = useMemo(() => {
    const m = new Map()
    for (const r of calRows) {
      const list = m.get(r.deadline)
      if (list) list.push(r)
      else m.set(r.deadline, [r])
    }
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return m
  }, [calRows])

  const { cells, rangeLabel, rangeRows } = useMemo(() => {
    if (view === 'week') {
      const start = addDays(cursor, -dowOf(cursor))
      const list = Array.from({ length: 7 }, (_, i) => addDays(start, i))
      const inRange = calRows.filter((r) => r.deadline >= list[0] && r.deadline <= list[6])
      return {
        cells: list,
        rangeLabel: `${monthLabel(start)} ${parseYmd(start).d}일 - ${shortLabel(list[6])}`,
        rangeRows: inRange,
      }
    }
    const { y, m } = parseYmd(cursor)
    const lead = dowOf(ymd(y, m, 1))
    const total = Math.ceil((lead + daysInMonth(y, m)) / 7) * 7
    const start = addDays(ymd(y, m, 1), -lead)
    const list = Array.from({ length: total }, (_, i) => addDays(start, i))
    const from = ymd(y, m, 1)
    const to = ymd(y, m, daysInMonth(y, m))
    return {
      cells: list,
      rangeLabel: monthLabel(from),
      rangeRows: calRows.filter((r) => r.deadline >= from && r.deadline <= to),
    }
  }, [view, cursor, calRows])

  const step = (dir) => {
    if (view === 'week') { setCursor((c) => addDays(c, dir * 7)); return }
    const { y, m } = parseYmd(cursor)
    const next = new Date(Date.UTC(y, m + dir, 1))
    setCursor(ymd(next.getUTCFullYear(), next.getUTCMonth(), 1))
  }
  const goToday = () => { setCursor(today); setDay(today) }

  const selected = selId ? calRows.find((r) => r.id === selId) || null : null
  const dayRows = day ? byDate.get(day) || [] : []
  const monthPicked = parseYmd(cursor).m

  const pick = (r, d) => {
    setSelId(r.id)
    if (d) setDay(d)
    onVisit && onVisit(r)
  }

  const typeCounts = useMemo(() => {
    const c = { posting: 0, hackathon: 0, competition: 0, contest: 0 }
    for (const r of rangeRows) c[calKind(r)] = (c[calKind(r)] || 0) + 1
    return c
  }, [rangeRows])

  return (
    <div className="cal">
      <div className="cal-bar">
        <span className="cal-title">{rangeLabel}</span>
        <span className="cal-nav">
          <button type="button" onClick={() => step(-1)} aria-label={view === 'week' ? '이전 주' : '이전 달'}>{'<'}</button>
          <button type="button" onClick={() => step(1)} aria-label={view === 'week' ? '다음 주' : '다음 달'}>{'>'}</button>
        </span>
        <button type="button" className="cal-today" onClick={goToday}>오늘</button>
        <span className="cal-view" role="group" aria-label="캘린더 범위">
          <button type="button" className={view === 'month' ? 'on' : ''} aria-pressed={view === 'month'}
            onClick={() => setView('month')}>월간</button>
          <button type="button" className={view === 'week' ? 'on' : ''} aria-pressed={view === 'week'}
            onClick={() => setView('week')}>주간</button>
        </span>
        <span className="cal-legend">
          <span className="lg posting"><i aria-hidden="true"></i>채용 과제</span>
          <span className="lg hackathon"><i aria-hidden="true"></i>해커톤</span>
          <span className="lg competition"><i aria-hidden="true"></i>대회</span>
          <span className="lg contest"><i aria-hidden="true"></i>공모전</span>
        </span>
        <span className="cal-cnt">이 범위 <b>{rangeRows.length}</b>건</span>
        <button type="button" className="cal-ics" onClick={() => rangeRows.length && downloadIcs(rangeRows)}
          disabled={!rangeRows.length} title="지금 보이는 범위의 마감일을 캘린더 파일(.ics)로 내려받는다">.ics</button>
      </div>

      <div className="cal-main">
        <div className="cal-gridwrap">
          <div className="cal-dow" aria-hidden="true">
            {DOW.map((d, i) => <span key={d} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{d}</span>)}
          </div>
          <div className={'cal-grid ' + (view === 'week' ? 'wk' : 'mo')} role="grid" aria-label={`${rangeLabel} 마감 캘린더`}>
            {cells.map((dateStr) => {
              const list = byDate.get(dateStr) || []
              const { m } = parseYmd(dateStr)
              const outside = view === 'month' && m !== monthPicked
              const isToday = dateStr === today
              const isSel = dateStr === day
              const show = view === 'week' ? 6 : 3
              return (
                <div key={dateStr} role="gridcell"
                  className={'cal-cell' + (outside ? ' out' : '') + (isToday ? ' today' : '') + (isSel ? ' sel' : '')}>
                  <button type="button" className={'cal-dn' + (isToday ? ' today' : '')}
                    onClick={() => setDay(dateStr)} aria-label={`${dateStr} 마감 ${list.length}건 보기`}
                    aria-pressed={isSel}>
                    <span className="n">{parseYmd(dateStr).d}</span>
                    {list.length > 0 && <span className="c">{list.length}</span>}
                  </button>
                  <span className="cal-dots" aria-hidden="true">
                    {list.slice(0, 4).map((r) => <i key={r.id} className={'dot ' + calKind(r)}></i>)}
                  </span>
                  {list.slice(0, show).map((r) => (
                    <button key={r.id} type="button" className={'cal-it ' + calKind(r) + (selId === r.id ? ' on' : '')}
                      title={`${r.name} | ${POLICY_LABEL[r.policyKey] || ''} | ${r.deadline}`}
                      onClick={() => pick(r, dateStr)}>
                      {disp(r.name)}
                    </button>
                  ))}
                  {list.length > show && (
                    <button type="button" className="cal-more" onClick={() => setDay(dateStr)}>
                      +{list.length - show}건
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="cal-side" aria-label="캘린더 선택">
          {selected ? (
            <DetailPane r={selected} starred={starredIds.includes(selected.id)} onStar={toggleStar}
              onClose={() => setSelId(null)} />
          ) : day ? (
            <div className="dayc">
              <div className="dayc-hd">
                <span className="dayc-d">{day}</span>
                <span className="dayc-n">{dayRows.length}건 마감</span>
                <button type="button" className="dp-x" onClick={() => setDay(null)} aria-label="날짜 선택 해제">닫기</button>
              </div>
              {dayRows.length === 0 && (
                <p className="dp-none">이 날 마감하는 모집 중 공고가 없다. 날짜를 다시 고르거나 월간으로 돌아간다.</p>
              )}
              <ul className="dayc-list">
                {dayRows.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="dayc-it" onClick={() => pick(r)}>
                      <span className={'dayc-k ' + calKind(r)}>{KIND_LABEL[calKind(r)]}</span>
                      <span className="dayc-nm">{disp(r.name)}</span>
                      <span className="dayc-pol"><span className={`pol ${r.policy.cls}`}><i aria-hidden="true"></i>{POLICY_LABEL[r.policyKey] || r.policy.label}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
              {dayRows.length > 0 && (
                <div className="dayc-acts">
                  <button type="button" className="ics act" onClick={() => downloadIcs(dayRows)}
                    title={`${day} 마감 ${dayRows.length}건을 캘린더 파일로 내려받는다`}>.ics {dayRows.length}건</button>
                </div>
              )}
            </div>
          ) : (
            <div className="dayc">
              <div className="dayc-hd">
                <span className="dayc-d">{rangeLabel}</span>
                <span className="dayc-n">{rangeRows.length}건 마감</span>
              </div>
              <dl className="cal-sum">
                <dt>채용 과제</dt><dd>{typeCounts.posting || 0}</dd>
                <dt>해커톤</dt><dd>{typeCounts.hackathon || 0}</dd>
                <dt>대회</dt><dd>{typeCounts.competition || 0}</dd>
                <dt>공모전</dt><dd>{typeCounts.contest || 0}</dd>
              </dl>
              <p className="dp-none">날짜를 누르면 그날 마감 목록이 열린다. 항목을 누르면 상세와 원문, .ics 저장이 여기 붙는다.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
