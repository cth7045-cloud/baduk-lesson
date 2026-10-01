import { useEffect, type ReactNode } from 'react'
import s from './ui.module.css'

interface Props {
  title: string
  children?: ReactNode
  actions: ReactNode
  onClose: () => void
}

export function Dialog({ title, children, actions, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div className={s.dialogActions}>{actions}</div>
      </div>
    </div>
  )
}
