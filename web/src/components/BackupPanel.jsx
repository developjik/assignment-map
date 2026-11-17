import { useEffect, useRef, useState } from 'react'
import {
  MODES, backupFileName, exportBackup, parseBackup, planRestore,
  readState, summarize, totalCount, writeState,
} from '../lib/backup'

// 내 기록 백업/복원 — 관심·지원 상태·가이드 체크·개인 메모를 JSON 한 파일로 오간다.
// 서버가 없는 앱이라 이 파일이 유일한 이동 수단이다. 복원은 두 모드(합치기/덮어쓰기)로만 하고,
// 덮어쓰기는 한 번 더 확인을 받는다(지금 기록을 지우는 일이라 배치 액션처럼 바로 실행하지 않는다).
const NOTIFY = ['am-star-changed', 'am-status-changed', 'am-guide-check-changed', 'am-notes-changed']

export default function BackupPanel({ onClose }) {
  const [state, setState] = useState(() => readState())
  const [mode, setMode] = useState('merge')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(null) // 해석은 끝났고 실행 확인을 기다리는 백업
  const fileRef = useRef(null)
  const panelRef = useRef(null)
  const counts = summarize(state)
  const total = totalCount(counts)

  useEffect(() => {
    panelRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const refresh = () => setState(readState())

  const onExport = () => {
    setErr(''); setMsg('')
    try {
      const { text, counts: n, fileName } = exportBackup()
      if (totalCount(n) === 0) { setMsg('내보낼 기록이 아직 없다. 관심·지원 상태·가이드 체크·개인 메모를 남긴 뒤 다시 시도한다.'); return }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || backupFileName()
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg(`관심 ${counts.starred} | 지원 상태 ${counts.statuses} | 가이드 체크 ${counts.checks} | 메모 ${counts.notes} — ${fileName} 로 내보냈다`)
    } catch {
      setErr('파일을 만들지 못했다. 브라우저의 다운로드 차단을 확인한다.')
    }
  }

  const onPickFile = () => { setErr(''); setMsg(''); fileRef.current?.click() }

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 고를 수 있게 비운다
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { setErr('파일이 너무 크다 (4MB 초과). 이 사이트가 내보낸 JSON 만 불러온다.'); return }
    let text = ''
    try { text = await file.text() } catch { setErr('파일을 읽지 못했다. 다시 골라 주세요.'); return }
    try {
      const payload = parseBackup(text)
      if (mode === 'replace') { setPending(payload); setMsg(''); setErr(''); return }
      apply(payload)
    } catch (e2) {
      setPending(null)
      setErr(e2 && e2.message ? e2.message : '백업 파일을 해석하지 못했다.')
    }
  }

  const apply = (payload) => {
    const plan = planRestore(readState(), payload.data, mode)
    const { saved } = writeState(plan.next)
    if (!saved) { setErr('저장에 실패했다. 브라우저 저장 공간(사생활 모드·용량)을 확인한다.'); return }
    NOTIFY.forEach((name) => { try { window.dispatchEvent(new Event(name)) } catch { /* 무시 */ } })
    refresh()
    setPending(null)
    const { added, updated, kept } = plan.stats
    const parts = []
    if (mode === 'replace') {
      parts.push(`백업 내용으로 바꿨다 — 관심 ${summarize(plan.next).starred} | 지원 상태 ${summarize(plan.next).statuses} | 가이드 체크 ${summarize(plan.next).checks} | 메모 ${summarize(plan.next).notes}`)
    } else {
      const a = added.starred + added.statuses + added.checks + added.notes
      const u = updated.starred + updated.statuses + updated.checks + updated.notes
      const k = kept.starred + kept.statuses + kept.checks + kept.notes
      parts.push(`${a}건 더했다${u ? ` | ${u}건 갱신` : ''}${k ? ` | ${k}건은 내 기록 유지` : ''}`)
    }
    setErr('')
    setMsg(parts.join(' | ') + ' — 화면에 바로 반영됐다')
  }

  const preview = pending ? summarize(pending.data) : null

  return (
    <div className="bk-back" onClick={onClose} role="presentation">
      <div className="bk" role="dialog" aria-modal="true" aria-labelledby="bk-title" tabIndex={-1}
        ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="bk-hd">
          <span className="bk-title" id="bk-title">내 기록 백업 / 복원</span>
          <button type="button" className="bk-x" onClick={onClose} aria-label="백업 창 닫기">Esc</button>
        </div>

        <div className="bk-b">
          <p className="bk-lede">
            관심·지원 상태·가이드 체크·개인 메모는 서버가 아니라 <b>이 브라우저에만</b> 있다.
            브라우저 데이터를 지우거나 기기를 바꾸기 전에 JSON 한 파일로 내보내 둔다.
          </p>

          <table className="bk-tb">
            <thead>
              <tr><th>항목</th><th className="r">지금</th><th>저장 키</th></tr>
            </thead>
            <tbody>
              <tr><td>관심</td><td className="r">{counts.starred}</td><td className="k">am-starred</td></tr>
              <tr><td>지원 상태</td><td className="r">{counts.statuses}</td><td className="k">am-status</td></tr>
              <tr><td>가이드 체크</td><td className="r">{counts.checks}</td><td className="k">am-guide-checks</td></tr>
              <tr><td>개인 메모</td><td className="r">{counts.notes}</td><td className="k">am-notes</td></tr>
            </tbody>
          </table>

          <div className="bk-act">
            <button type="button" className="icb primary" onClick={onExport} disabled={total === 0}
              title={total === 0 ? '내보낼 기록이 없다' : '지금 기록을 JSON 파일 하나로 내려받는다'}>JSON 내보내기</button>
            <button type="button" className="icb" onClick={onPickFile}
              title="이 사이트가 내보낸 JSON 백업을 골라 불러온다">JSON 불러오기</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="bk-file" onChange={onFile}
              aria-label="백업 JSON 파일 고르기" />
            <span className="bk-file-name">{backupFileName()}</span>
          </div>

          <div className="bk-mode" role="radiogroup" aria-label="불러오기 방식">
            <span className="bk-mode-k">불러올 때</span>
            <div className="bk-opts">
              {MODES.map((m) => (
                <label key={m.id} className={'bk-opt' + (mode === m.id ? ' on' : '')} title={m.hint}>
                  <input type="radio" name="bk-mode" value={m.id} checked={mode === m.id}
                    onChange={() => { setMode(m.id); setPending(null); setMsg(''); setErr('') }} />
                  <span className="bk-opt-l">{m.label}</span>
                  <span className="bk-opt-h">{m.hint}</span>
                </label>
              ))}
            </div>
          </div>

          {pending && (
            <div className="bk-confirm" role="group" aria-label="덮어쓰기 확인">
              <p className="bk-confirm-p">
                {pending.exported_at ? `${pending.exported_at.slice(0, 10)} 에 내보낸 백업` : '고른 백업'} — 관심 {preview.starred} | 지원 상태 {preview.statuses} | 가이드 체크 {preview.checks} | 메모 {preview.notes}.
                지금 기록(관심 {counts.starred} | 상태 {counts.statuses} | 체크 {counts.checks} | 메모 {counts.notes})은 사라진다.
              </p>
              <div className="bk-confirm-a">
                <button type="button" className="icb danger" onClick={() => apply(pending)}>덮어쓰기 실행</button>
                <button type="button" className="icb" onClick={() => setPending(null)}>취소</button>
              </div>
            </div>
          )}

          {msg && <p className="bk-msg" role="status">{msg}</p>}
          {err && <p className="bk-err" role="alert">{err}</p>}

          <p className="bk-note">
            백업 파일에는 내가 쓴 것만 들어간다(수집 데이터·검색 기록 제외). 다른 사람과 나눌 필요는 없다.
          </p>
        </div>
        <div className="bk-ft">합치기는 내 기록을 지우지 않는다 | 덮어쓰기만 한 번 더 확인한다 | Esc 닫기</div>
      </div>
    </div>
  )
}
