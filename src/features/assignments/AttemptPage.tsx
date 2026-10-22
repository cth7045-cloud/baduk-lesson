import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CommentMap } from '../../components/comments/types'
import { formatDateTime } from '../../components/comments/format'
import { useToast } from '../../components/ui/Toast'
import { BoardWorkspace } from '../../components/workspace/BoardWorkspace'
import type { GameTree } from '../../go/tree/gameTree'
import { getAttempt, getSet, type Attempt, type SetDetail } from '../../data/assignments'
import { loadBoard } from '../../data/boards'
import { listComments } from '../../data/comments'
import { markBoardRead } from '../../data/reads'
import { useAuth } from '../auth/AuthProvider'
import { saveStateLabel, useBoardDocument } from '../boards/useBoardDocument'
import s from './Assignments.module.css'

interface Loaded {
  attempt: Attempt
  set: SetDetail
  tree: GameTree
  comments: CommentMap
}

/**
 * 학생 풀이 기록 (모든 시도가 변화도로 쌓여 있음. 오답 수 = 빨간 점선, 정답 = 초록).
 * 선생님: 수마다 피드백 코멘트, 판 전체 총평. 학생: 읽기.
 */
export function AttemptPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void (async () => {
      try {
        const attempt = await getAttempt(id)
        if (!attempt.board_id) throw new Error('아직 풀이 기록이 없습니다.')
        const [set, { tree }, comments] = await Promise.all([getSet(attempt.set_id), loadBoard(attempt.board_id), listComments(attempt.board_id)])
        setData({ attempt, set, tree, comments })
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [id])

  // 학생이 열어 보면 "새 피드백" 표시를 끔
  useEffect(() => {
    if (data && profile && profile.role === 'student' && data.attempt.board_id) void markBoardRead(profile.id, data.attempt.board_id)
  }, [data, profile])

  if (error) return <p className={s.message}>풀이 기록을 열 수 없습니다: {error}</p>
  if (!data || !profile) return <p className={s.message}>불러오는 중…</p>
  return <AttemptView data={data} isTeacher={profile.role === 'teacher'} />
}

function AttemptView({ data, isTeacher }: { data: Loaded; isTeacher: boolean }) {
  const toast = useToast()
  const { attempt, set } = data
  const { editor, comments, commentActions, saveState } = useBoardDocument({
    boardId: attempt.board_id!,
    initialTree: data.tree,
    initialComments: data.comments,
    autosave: isTeacher,
    onError: (m) => toast.show(m),
  })
  const entry = set.problems.find((p) => p.problem_id === attempt.problem_id)
  const student = set.targets.find((t) => t.student_id === attempt.student_id)?.profiles?.display_name ?? '학생'

  const header = (
    <div className={s.editorHead}>
      <Link to={`/assignments/${set.id}`} className={s.back}>
        ← {set.title}
      </Link>
      <h1 className={s.title}>{entry?.problems?.title ?? '문제'} — 풀이 기록</h1>
      <p className={s.rowSub}>
        {isTeacher ? `${student} · ` : ''}
        {attempt.solved ? `정답 (${attempt.tries}번째 시도${attempt.solved_at ? `, ${formatDateTime(attempt.solved_at)}` : ''})` : `아직 못 맞힘 (${attempt.tries}번 시도)`}
      </p>
      <p className={s.guideText}>
        {isTeacher
          ? '학생이 둔 모든 시도가 변화도로 쌓여 있습니다 (빨간 점선 = 틀린 수, 초록 = 정답). 수를 골라 피드백을 쓰고, 아래 "총평"에 전체 피드백을 남기세요. 학생 화면에 "새 피드백"으로 표시됩니다.'
          : '선생님이 남긴 피드백입니다. 수순을 넘기며 코멘트를 확인하세요.'}
      </p>
      {isTeacher && entry && (
        <Link to={`/problems/${entry.problem_id}`} className={s.back}>
          문제 원본 보기 →
        </Link>
      )}
    </div>
  )

  return (
    <div>
      <BoardWorkspace
        header={header}
        editor={editor}
        comments={comments}
        commentActions={commentActions}
        canEditComments={isTeacher}
        canEditBoard={isTeacher}
        memoLabel="총평"
        aside={isTeacher && <span className={s.muted}>{saveStateLabel(saveState)}</span>}
      />
      {toast.node}
    </div>
  )
}
