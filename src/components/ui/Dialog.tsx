import { useEffect, type ReactNode } from 'react'
import s from './ui.module.css'

interface Props {
  title: string
  children?: ReactNode
  actions: ReactNode
  onClose: () => void
  /** 넓은 대화상자 (내용이 많을 때) */
  wide?: boolean
  /** 아주 넓은 대화상자 (그림 두 개를 나란히) */
  xl?: boolean
}

export function Dialog({ title, children, actions, onClose, wide, xl }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${s.dialog} ${wide ? s.wide : ''} ${xl ? s.xl : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div className={s.dialogActions}>{actions}</div>
      </div>
    </div>
  )
}
