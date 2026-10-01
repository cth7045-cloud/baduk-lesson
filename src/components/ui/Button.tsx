import type { ButtonHTMLAttributes } from 'react'
import s from './ui.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost'
  size?: 'normal' | 'small'
  danger?: boolean
}

export function Button({ variant = 'default', size = 'normal', danger, className, type = 'button', ...rest }: Props) {
  const cls = [
    s.button,
    variant === 'primary' && s.primary,
    variant === 'ghost' && s.ghost,
    size === 'small' && s.small,
    danger && s.danger,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return <button type={type} className={cls} {...rest} />
}
