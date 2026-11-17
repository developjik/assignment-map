// evidence 문자열을 '원문 인용'과 '수집 메모'로 가른다 (PR B).
//
// 수집기는 한 필드에 세 가지를 같이 남긴다:
//   "GI_Read_Comt_Ifrm 본문(2026-11-07): '서류전형 > 사전과제 > 면접' — 사전과제 전형 명시. AI 정책 언급 없음"
//     └ 출처 라벨(운영)          └ 원문 인용            └ 수집가의 판단(운영)
// 사용자에게 필요한 것은 가운데 인용문 한 조각이고, 앞뒤는 추적 섹션의 메모다.
// 표와 패널이 같은 판단을 쓰도록 여기서만 가른다 — data/*.json 은 손대지 않는다.

// 인용이 아니라 "확인했지만 원문 문장은 없다"는 표시
const PLACEHOLDER = /^(?:[-—–~]+|없음|미확인|미상|해당\s*없음|n\/?a|확인\s*필요|unknown)$/i

// 출처 라벨로 볼 수 있는 낱말 — "위비티 상세(2026-11-07):", "Devpost API(2026-11-15):" 같은 머리말
const SOURCE_WORD = /GI_Read|Devpost|위비티|원티드|잡코리아|점핏|사람인|링커리어|캠퍼스픽|daker|ai-radar|해커그라운드|KISTI|Google\s*Cloud|랩랩|lablab|MLH|AIcrowd|프로그래머스|기사|리스팅|리스트|상세|본문|API|실측|스윕|페이지|배지|공지|모바일|카드|브라우저|홈\b/i

// 수집기 운영 문구 — 인용이 아니라 수집가의 판단이라 표에 내보내지 않는다
const OPS_WORD = /needs_review|산술\s*검증|경과|이탈|재확인|전수|승계|부재|미실행|이중\s*확인|시드|런\s*큐|스윕|검증\s*일치|노출\s*제외|종결|전환/
const OPS_END = /(?:경과|종료|전환|확정|처리|승계|해소|완료|유지|이탈|부재|제외|집계|미확인)\s*(?:\([^)]{0,30}\))?\s*$/
// 마감·기간만 적힌 조각 — 근거로는 약하다 (표 대표 문장에서 뒤로 밀린다)
const PERIOD_ONLY = /^(?:(?:접수|지원|신청|제출|모집|응모)\s*(?:기간|마감)?\s*[:：]?\s*)?[\d\s.~/년월일():–—D+-]*$/
// "Oct 30 - Dec 04, 2026" 처럼 영문 기간만 적힌 조각
const TIMELEFT = /\b(?:hours?|days?|minutes?)\s+left\b/i
const DATE_ONLY = /^(?:[A-Z][a-z]{2,8}\.?\s*\d{1,2}(?:,\s*\d{4})?\s*(?:[-–~]|부터)\s*)+[A-Z][a-z]{2,8}\.?\s*\d{1,2}(?:,\s*\d{4})?$/
// 기간 표기에서 숫자만 남기는 정규화 (요일·한글 단위 제거)
const PERIOD_WORDS = /(?:\(\s*(?:월|화|수|목|금|토|일)\s*\)|년|월|일|기간|마감|접수|지원|신청|제출|모집|응모|공고|오전|오후)/g

