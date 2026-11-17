import { useEffect, useRef, useState } from 'react'
import { NOTE_MAX_LENGTH, noteFor, writeNote } from '../lib/notes'

// 개인 메모 입력 — 공고/이벤트 하나에 내 메모를 붙인다. 이 브라우저(localStorage)에만 저장한다.
// 입력을 멈추면 0.4초 뒤 저장하고(자동 저장), 포커스를 잃거나 패널이 닫힐 때 남은 것을 마저 쓴다.
// 저장 시각은 '내가 쓴 것이 남았다'는 신호로만 쓴다 — 시간을 재촉하는 UI 는 두지 않는다.
const DEBOUNCE_MS = 400
const hhmm = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function NoteField({ id, name, label = '개인 메모' }) {
  const [text, setText] = useState(() => noteFor(id))
  const [savedAt, setSavedAt] = useState('')
  const [failed, setFailed] = useState(false)
  const latest = useRef(text)
  const timer = useRef(null)
  const domId = 'note-' + String(id || 'row').replace(/[^a-zA-Z0-9_-]/g, '-')

  const flush = (value) => {
    clearTimeout(timer.current)
    timer.current = null
    const res = writeNote(id, value)
    setFailed(!res.saved)
    if (res.saved && res.stored) setSavedAt(hhmm())
    else if (res.saved) setSavedAt('')
  }

  // 다른 행으로 옮기면 그 행의 메모로 갈아 끼운다. 옮기기 전에 남은 입력은 위 cleanup 이 먼저 쓴다.
  useEffect(() => {
    setText(noteFor(id))
    latest.current = noteFor(id)
    setSavedAt('')
    setFailed(false)
  }, [id])

  // 패널이 닫히거나 화면이 바뀌어도 입력 중이던 메모를 잃지 않는다
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (latest.current !== noteFor(id)) writeNote(id, latest.current)
  }, [id])

  const onChange = (e) => {
    const value = e.target.value.slice(0, NOTE_MAX_LENGTH)
    setText(value)
    latest.current = value
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flush(latest.current), DEBOUNCE_MS)
  }

  const onClear = () => {
    setText('')
    latest.current = ''
    flush('')
  }

  const state = failed ? '저장 실패 | 이 브라우저가 저장을 막았다' : savedAt ? `저장됨 ${savedAt}` : text ? '자동 저장' : '이 브라우저에만 저장'

  return (
    <div className="note">
      <div className="note-hd">
        {label ? <label className="note-k" htmlFor={domId}>{label}</label> : null}
        <span className={'note-st' + (failed ? ' bad' : savedAt ? ' on' : '')} aria-live="polite">{state}</span>
      </div>
      <textarea
        id={domId}
        className="note-t"
        value={text}
        rows={3}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="면접 시간, 준비물, 제출 링크처럼 이 기회에만 필요한 것을 적는다"
        aria-label={name ? `${name} 개인 메모` : '개인 메모'}
        onChange={onChange}
        onBlur={() => flush(latest.current)}
        spellCheck={false}
      />
      <div className="note-ft">
        <span className="note-c">{text.length} / {NOTE_MAX_LENGTH}</span>
        {text && <button type="button" className="note-x" onClick={onClear} title="이 공고의 메모를 지운다">메모 지우기</button>}
      </div>
    </div>
  )
}
