import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { GameEditor } from '../../components/board/useGameEditor'
import type { CommentMap } from '../../components/comments/types'
import { formatDateTime } from '../../components/comments/format'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { BoardWorkspace } from '../../components/workspace/BoardWorkspace'
import { newGame } from '../../go/sgf/convert'
import type { GameTree } from '../../go/tree/gameTree'
import type { TreeOp } from '../../go/tree/ops'
import { loadBoard } from '../../data/boards'
import { listComments, replaceAllComments } from '../../data/comments'
import { getLesson, subscribeLesson, updateLesson, type ControlMode, type LessonWithPeople } from '../../data/lessons'
import { downloadSgfWithComments, readSgfFile } from '../../lib/sgfFile'
import { useAuth } from '../auth/AuthProvider'
import { saveStateLabel, useBoardDocument } from '../boards/useBoardDocument'
import { useLessonChannel } from './useLessonChannel'
import s from './Lesson.module.css'

interface Loaded {
  lesson: LessonWithPeople
  tree: GameTree
  comments: CommentMap
}

/** 수업방 (진행 중) / 수업 기록 (종료 후) 화면 */
export function LessonPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    void (async () => {
      try {
        const lesson = await getLesson(id)
        const [{ tree }, comments] = await Promise.all([loadBoard(lesson.board_id), listComments(lesson.board_id)])
        if (alive) setData({ lesson, tree, comments })
      } catch {
        if (alive) setError('수업을 찾을 수 없거나 들어갈 권한이 없습니다.')
      }
    })()
    return () => {
      alive = false
    }
  }, [id])

  if (error)
    return (
      <div className={s.message}>
        <p>{error}</p>
        <Link to="/lessons">수업 목록으로</Link>
      </div>
    )
  if (!data) return <p className={s.message}>수업을 불러오는 중…</p>
  return <LessonRoom key={data.lesson.id} initial={data} />
}

