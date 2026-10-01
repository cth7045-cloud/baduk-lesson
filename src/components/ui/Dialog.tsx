import { useEffect, type ReactNode } from 'react'
import s from './ui.module.css'

interface Props {
  title: string
  children?: ReactNode
  actions: ReactNode
  onClose: () => void
  /** 넓은 대화상자 (내용이 많을 때) */
  wide?: boolean
}

export function Dialog({ title, children, actions, onClose, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${s.dialog} ${wide ? s.wide : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div className={s.dialogActions}>{actions}</div>
      </div>
    </div>
  )
}
