import { formatDateTime } from '../../components/comments/format'
import type { Tag } from '../../data/problems'
import s from './Assignments.module.css'

export function dueLabel(due: string | null): { text: string; overdue: boolean } {
  if (!due) return { text: '마감 없음', overdue: false }
  const overdue = new Date(due).getTime() < Date.now()
  return { text: `${formatDateTime(due)} 마감${overdue ? ' (지남)' : ''}`, overdue }
}

export function toPlayLabel(c: 'B' | 'W') {
  return c === 'B' ? '흑선' : '백선'
}

/** 태그 고르기 (여러 개) */
export function TagPicker({
  tags,
  selected,
  onChange,
  onAdd,
}: {
  tags: Tag[]
  selected: string[]
  onChange: (ids: string[]) => void
  onAdd?: () => void
}) {
  return (
    <div className={s.tags}>
      {tags.map((t) => {
        const on = selected.includes(t.id)
        return (
          <button
            key={t.id}
            type="button"
            className={`${s.tag} ${on ? s.tagOn : ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
          >
            {t.name}
          </button>
        )
      })}
      {onAdd && (
        <button type="button" className={`${s.tag} ${s.tagAdd}`} onClick={onAdd}>
          + 태그 추가
        </button>
      )}
    </div>
  )
}
