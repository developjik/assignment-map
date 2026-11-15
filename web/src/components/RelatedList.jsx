import { disp } from '../lib/labels'
import { relatedRows } from '../lib/related'

// 관련 공고 — 지금 연 행과 같은 회사·직무·AI 정책으로 이어지는 모집 중 항목.
// 데스크톱 우측 패널(.dp-sec)과 모바일 아코디언(.rel-in)이 같은 목록을 쓴다.
// 누르면 그 행으로 이동해 선택한다(Opportunities 의 pickAny 가 필터도 함께 풀어 준다).

const ddLabel = (r) => {
  if (!r.open) return '종결'
  if (r.dd === null) return '상시'
  if (r.dd < 0) return '마감'
  return r.dd === 0 ? 'D-DAY' : 'D-' + r.dd
}

const kindLabel = (r) => (r.kind === 'posting' ? '채용 과제' : r.type)

export default function RelatedList({ r, rows, onPick, inline = false }) {
  const items = relatedRows(r, rows)
  if (items.length === 0) return null
  const Wrap = inline ? 'div' : 'section'
  const Head = inline ? 'div' : 'h3'
  return (
    <Wrap className={inline ? 'rel rel-in' : 'dp-sec rel'} aria-label="관련 공고">
      <Head className={inline ? 'rel-h' : undefined}>관련 공고</Head>
      <ul className="rel-list">
        {items.map((it) => (
          <li key={it.id}>
            <button type="button" className="rel-it" onClick={() => onPick && onPick(it)}
              title={`${disp(it.name)} 상세로 이동`}>
              <span className="rel-n">
                {disp(it.name)}
                {it.title && it.title !== it.name && <span className="rel-t">{disp(it.title)}</span>}
              </span>
              <span className="rel-m">
                <span className="rel-k">{kindLabel(it)}</span>
                <span className={'rel-dd' + (it.open && it.dd !== null && it.dd >= 0 && it.dd <= 3 ? ' hot' : '')}>
                  {ddLabel(it)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Wrap>
  )
}
