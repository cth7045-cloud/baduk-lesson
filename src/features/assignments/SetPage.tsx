import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { getSet, listAttempts, type Attempt, type SetDetail } from '../../data/assignments'
import { boardsWithNewComments, commentCounts } from '../../data/reads'
import { useAuth } from '../auth/AuthProvider'
import { SetDialog } from './SetDialog'
import { dueLabel, toPlayLabel } from './common'
import s from './Assignments.module.css'

/** 과제 묶음: 선생님 = 학생별 현황표, 학생 = 문제 목록 */
export function SetPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const [set, setSet] = useState<SetDetail | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [newFeedback, setNewFeedback] = useState<Set<string>>(new Set())
  const [feedbackCount, setFeedbackCount] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const reload = useCallback(async () => {
    if (!id || !profile) return
    try {
      const [st, at] = await Promise.all([getSet(id), listAttempts(id)])
      setSet(st)
      setAttempts(at)
      const boardIds = at.map((a) => a.board_id).filter((b): b is string => !!b)
      setFeedbackCount(await commentCounts(boardIds))
      if (!isTeacher) setNewFeedback(await boardsWithNewComments(profile.id, boardIds))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id, profile, isTeacher])

  useEffect(() => {
    void reload()
  }, [reload])

  if (error) return <p className={s.message}>과제를 불러오지 못했습니다: {error}</p>
  if (!set) return <p className={s.message}>불러오는 중…</p>

  const due = dueLabel(set.due_at)
  const find = (studentId: string, problemId: string) => attempts.find((a) => a.student_id === studentId && a.problem_id === problemId)

  return (
    <div className={s.page}>
      <Link to="/assignments" className={s.back}>
        ← 과제 목록
      </Link>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>{set.title}</h1>
          <p className={`${s.due} ${due.overdue ? s.overdue : ''}`}>{due.text}</p>
        </div>
        {isTeacher && <Button onClick={() => setEditing(true)}>고치기·배정 바꾸기</Button>}
      </div>
      {set.description && <p className={s.desc}>{set.description}</p>}

      {isTeacher ? (
        <TeacherMatrix set={set} find={find} feedbackCount={feedbackCount} />
      ) : (
        <ul className={s.rows}>
          {set.problems.map((p, i) => {
            const a = find(profile!.id, p.problem_id)
            const fb = a?.board_id ? feedbackCount.get(a.board_id) ?? 0 : 0
            const isNew = !!a?.board_id && newFeedback.has(a.board_id)
            return (
              <li key={p.problem_id} className={s.solveRow}>
                <span className={s.pickNo}>{i + 1}</span>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{p.problems?.title ?? '문제'}</span>
                  <span className={s.rowSub}>{p.problems ? toPlayLabel(p.problems.to_play) : ''}</span>
                </span>
                <span className={s.state}>
                  {a?.solved ? (
                    <span className={s.ok}>✓ 정답{a.tries > 1 ? ` (${a.tries}번째)` : ''}</span>
                  ) : a ? (
                    <span className={s.ng}>{a.tries}번 시도</span>
                  ) : (
                    <span className={s.muted}>아직 안 풂</span>
                  )}
                </span>
                <span className={s.solveActions}>
                  {a && fb > 0 && (
                    <Link to={`/attempts/${a.id}`} className={`${s.feedback} ${isNew ? s.feedbackNew : ''}`}>
                      {isNew ? '새 피드백' : '피드백 보기'}
                    </Link>
                  )}
                  <Link to={`/assignments/${set.id}/solve/${p.problem_id}`} className={s.solveBtn}>
                    {a?.solved ? '다시 풀기' : '풀기'}
                  </Link>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <SetDialog
          set={set}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            void reload()
          }}
        />
      )}
    </div>
  )
}

function TeacherMatrix({
  set,
  find,
  feedbackCount,
}: {
  set: SetDetail
  find: (studentId: string, problemId: string) => Attempt | undefined
  feedbackCount: Map<string, number>
}) {
  if (!set.targets.length) return <p className={s.empty}>배정된 학생이 없습니다. "고치기·배정 바꾸기"에서 학생을 고르세요.</p>
  return (
    <div className={s.matrixWrap}>
      <table className={s.matrix}>
        <thead>
          <tr>
            <th>학생</th>
            {set.problems.map((p, i) => (
              <th key={p.problem_id} title={p.problems?.title}>
                <Link to={`/problems/${p.problem_id}`}>{i + 1}</Link>
              </th>
            ))}
            <th>제출</th>
            <th>정답률</th>
            <th>첫 시도 정답</th>
          </tr>
        </thead>
        <tbody>
          {set.targets.map((t) => {
            const row = set.problems.map((p) => find(t.student_id, p.problem_id))
            const tried = row.filter(Boolean).length
            const solved = row.filter((a) => a?.solved).length
            const first = row.filter((a) => a?.first_try_correct).length
            const n = set.problems.length || 1
            return (
              <tr key={t.student_id}>
                <th scope="row">{t.profiles?.display_name ?? '학생'}</th>
                {row.map((a, i) => (
                  <td key={set.problems[i].problem_id}>
                    {a ? (
                      <Link to={`/attempts/${a.id}`} className={a.solved ? s.cellOk : s.cellNg} title="풀이 기록 보기·피드백 쓰기">
                        {a.solved ? '✓' : '✕'}
                        <small>{a.tries}회</small>
                        {a.board_id && (feedbackCount.get(a.board_id) ?? 0) > 0 && <i className={s.fbDot} aria-label="피드백 있음" />}
                      </Link>
                    ) : (
                      <span className={s.cellNone}>–</span>
                    )}
                  </td>
                ))}
                <td>
                  {tried}/{set.problems.length}
                </td>
                <td className={s.num}>{Math.round((solved / n) * 100)}%</td>
                <td className={s.num}>{Math.round((first / n) * 100)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className={s.legend}>✓ 정답 · ✕ 아직 못 맞힘 · – 안 풂 · 칸을 누르면 학생의 풀이 기록을 보고 피드백 코멘트를 쓸 수 있습니다.</p>
    </div>
  )
}