function LessonRoom({ initial }: { initial: Loaded }) {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const [lesson, setLesson] = useState(initial.lesson)
  const [following, setFollowing] = useState(true)
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const boardId = lesson.board_id
  const live = lesson.status === 'live'

  // 내 편집 → 채널로 전송 (채널 훅이 아래에서 만들어지므로 참조로 연결)
  const sendOpsRef = useRef<(ops: TreeOp[], nodeId?: string) => void>(() => {})
  const { editor, comments, setComments, commentActions, saveState, flush } = useBoardDocument({
    boardId,
    initialTree: initial.tree,
    initialComments: initial.comments,
    autosave: isTeacher,
    onOps: (ops, nodeId) => sendOpsRef.current(ops, nodeId),
    onError: (m) => toast.show(m),
  })

  const me = useMemo(
    () => ({ id: profile?.id ?? '', name: profile?.display_name ?? '', role: isTeacher ? ('teacher' as const) : ('student' as const) }),
    [profile?.id, profile?.display_name, isTeacher],
  )

  const onEnded = useCallback(() => {
    setLesson((l) => ({ ...l, status: 'ended', ended_at: l.ended_at ?? new Date().toISOString() }))
  }, [])

  const channel = useLessonChannel({
    lessonId: lesson.id,
    enabled: live,
    me,
    mode: lesson.control_mode,
    editor,
    onEnded,
  })
  sendOpsRef.current = channel.sendOps

  // ---------- 수업 상태(조작 권한, 종료) 실시간 반영 ----------
  useEffect(
    () => subscribeLesson(lesson.id, (row) => setLesson((l) => ({ ...l, ...row }))),
    [lesson.id],
  )

  // ---------- 선생님: 보고 있는 수 알리기 ----------
  useEffect(() => {
    if (isTeacher && live && channel.status === 'connected') channel.sendNav(editor.currentId)
  }, [isTeacher, live, channel.status, channel.sendNav, editor.currentId])

  // ---------- 학생: 선생님 화면 따라가기 ----------
  const { teacherNode } = channel
  useEffect(() => {
    if (!isTeacher && live && following && teacherNode && editor.tree.nodes[teacherNode] && editor.currentId !== teacherNode) {
      editor.goTo(teacherNode)
    }
  }, [isTeacher, live, following, teacherNode, editor])

  // 학생이 선생님과 같은 수로 돌아오면(직접 둔 수를 선생님 화면도 따라온 경우 등) 다시 따라가기
  useEffect(() => {
    if (!isTeacher && live && !following && teacherNode && teacherNode === editor.currentId) setFollowing(true)
  }, [isTeacher, live, following, teacherNode, editor.currentId])

  // 학생이 직접 수를 넘기면 따라가기를 멈춤
  const viewEditor: GameEditor = useMemo(() => {
    if (isTeacher || !live) return editor
    const stop = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
      setFollowing(false)
      fn(...a)
    }
    return {
      ...editor,
      goTo: stop(editor.goTo),
      back: stop(editor.back),
      forward: stop(editor.forward),
      first: stop(editor.first),
      last: stop(editor.last),
      switchVariation: stop(editor.switchVariation),
      apply: stop(editor.apply),
    }
  }, [editor, isTeacher, live])

  // ---------- 선생님 동작 ----------
  async function setMode(mode: ControlMode) {
    const prev = lesson.control_mode
    setLesson((l) => ({ ...l, control_mode: mode }))
    try {
      await updateLesson(lesson.id, { control_mode: mode })
    } catch {
      setLesson((l) => ({ ...l, control_mode: prev }))
      toast.show('권한을 바꾸지 못했습니다. 인터넷 연결을 확인해 주세요.')
    }
  }

  async function endLesson() {
    if (!window.confirm('수업을 끝낼까요?\n판과 코멘트가 오늘 날짜의 수업 기록으로 저장되고, 학생들은 복습 화면으로 바뀝니다.')) return
    try {
      await flush()
      const endedAt = new Date().toISOString()
      await updateLesson(lesson.id, { status: 'ended', ended_at: endedAt })
      channel.sendEnded()
      setLesson((l) => ({ ...l, status: 'ended', ended_at: endedAt }))
      toast.show('수업을 마쳤습니다. 수업 기록에 저장되었습니다.')
    } catch (e) {
      toast.show(`수업을 끝내지 못했습니다: ${(e as Error).message}`)
    }
  }

  async function copyLink() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast.show('수업 링크를 복사했습니다. 디스코드에 붙여넣어 학생들에게 보내 주세요.')
    } catch {
      window.prompt('아래 주소를 복사해서 학생들에게 보내 주세요.', url)
    }
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!window.confirm('지금 판과 코멘트를 불러온 기보로 바꿀까요?\n(지금 판이 필요하면 먼저 "SGF 내보내기"를 하세요)')) return
    try {
      const g = await readSgfFile(file)
      editor.apply([{ type: 'replaceTree', tree: g.tree }])
      await replaceAllComments(boardId, g.nodeComments, g.gameComment)
      setComments(await listComments(boardId))
      toast.show('기보를 불러왔습니다.')
    } catch {
      toast.show('불러오기 실패: SGF 파일을 확인해 주세요.')
    }
  }

  function resetBoard() {
    if (!window.confirm('판을 처음 상태로 비울까요? 지금까지의 수순이 모두 지워집니다.')) return
    editor.apply([{ type: 'replaceTree', tree: newGame(editor.tree.size) }])
  }

  const canEditBoard = isTeacher || (live && lesson.control_mode === 'everyone')
  const participantNames = lesson.participants.map((p) => p.profiles?.display_name ?? '학생')
  const onlineIds = new Set(channel.online.map((u) => u.id))
  const dateLabel = formatDateTime(lesson.started_at).slice(0, 10)

  const header = (
    <div className={s.head}>
      <div className={s.titleRow}>
        <h1 className={s.title}>{lesson.title || '수업'}</h1>
        {live ? (
          <span className={`${s.chip} ${s.live}`}>수업 중</span>
        ) : (
          <span className={s.chip}>수업 기록 · {dateLabel}</span>
        )}
      </div>

      {live && (
        <div className={s.people}>
          {channel.status === 'connecting' && <span className={s.muted}>실시간 연결 중…</span>}
          {channel.status === 'error' && (
            <span className={s.warn}>실시간 연결에 실패했습니다. 새로고침해 주세요.</span>
          )}
          {channel.status === 'connected' && (
            <>
              <span className={`${s.person} ${s.on}`}>{me.name}(나)</span>
              {channel.online
                .filter((u) => u.id !== me.id)
                .map((u) => (
                  <span key={u.id} className={`${s.person} ${s.on}`}>
                    {u.name}
                    {u.role === 'teacher' ? ' 선생님' : ''}
                  </span>
                ))}
              {isTeacher &&
                lesson.participants
                  .filter((p) => !onlineIds.has(p.student_id))
                  .map((p) => (
                    <span key={p.student_id} className={s.person}>
                      {p.profiles?.display_name ?? '학생'}
                    </span>
                  ))}
            </>
          )}
        </div>
      )}
      {!live && participantNames.length > 0 && <p className={s.muted}>참여: {participantNames.join(', ')}</p>}

      {isTeacher && live && (
        <div className={s.modeSwitch} role="group" aria-label="착수 권한">
          <button type="button" className={lesson.control_mode === 'teacher' ? s.on : ''} onClick={() => void setMode('teacher')}>
            선생님만 조작
          </button>
          <button type="button" className={lesson.control_mode === 'everyone' ? s.on : ''} onClick={() => void setMode('everyone')}>
            학생도 착수 가능
          </button>
        </div>
      )}
      {!isTeacher && live && (
        <p className={s.muted}>
          {lesson.control_mode === 'everyone' ? '지금은 학생도 판에 둘 수 있습니다.' : '선생님이 판을 움직이고 있습니다.'}
        </p>
      )}
      {!isTeacher && live && !following && (
        <Button
          variant="primary"
          size="small"
          onClick={() => {
            setFollowing(true)
            if (teacherNode && editor.tree.nodes[teacherNode]) editor.goTo(teacherNode)
          }}
        >
          선생님 화면 따라가기
        </Button>
      )}

      <div className={s.actions}>
        {isTeacher && live && (
          <Button size="small" onClick={() => void copyLink()}>
            링크 복사
          </Button>
        )}
        <Button size="small" onClick={() => downloadSgfWithComments(editor.tree, comments, `${lesson.title}_${dateLabel}`)}>
          SGF 내보내기
        </Button>
        {isTeacher && (
          <>
            <Button size="small" onClick={() => fileRef.current?.click()}>
              SGF 불러오기
            </Button>
            <Button size="small" onClick={resetBoard}>
              판 초기화
            </Button>
            <input ref={fileRef} type="file" accept=".sgf,application/x-go-sgf,text/plain" hidden onChange={onImport} />
          </>
        )}
        {!isTeacher && live && channel.status === 'connected' && (
          <Button size="small" variant="ghost" onClick={() => void channel.resync()}>
            판 다시 맞추기
          </Button>
        )}
        {isTeacher && live && (
          <Button size="small" variant="primary" onClick={() => void endLesson()}>
            수업 종료
          </Button>
        )}
      </div>
      {!live && !isTeacher && <p className={s.muted}>수업이 끝났습니다. 수순을 넘기며 코멘트와 함께 복습하세요.</p>}
    </div>
  )

  return (
    <div className={s.page}>
      <BoardWorkspace
        header={header}
        editor={viewEditor}
        comments={comments}
        commentActions={commentActions}
        canEditComments={isTeacher}
        canEditBoard={canEditBoard}
        aside={
          isTeacher && <span className={s.saveState}>{saveStateLabel(saveState)}</span>
        }
      />
      {toast.node}
    </div>
  )
}
