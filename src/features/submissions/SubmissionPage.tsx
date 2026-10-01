import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BOARD_MEMO, type CommentMap } from '../../components/comments/types'
import { formatDateTime } from '../../components/comments/format'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { BoardWorkspace } from '../../components/workspace/BoardWorkspace'
import type { GameTree } from '../../go/tree/gameTree'
import { loadBoard } from '../../data/boards'
import { listComments } from '../../data/comments'
import { markBoardRead } from '../../data/reads'
import { getSubmission, listSourceNotes, setSubmissionStatus, type Submission } from '../../data/submissions'
import { downloadSgfWithComments } from '../../lib/sgfFile'
import { useAuth } from '../auth/AuthProvider'
import { saveStateLabel, useBoardDocument } from '../boards/useBoardDocument'
import s from '../library/Library.module.css'

interface Loaded {
  sub: Submission
  tree: GameTree
  comments: CommentMap
  notes: Record<string, string>
}

export function SubmissionPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void (async () => {
      try {
        const sub = await getSubmission(id)
        const [{ tree }, comments, notes] = await Promise.all([loadBoard(sub.board_id), listComments(sub.board_id), listSourceNotes(sub.board_id)])
        setData({ sub, tree, comments, notes })
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [id])

  if (error) return <p className={s.message}>기보를 열 수 없습니다: {error}</p>
  if (!data) return <p className={s.message}>불러오는 중…</p>
  return <SubmissionView key={data.sub.id} data={data} />
}

function SubmissionView({ data }: { data: Loaded }) {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const toast = useToast()
  const [sub, setSub] = useState(data.sub)
  const { editor, comments, commentActions, saveState, flush } = useBoardDocument({
    boardId: sub.board_id,
    initialTree: data.tree,
    initialComments: data.comments,
    autosave: isTeacher,
    onError: (m) => toast.show(m),
  })

  useEffect(() => {
    if (profile && !isTeacher) void markBoardRead(profile.id, sub.board_id)
  }, [profile, isTeacher, sub.board_id])

  async function toggleReviewed() {
    const next = sub.status === 'reviewed' ? 'submitted' : 'reviewed'
    try {
      await flush()
      await setSubmissionStatus(sub.id, next)
      setSub({ ...sub, status: next, reviewed_at: next === 'reviewed' ? new Date().toISOString() : null })
      toast.show(next === 'reviewed' ? '학생에게 "코멘트 완료"로 표시했습니다.' : '검토 대기로 되돌렸습니다.')
    } catch (e) {
      toast.show(`바꾸지 못했습니다: ${(e as Error).message}`)
    }
  }

  const { [BOARD_MEMO]: sourceMemo, ...sourceNotes } = data.notes

  const header = (
    <div className={s.side}>
      <Link to="/submissions" className={s.back}>
        ← {isTeacher ? '기보 제출함' : '내 기보'}
      </Link>
      <h1 className={s.title}>{sub.title}</h1>
      <p className={s.sub}>
        {isTeacher && `${sub.profiles?.display_name ?? '학생'} · `}
        {sub.played_on ? `${sub.played_on.replace(/-/g, '.')} 대국 · ` : ''}
        {formatDateTime(sub.created_at).slice(0, 10)} 제출
      </p>
      <span className={`${s.type} ${sub.status === 'reviewed' ? s.sgf : s.waiting}`}>
        {sub.status === 'reviewed' ? `코멘트 완료${sub.reviewed_at ? ` · ${formatDateTime(sub.reviewed_at).slice(0, 10)}` : ''}` : '검토 대기'}
      </span>
      {sub.student_note && (
        <div className={s.studentNote}>
          <span className={s.noteLabel}>{isTeacher ? '학생의 한마디' : '내가 남긴 말'}</span>
          {sub.student_note}
        </div>
      )}
      <div className={s.actions}>
        {isTeacher && (
          <Button size="small" variant={sub.status === 'reviewed' ? 'default' : 'primary'} onClick={() => void toggleReviewed()}>
            {sub.status === 'reviewed' ? '검토 대기로 되돌리기' : '코멘트 다 달았어요 (학생에게 돌려주기)'}
          </Button>
        )}
        <Button size="small" onClick={() => downloadSgfWithComments(editor.tree, comments, sub.title)}>
          SGF 내려받기
        </Button>
      </div>
      <p className={s.muted}>
        {isTeacher
          ? '수마다 코멘트를 달고, 더 좋은 수는 변화도로 직접 두어 보여 주세요. 판 전체 총평은 아래 "총평"에 씁니다.'
          : '선생님 코멘트가 달린 수는 파란 점으로 표시됩니다. 수순을 넘기며 확인하세요.'}
      </p>
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
        sourceNotes={sourceNotes}
        sourceMemo={sourceMemo}
        memoLabel="총평"
        aside={isTeacher && <span className={s.muted}>{saveStateLabel(saveState)}</span>}
      />
      {toast.node}
    </div>
  )
}
