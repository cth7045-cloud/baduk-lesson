import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CommentMap } from '../../components/comments/types'
import { useToast } from '../../components/ui/Toast'
import type { GameTree } from '../../go/tree/gameTree'
import { getSet, listAttempts, recordAttempt, type Attempt, type SetDetail } from '../../data/assignments'
import { loadBoard } from '../../data/boards'
import { listComments } from '../../data/comments'
import { useAuth } from '../auth/AuthProvider'
import { ProblemSolver, type TryResult } from './ProblemSolver'
import s from './Assignments.module.css'

interface Loaded {
  set: SetDetail
  problemId: string
  title: string
  problemTree: GameTree
  comments: CommentMap
  attempt: Attempt | null
  attemptTree: GameTree | null
}

/** 학생: 과제 문제 풀기 (자동 채점 + 풀이 기록 저장) */
export function SolvePage() {
  const { setId, problemId } = useParams<{ setId: string; problemId: string }>()
  const { profile } = useAuth()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!setId || !problemId || !profile) return
    setData(null)
    void (async () => {
      try {
        const set = await getSet(setId)
        const entry = set.problems.find((p) => p.problem_id === problemId)
        if (!entry?.problems) throw new Error('이 과제에 없는 문제입니다.')
        const [{ tree }, comments, attempts] = await Promise.all([
          loadBoard(entry.problems.board_id),
          listComments(entry.problems.board_id),
          listAttempts(setId),
        ])
        const attempt = attempts.find((a) => a.problem_id === problemId && a.student_id === profile.id) ?? null
        let attemptTree: GameTree | null = null
        if (attempt?.board_id) attemptTree = (await loadBoard(attempt.board_id)).tree
        setData({ set, problemId, title: entry.problems.title, problemTree: tree, comments, attempt, attemptTree })
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [setId, problemId, profile])

  if (error) return <p className={s.message}>문제를 열 수 없습니다: {error}</p>
  if (!data || !profile) return <p className={s.message}>문제를 불러오는 중…</p>
  return <Solve key={problemId} data={data} studentId={profile.id} isTeacher={profile.role === 'teacher'} />
}

function Solve({ data, studentId, isTeacher }: { data: Loaded; studentId: string; isTeacher: boolean }) {
  const toast = useToast()
  const attemptRef = useRef<Attempt | null>(data.attempt)
  const [solvedNow, setSolvedNow] = useState(false)
  const alreadySolved = !!data.attempt?.solved
  const order = data.set.problems.map((p) => p.problem_id)
  const current = order.indexOf(data.problemId)
  const next = order[current + 1]

  // 저장은 순서대로 하나씩 (빠르게 여러 번 틀려도 기록이 꼬이지 않게)
  const queue = useRef(Promise.resolve())
  const onTryEnd = useCallback(
    (result: TryResult, tree: GameTree) => {
      if (isTeacher) return // 선생님이 열어 본 경우 기록하지 않음
      const prev = attemptRef.current
      if (prev?.solved) return // 이미 맞힌 문제는 기록을 바꾸지 않음
      const tries = (prev?.tries ?? 0) + 1
      const solved = result === 'solved'
      if (solved) setSolvedNow(true)
      queue.current = queue.current.then(async () => {
        try {
          attemptRef.current = await recordAttempt(
            attemptRef.current,
            { setId: data.set.id, problemId: data.problemId, studentId, title: `${data.title} 풀이` },
            tree,
            { tries, solved, firstTryCorrect: solved ? tries === 1 : false },
          )
        } catch {
          toast.show('풀이 기록을 저장하지 못했습니다. 인터넷 연결을 확인해 주세요.')
        }
      })
    },
    [isTeacher, data.set.id, data.problemId, data.title, studentId, toast],
  )

  return (
    <div className={s.solvePage}>
      <Link to={`/assignments/${data.set.id}`} className={s.back}>
        ← {data.set.title} ({current + 1}/{order.length})
      </Link>
      <ProblemSolver
        title={data.title}
        problemTree={data.problemTree}
        comments={data.comments}
        initialAttemptTree={data.attemptTree}
        onTryEnd={onTryEnd}
        alreadySolved={alreadySolved}
        footer={
          (solvedNow || alreadySolved) && (
            <>
              {next ? (
                <Link to={`/assignments/${data.set.id}/solve/${next}`} className={s.solveBtn}>
                  다음 문제 →
                </Link>
              ) : (
                <Link to={`/assignments/${data.set.id}`} className={s.solveBtn}>
                  과제 목록으로
                </Link>
              )}
            </>
          )
        }
      />
      {isTeacher && <p className={s.muted}>선생님 계정으로 열었으므로 풀이 기록은 저장되지 않습니다.</p>}
      {toast.node}
    </div>
  )
}