// 문장부호 없이도 원문 인용으로 읽히는 문장 끝
const SENTENCE_END = /(?:다|요|음|함|임|까|죠|니다)[.!?]?\s*$/

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
// 인용 조각의 앞뒤 인용부호는 떼되, 원문 문자열 자체에는 쓰지 않는다 (닫는 인용부호가 사라진다)
const tidy = (s) => (s || '')
  .replace(/\s+/g, ' ')
  .replace(/^[\s"'‘’“”「」]+|[\s"'‘’“”「」]+$/g, '')
  .trim()

// 긴 문장에서 인용부호로 묶인 조각만 뽑는다. 영어 소유격(People's)은 열림/닫힘 경계로 걸러진다.
function quotedSegments(text) {
  const out = []
  const take = (re) => {
    let m
    while ((m = re.exec(text)) !== null) out.push({ at: m.index, text: m[1] })
  }
  take(/"([^"]{2,400})"/g)
  take(/[‘“]([^’”]{2,400})[’”]/g)
  take(/「([^」]{2,400})」/g)
  take(/(?:^|[\s+(—–])'([^']{2,400})'(?=[\s+.,:;()\[\]|—–]|[가-힣]|$)/g)
  return out.sort((a, b) => a.at - b.at).map((x) => x.text)
}

// 인용부호로 묶인 부분을 구분자째 지운다 — 메모에는 수집가가 쓴 말만 남긴다
function stripQuoted(text) {
  return text
    .replace(/"[^"]{2,400}"/g, ' ')
    .replace(/[‘“][^’”]{2,400}[’”]/g, ' ')
    .replace(/「[^」]{2,400}」/g, ' ')
    .replace(/[‘'][^'’]{2,400}['’](?=[\s+.,:;()\[\]|—–]|[가-힣]|$)/g, ' ')
    .replace(/\s+/g, ' ')
}

// 앞머리 출처 라벨을 떼어 낸다 — 남은 문자열이 인용·메모의 몸통
function splitLabel(raw) {
  const m = raw.match(/^([^:：]{2,60}?)\s*[:：]\s*/)
  if (!m) return { label: '', body: raw }
  const head = m[1]
  const looksLikeSource = SOURCE_WORD.test(head) && (head.length <= 46 || /\(\s*\d{4}/.test(head))
  if (!looksLikeSource) return { label: '', body: raw }
  return { label: head, body: raw.slice(m[0].length) }
}

// 표에 실을 만한 '진짜 인용'인가 — 출처 라벨·날짜뿐·운영 문구만 남은 조각은 메모로 보낸다
function isQuote(text) {
  const t = tidy(text)
  if (!t || PLACEHOLDER.test(t)) return false
  if (t.length < 4) return false
  if (SOURCE_WORD.test(t) && /\(\s*\d{4}/.test(t) && !/[.!?]/.test(t)) return false
  if (PERIOD_ONLY.test(t) || DATE_ONLY.test(t)) return false
  if (PERIOD_ONLY.test(t.replace(PERIOD_WORDS, ' '))) return false
  if (OPS_END.test(t) || TIMELEFT.test(t)) return false
  if (OPS_WORD.test(t) && !SENTENCE_END.test(t)) return false
  return true
}

// 인용 후보 중 표 한 줄에 쓸 대표 문장 하나 — 한국어가 있고, 기간만 적힌 조각은 뒤로 보낸다
function bestOf(segments) {
  let best = ''
  let bestScore = -1
  for (const s of segments) {
    const t = tidy(s)
    if (!isQuote(t)) continue
    let score = /[가-힣]/.test(t) ? 3 : 0
    if (PERIOD_ONLY.test(t.replace(/^(?:접수|지원|신청|제출|모집|응모)[^:：]*[:：]\s*/, ''))
      || DATE_ONLY.test(t) || PERIOD_ONLY.test(t.replace(PERIOD_WORDS, ' '))) score -= 3
    score += t.length >= 20 ? 2 : t.length >= 10 ? 1 : 0
    if (SENTENCE_END.test(t)) score += 1
    if (score > bestScore || (score === bestScore && t.length > best.length)) {
      best = t
      bestScore = score
    }
  }
  return best
}

/**
 * 수집기가 남긴 evidence 문자열 하나를 화면용으로 쪼갠다.
 * @returns {{ quotes: string[], memo: string }} quotes=원문 인용(패널 blockquote), memo=출처·운영 메모(추적 접힘)
 */
export function splitEvidence(raw) {
  const text = norm(raw)
  if (!text) return { quotes: [], memo: '' }
  if (PLACEHOLDER.test(text)) return { quotes: [], memo: '' }

  const { label, body } = splitLabel(text)
  const labelMemo = label ? `${label}:` : ''
  const segments = quotedSegments(body)

  if (segments.length) {
    const quotes = []
    const seen = new Set()
    for (const s of segments) {
      const t = norm(s)
      if (!isQuote(t) || seen.has(t)) continue
      seen.add(t)
      quotes.push(t)
    }
    // 인용부호 밖의 나머지 = 수집가가 덧붙인 설명. 인용부호째 지우고 라벨과 함께 메모로 보낸다.
    const rest = stripQuoted(body)
      .replace(/\s*\+\s*/g, ' ')
      .replace(/[(（]\s*[)）]/g, ' ')
      .replace(/(?:\s*,\s*){2,}/g, ', ')
      .replace(/\s*,\s*(?=[—–]|$)/g, ' ')
      .replace(/^[\s,.;:—–+|]+|[\s,.;:—–+|]+$/g, '')
    // 남은 말이 라벨뿐이면 메모로 남길 것이 없다 (출처는 추적 섹션의 '출처' 필드에 있다)
    const memoBody = rest.replace(/^[\s,.;:—–+|()]+/, '').trim()
    const memo = memoBody ? tidy([labelMemo, rest].filter(Boolean).join(' ')) : ''
    if (quotes.length) return { quotes, memo }
    return { quotes: [], memo: tidy([labelMemo, body].filter(Boolean).join(' ')) }
  }

  // 인용부호 없이 "문장 — 수집가의 판단" 구조인 경우, 대시 뒤는 메모다.
  const dash = body.lastIndexOf(' — ')
  if (dash > 12) {
    const head = tidy(body.slice(0, dash))
    const tail = tidy(body.slice(dash + 3))
    const memo = tidy([labelMemo, tail].filter(Boolean).join(' '))
    if (isQuote(head)) return { quotes: [head], memo }
    return { quotes: [], memo: tidy([labelMemo, body].filter(Boolean).join(' ')) }
  }

  // 인용부호도 대시도 없으면 문장 자체가 근거다. 다만 수집기 운영 문구뿐이면 메모로 보낸다.
  if (isQuote(body)) return { quotes: [body], memo: labelMemo }
  return { quotes: [], memo: tidy([labelMemo, body].filter(Boolean).join(' ')) }
}

/** 여러 evidence 항목을 한 번에 — 표·패널이 쓰는 세 값으로 접는다 */
export function evidenceParts(items) {
  const quotes = []
  const memos = []
  for (const item of items || []) {
    const { quotes: q, memo } = splitEvidence(item)
    for (const s of q) if (!quotes.includes(s)) quotes.push(s)
    if (memo && !memos.includes(memo)) memos.push(memo)
  }
  return { quotes, memos, best: bestOf(quotes) }
}

/** 표 한 줄용 — 대표 인용 하나를 max자로 자른다 (자르면 …) */
export function clipEvidence(text, max = 48) {
  const t = tidy(text)
  if (!t) return ''
  if (t.length <= max) return t
  return t.slice(0, max - 1).replace(/[\s,·|]+$/, '') + '…'
}
