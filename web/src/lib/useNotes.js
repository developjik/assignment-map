// 개인 메모 훅 — 같은 탭의 다른 컴포넌트·다른 탭의 변경까지 같은 화면에서 다시 그린다.
import { useEffect, useState } from 'react'
import { NOTES_EVENT, readNotes } from './notes'

export function useNotes() {
  const [notes, setNotes] = useState(readNotes)
  useEffect(() => {
    const sync = () => setNotes(readNotes())
    window.addEventListener(NOTES_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(NOTES_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return notes
}
