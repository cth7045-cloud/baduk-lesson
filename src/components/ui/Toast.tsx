import { useCallback, useEffect, useRef, useState } from 'react'
import s from './ui.module.css'

/** 화면 아래에 잠깐 뜨는 안내 문구 */
export function useToast(duration = 2600) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback(
    (msg: string) => {
      setMessage(msg)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setMessage(null), duration)
    },
    [duration],
  )
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const node = message ? (
    <div className={s.toast} role="status">
      {message}
    </div>
  ) : null
  return { show, node }
}
