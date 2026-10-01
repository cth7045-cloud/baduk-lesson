import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDateTime } from '../../components/comments/format'
import { Button } from '../../components/ui/Button'
import { listMaterials, type Material } from '../../data/materials'
import { listTags, type Tag } from '../../data/problems'
import { boardsWithNewComments } from '../../data/reads'
import { TagPicker } from '../assignments/common'
import { useAuth } from '../auth/AuthProvider'
import { MaterialDialog } from './MaterialDialog'
import s from './Library.module.css'

const TYPE_LABEL = { sgf: '해설 기보', pdf: 'PDF', image: '이미지' } as const

export function LibraryPage() {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const navigate = useNavigate()
  const [items, setItems] = useState<Material[] | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [filter, setFilter] = useState<string[]>([])
  const [unread, setUnread] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!profile) return
    void (async () => {
      try {
        const [m, t] = await Promise.all([listMaterials(), listTags()])
        setItems(m)
        setTags(t)
        if (!isTeacher) setUnread(await boardsWithNewComments(profile.id, m.map((x) => x.board_id ?? '')))
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [profile, isTeacher])

  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags])
  const usedTags = tags.filter((t) => items?.some((m) => m.tags.some((x) => x.tag_id === t.id)))
  const shown = items?.filter((m) => filter.every((f) => m.tags.some((t) => t.tag_id === f)))

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.title}>자료실</h1>
        {isTeacher && (
          <Button variant="primary" onClick={() => setUploading(true)}>
            자료 올리기
          </Button>
        )}
      </div>
      {usedTags.length > 0 && (
        <div className={s.filter}>
          <TagPicker tags={usedTags} selected={filter} onChange={setFilter} />
        </div>
      )}
      {error && <p className={s.error}>불러오지 못했습니다: {error}</p>}
      {!items && !error && <p className={s.muted}>불러오는 중…</p>}
      {shown?.length === 0 && (
        <p className={s.empty}>{items?.length ? '이 태그의 자료가 없습니다.' : isTeacher ? '아직 자료가 없습니다. "자료 올리기"로 해설 기보나 PDF를 올려 보세요.' : '아직 올라온 자료가 없습니다.'}</p>
      )}
      {shown && shown.length > 0 && (
        <ul className={s.rows}>
          {shown.map((m) => (
            <li key={m.id}>
              <Link to={`/library/${m.id}`} className={s.row}>
                <span className={`${s.type} ${s[m.type]}`}>{TYPE_LABEL[m.type]}</span>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>
                    {m.title}
                    {m.board_id && unread.has(m.board_id) && <span className={s.newBadge}>새 코멘트</span>}
                  </span>
                  {m.description && <span className={s.rowSub}>{m.description}</span>}
                </span>
                <span className={s.rowTags}>
                  {m.tags.map((t) => (
                    <span key={t.tag_id} className={s.tagSmall}>
                      {tagName.get(t.tag_id)}
                    </span>
                  ))}
                  {isTeacher && m.visibility === 'selected' && <span className={s.tagSmall}>학생 {m.targets.length}명만</span>}
                </span>
                <span className={s.date}>{formatDateTime(m.created_at).slice(0, 10)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {uploading && <MaterialDialog material={null} onClose={() => setUploading(false)} onSaved={(id) => navigate(`/library/${id}`)} />}
    </div>
  )
}
