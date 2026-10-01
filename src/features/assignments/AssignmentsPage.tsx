import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { BOARD_SIZES } from '../../go/types'
import { listAllAttempts, listSets, type Attempt, type SetDetail } from '../../data/assignments'
import { createProblem, createTag, listProblems, listTags, type ProblemRow, type Tag } from '../../data/problems'
import { useAuth } from '../auth/AuthProvider'
import { SetDialog } from './SetDialog'
import { dueLabel, TagPicker, toPlayLabel } from './common'
import s from './Assignments.module.css'

/** 과제: 선생님 = 과제 묶음 + 문제 은행, 학생 = 받은 과제 */
export function AssignmentsPage() {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'problems' ? 'problems' : 'sets'
  const [sets, setSets] = useState<SetDetail[] | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [setDialog, setSetDialog] = useState(false)

  const reload = () =>
    Promise.all([listSets(), listAllAttempts()])
      .then(([ss, aa]) => {
        setSets(ss)
        setAttempts(aa)
      })
      .catch((e: Error) => setError(e.message))

  useEffect(() => {
    void reload()
  }, [])

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.title}>{isTeacher ? '과제' : '내 과제'}</h1>
        {isTeacher && tab === 'sets' && (
          <Button variant="primary" onClick={() => setSetDialog(true)}>
            과제 묶음 만들기
          </Button>
        )}
      </div>

      {isTeacher && (
        <div className={s.tabs} role="tablist">
          <button role="tab" aria-selected={tab === 'sets'} className={tab === 'sets' ? s.tabOn : ''} onClick={() => setParams({})}>
            과제 묶음
          </button>
          <button
            role="tab"
            aria-selected={tab === 'problems'}
            className={tab === 'problems' ? s.tabOn : ''}
            onClick={() => setParams({ tab: 'problems' })}
          >
            문제 은행
          </button>
        </div>
      )}

      {error && <p className={s.error}>불러오지 못했습니다: {error}</p>}

      {tab === 'sets' && (
        <SetList sets={sets} attempts={attempts} isTeacher={isTeacher} myId={profile?.id ?? ''} />
      )}
      {isTeacher && tab === 'problems' && <ProblemBank />}

      {setDialog && (
        <SetDialog
          set={null}
          onClose={() => setSetDialog(false)}
          onSaved={() => {
            setSetDialog(false)
            void reload()
          }}
        />
      )}
    </div>
  )
}

