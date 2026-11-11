// 캘린더(.ics) 내보내기 — RFC 5545 VCALENDAR/VEVENT, 종일 일정(마감일).
// 서버 없이 브라우저에서 문자열을 만들어 Blob으로 내려받는다.

const SITE = 'https://developjik.github.io/assignment-map'
const PRODID = '-//assignment-map//deadline export//KO'

const pad = (n) => String(n).padStart(2, '0')

// YYYY-MM-DD → YYYYMMDD (유효하지 않으면 null)
export function icsDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  return dateStr.replace(/-/g, '')
}

// 마감일 다음 날 (종일 일정 DTEND는 배타적)
export function nextDay(dateStr) {
  const t = Date.parse(dateStr + 'T00:00:00Z')
  if (Number.isNaN(t)) return null
  const d = new Date(t + 864e5)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function stamp(date) {
  return (
    date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) +
    'T' + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z'
  )
}

// RFC 5545 TEXT 이스케이프: 백슬래시, 세미콜론, 쉼표, 개행
export function icsText(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// UTF-8 바이트 수 (TextEncoder 없는 환경 포함)
export function utf8Len(s) {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0)
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }
  return n
}

// 75옥텟 폴딩 (멀티바이트 문자 중간에서 자르지 않음)
export function fold(line) {
  if (utf8Len(line) <= 75) return line
  const out = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = utf8Len(ch)
    const limit = out.length === 0 ? 75 : 74 // 연속행은 앞 공백 1옥텟을 쓴다
    if (size + n > limit) {
      out.push(cur)
      cur = ' ' + ch
      size = 1 + n
    } else {
      cur += ch
      size += n
    }
  }
  out.push(cur)
  return out.join('\r\n')
}

function uidFor(r) {
  const safe = String(r.id).replace(/[^A-Za-z0-9._-]/g, '-')
  return `deadline-${safe}@assignment-map`
}

function summaryFor(r) {
  const left = r.dd === null || r.dd === undefined ? '' : r.dd >= 0 ? `D-${r.dd} 마감: ` : '마감 지남: '
  return `${left}${r.name}${r.kind === 'posting' ? ' 과제 전형' : ''}`
}

function descriptionFor(r) {
  return [
    r.kind === 'posting' ? `기업: ${r.name}` : `주최: ${r.sub || '-'}`,
    r.title && r.title !== r.name ? `공고: ${r.title}` : '',
    r.deadline ? `마감일: ${r.deadline} (KST)` : '',
    r.prize ? `상금/혜택: ${r.prize}` : '',
    r.hiring ? '채용 연계 있음' : '',
    `AI 정책: ${r.policy?.label || r.policyKey || '-'}`,
    r.evidence ? `근거: ${r.evidence}` : '',
    r.url ? `원문: ${r.url}` : '',
    `출처: 과제지도 ${SITE}`,
  ].filter(Boolean).join('\n')
}

export function buildIcs(list, { now = new Date() } = {}) {
  const events = (list || []).filter((r) => icsDate(r.deadline))
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:과제지도 마감',
    'X-WR-TIMEZONE:Asia/Seoul',
  ]
  for (const r of events) {
    const start = icsDate(r.deadline)
    const end = icsDate(nextDay(r.deadline)) || start
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidFor(r)}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsText(summaryFor(r))}`,
      `DESCRIPTION:${icsText(descriptionFor(r))}`,
    )
    if (r.url) lines.push(`URL:${icsText(r.url)}`)
    lines.push(
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'TRIGGER;RELATED=START:-P3D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`마감 3일 전: ${r.name}`)}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function icsFileName(list) {
  const today = new Date()
  const day = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`
  if (!list || list.length === 0) return `assignment-map-${day}.ics`
  if (list.length === 1) {
    const base = String(list[0].name).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40)
    return `${base}-${list[0].deadline}.ics`
  }
  return `assignment-map-deadlines-${day}-${list.length}.ics`
}

// 브라우저 다운로드 (테스트 환경에서 document가 없으면 문자열만 만든다)
export function downloadIcs(list) {
  const text = buildIcs(list)
  if (typeof document === 'undefined') return text
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = icsFileName(list)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return text
}
