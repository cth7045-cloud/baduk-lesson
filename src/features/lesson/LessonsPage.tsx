import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDateTime } from '../../components/comments/format'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { BOARD_SIZES } from '../../go/types'
import { createLesson, listLessons, type LessonWithPeople } from '../../data/lessons'
import { useAuth } from '../auth/AuthProvider'
import type { Profile } from '../auth/types'
import { listStudents } from '../students/api'
import s from './Lesson.module.css'

/** 수업 목록: 진행 중인 수업 + 날짜별 수업 기록 */
export function LessonsPage() {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const [lessons, setLessons] = useState<LessonWithPeople[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    listLessons()
      .then(setLessons)
      .catch((e: Error) => setError(e.message))
  }, [])

  const live = lessons?.filter((l) => l.status === 'live') ?? []
  const ended = lessons?.filter((l) => l.status === 'ended') ?? []
  const names = (l: LessonWithPeople) => l.participants.map((p) => p.profiles?.display_name ?? '학생').join(', ')

  return (
    <div className={s.listPage}>
      <div className={s.listHead}>
        <h1 className={s.listTitle}>{isTeacher ? '수업' : '내 수업'}</h1>
        {isTeacher && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            새 수업 열기
          </Button>
        )}
      </div>
      {error && <p className={s.error}>목록을 불러오지 못했습니다: {error}</p>}
      {!lessons && !error && <p className={s.muted}>불러오는 중…</p>}

      {lessons && (
        <>
          <h2 className={s.sectionTitle}>진행 중인 수업</h2>
          {live.length === 0 ? (
            <p className={s.empty}>
              {isTeacher ? '진행 중인 수업이 없습니다. "새 수업 열기"를 눌러 시작하세요.' : '지금 열린 수업이 없습니다. 선생님이 수업을 열면 여기에 나타납니다.'}
            </p>
          ) : (
            <ul className={s.rows}>
              {live.map((l) => (
                <li key={l.id}>
                  <Link to={`/lessons/${l.id}`} className={`${s.row} ${s.liveRow}`}>
                    <span className={s.rowDate}>{formatDateTime(l.started_at).slice(5)}</span>
                    <span className={s.rowTitle}>
                      {l.title}
                      {isTeacher && <span className={s.rowPeople}>{names(l) || '참여 학생 없음'}</span>}
                    </span>
                    <span className={s.enter}>입장 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className={s.sectionTitle}>수업 기록</h2>
          {ended.length === 0 ? (
            <p className={s.empty}>아직 끝난 수업이 없습니다.</p>
          ) : (
            <ul className={s.rows}>
              {ended.map((l) => (
                <li key={l.id}>
                  <Link to={`/lessons/${l.id}`} className={s.row}>
                    <span className={s.rowDate}>{formatDateTime(l.started_at).slice(0, 10)}</span>
                    <span className={s.rowTitle}>
                      {l.title}
                      {isTeacher && <span className={s.rowPeople}>{names(l)}</span>}
                    </span>
                    <span className={s.muted}>{isTeacher ? '보기·코멘트' : '복습'} →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {creating && <CreateLessonDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

function CreateLessonDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const today = formatDateTime(new Date().toISOString()).slice(0, 10)
  const [title, setTitle] = useState(`${today} 수업`)
  const [size, setSize] = useState<number>(19)
  const [students, setStudents] = useState<Profile[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listStudents()
      .then((list) => {
        const active = list.filter((st) => st.is_active)
        setStudents(active)
        setPicked(new Set(active.map((st) => st.id)))
      })
      .catch(() => setStudents([]))
  }, [])

  async function create() {
    if (!title.trim()) return setError('수업 이름을 입력해 주세요.')
    setBusy(true)
    setError(null)
    try {
      const id = await createLesson(title.trim(), size, [...picked])
      navigate(`/lessons/${id}`)
    } catch (e) {
      setError(`수업을 열지 못했습니다: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="새 수업 열기"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={busy}>
            {busy ? '여는 중…' : '수업 열기'}
          </Button>
        </>
      }
    >
      <div className={s.form}>
        <label className={s.field}>
          수업 이름
          <input className={s.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <div className={s.field}>
          판 크기
          <div className={s.sizes}>
            {BOARD_SIZES.map((n) => (
              <button key={n} type="button" className={size === n ? s.on : ''} onClick={() => setSize(n)}>
                {n}줄
              </button>
            ))}
          </div>
        </div>
        <div className={s.field}>
          참여 학생
          {!students && <span className={s.muted}>불러오는 중…</span>}
          {students?.length === 0 && <span className={s.muted}>학생이 없습니다. 학생 관리에서 먼저 추가해 주세요.</span>}
          <div className={s.checks}>
            {students?.map((st) => (
              <label key={st.id} className={s.check}>
                <input
                  type="checkbox"
                  checked={picked.has(st.id)}
                  onChange={(e) => {
                    const next = new Set(picked)
                    if (e.target.checked) next.add(st.id)
                    else next.delete(st.id)
                    setPicked(next)
                  }}
                />
                {st.display_name}
              </label>
            ))}
          </div>
        </div>
        {error && <p className={s.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