function SetList({ sets, attempts, isTeacher, myId }: { sets: SetDetail[] | null; attempts: Attempt[]; isTeacher: boolean; myId: string }) {
  if (!sets) return <p className={s.muted}>불러오는 중…</p>
  if (!sets.length)
    return (
      <p className={s.empty}>
        {isTeacher
          ? '아직 과제 묶음이 없습니다. 먼저 "문제 은행"에서 문제를 만든 뒤, "과제 묶음 만들기"로 학생에게 배정하세요.'
          : '받은 과제가 없습니다.'}
      </p>
    )
  return (
    <ul className={s.rows}>
      {sets.map((set) => {
        const due = dueLabel(set.due_at)
        const problemIds = new Set(set.problems.map((p) => p.problem_id))
        const mine = attempts.filter((a) => a.set_id === set.id && problemIds.has(a.problem_id))
        const total = set.problems.length * (isTeacher ? set.targets.length : 1)
        const solved = mine.filter((a) => a.solved && (isTeacher || a.student_id === myId)).length
        return (
          <li key={set.id}>
            <Link to={`/assignments/${set.id}`} className={s.row}>
              <span className={s.rowMain}>
                <span className={s.rowTitle}>{set.title}</span>
                <span className={s.rowSub}>
                  문제 {set.problems.length}개
                  {isTeacher && ` · 학생 ${set.targets.length}명`}
                </span>
              </span>
              <span className={`${s.due} ${due.overdue ? s.overdue : ''}`}>{due.text}</span>
              <span className={s.progress}>
                <span className={s.bar}>
                  <span style={{ width: total ? `${(solved / total) * 100}%` : 0 }} />
                </span>
                <span className={s.progressText}>
                  {isTeacher ? `정답 ${solved}/${total}` : `${solved}/${total} 해결`}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function ProblemBank() {
  const [problems, setProblems] = useState<ProblemRow[] | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [filter, setFilter] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void Promise.all([listProblems(), listTags()]).then(([p, t]) => {
      setProblems(p)
      setTags(t)
    })
  }, [])

  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags])
  const shown = problems?.filter((p) => filter.every((f) => p.tags.some((t) => t.tag_id === f)))

  return (
    <>
      <div className={s.bankBar}>
        <TagPicker tags={tags} selected={filter} onChange={setFilter} />
        <Button variant="primary" onClick={() => setCreating(true)}>
          문제 만들기
        </Button>
      </div>
      {!problems && <p className={s.muted}>불러오는 중…</p>}
      {shown?.length === 0 && (
        <p className={s.empty}>{problems?.length ? '이 태그의 문제가 없습니다.' : '아직 문제가 없습니다. "문제 만들기"로 첫 문제를 만들어 보세요.'}</p>
      )}
      {shown && shown.length > 0 && (
        <ul className={s.rows}>
          {shown.map((p) => (
            <li key={p.id}>
              <Link to={`/problems/${p.id}`} className={s.row}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{p.title || '(제목 없음)'}</span>
                  <span className={s.rowSub}>
                    {toPlayLabel(p.to_play)}
                    {p.difficulty ? ` · 난이도 ${p.difficulty}` : ''}
                  </span>
                </span>
                <span className={s.rowTags}>
                  {p.tags.map((t) => (
                    <span key={t.tag_id} className={s.tagSmall}>
                      {tagName.get(t.tag_id)}
                    </span>
                  ))}
                </span>
                <span className={s.muted}>편집 →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <NewProblemDialog
          tags={tags}
          onTagsChange={setTags}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  )
}

function NewProblemDialog({ tags, onTagsChange, onClose }: { tags: Tag[]; onTagsChange: (t: Tag[]) => void; onClose: () => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [size, setSize] = useState<number>(19)
  const [toPlay, setToPlay] = useState<'B' | 'W'>('B')
  const [picked, setPicked] = useState<string[]>(() => tags.filter((t) => t.name === '사활').map((t) => t.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addTag() {
    const name = window.prompt('새 태그 이름 (예: 맥, 수상전)')?.trim()
    if (!name) return
    try {
      const t = await createTag(name)
      onTagsChange([...tags, t])
      setPicked([...picked, t.id])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function create() {
    if (!title.trim()) return setError('문제 이름을 입력해 주세요. (예: 귀의 사활 1)')
    setBusy(true)
    try {
      const id = await createProblem(title.trim(), size, toPlay, picked)
      navigate(`/problems/${id}`)
    } catch (e) {
      setError(`문제를 만들지 못했습니다: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="문제 만들기"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={busy}>
            만들고 편집하기
          </Button>
        </>
      }
    >
      <div className={s.form}>
        <label className={s.field}>
          문제 이름
          <input className={s.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus placeholder="예: 귀의 사활 1" />
        </label>
        <div className={s.field}>
          판 크기
          <div className={s.segment}>
            {BOARD_SIZES.map((n) => (
              <button key={n} type="button" className={size === n ? s.on : ''} onClick={() => setSize(n)}>
                {n}줄
              </button>
            ))}
          </div>
        </div>
        <div className={s.field}>
          둘 차례 (학생)
          <div className={s.segment}>
            <button type="button" className={toPlay === 'B' ? s.on : ''} onClick={() => setToPlay('B')}>
              흑선
            </button>
            <button type="button" className={toPlay === 'W' ? s.on : ''} onClick={() => setToPlay('W')}>
              백선
            </button>
          </div>
        </div>
        <div className={s.field}>
          주제 태그
          <TagPicker tags={tags} selected={picked} onChange={setPicked} onAdd={() => void addTag()} />
        </div>
        {error && <p className={s.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
