import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Point } from '../../go/types'
import { Button } from '../ui/Button'
import s from './Comments.module.css'
import { CommentText } from './CommentText'
import { formatDateTime } from './format'
import { BOARD_MEMO, type BoardComment, type CommentActions, type CommentMap } from './types'

interface Props {
  boardSize: number
  /** 지금 보고 있는 수의 노드 ID */
  nodeId: string
  /** 예: "12수 · 흑 D4" */
  nodeLabel: string
  comments: CommentMap
  /** 학생이 올린 기보에 원래 들어 있던 메모 (읽기 전용) */
  sourceNote?: string
  sourceMemo?: string
  canEdit: boolean
  actions?: CommentActions
  onCoordClick?: (p: Point) => void
  /** 바깥에서 "코멘트 입력칸으로 이동" 요청 (Enter 단축키) */
  focusSignal?: number
  /** "판 전체 메모" 대신 쓸 제목 (예: 문제에서는 "문제 설명") */
  memoLabel?: string
}

/** 바둑판 옆(PC)·아래(모바일)에 붙는 코멘트 패널. 모든 화면에서 재사용 */
export function CommentPanel(props: Props) {
  const { boardSize, nodeId, nodeLabel, comments, canEdit, actions, onCoordClick } = props
  // 저장하지 않은 입력 내용은 수를 옮겨도 남겨 둠
  const drafts = useRef<Record<string, string>>({})

  return (
    <div className={s.panel}>
      <section className={s.section} aria-label="이 수의 코멘트">
        <header className={s.sectionHead}>
          <span className={s.sectionTitle}>코멘트</span>
          <span className={s.nodeLabel}>{nodeLabel}</span>
        </header>
        {props.sourceNote && <SourceNote body={props.sourceNote} boardSize={boardSize} onCoordClick={onCoordClick} />}
        <CommentBlock
          key={nodeId}
          commentKey={nodeId}
          comment={comments[nodeId]}
          boardSize={boardSize}
          canEdit={canEdit}
          actions={actions}
          drafts={drafts.current}
          placeholder="이 수에 코멘트 입력 · Enter 저장, Shift+Enter 줄바꿈"
          emptyText="이 수에는 코멘트가 없습니다."
          onCoordClick={onCoordClick}
          focusSignal={props.focusSignal}
        />
      </section>

      <section className={`${s.section} ${s.memoSection}`} aria-label="판 전체 메모">
        <header className={s.sectionHead}>
          <span className={s.sectionTitle}>{props.memoLabel ?? '판 전체 메모'}</span>
        </header>
        {props.sourceMemo && <SourceNote body={props.sourceMemo} boardSize={boardSize} onCoordClick={onCoordClick} />}
        <CommentBlock
          commentKey={BOARD_MEMO}
          comment={comments[BOARD_MEMO]}
          boardSize={boardSize}
          canEdit={canEdit}
          actions={actions}
          drafts={drafts.current}
          placeholder={props.memoLabel ? `${props.memoLabel} 입력 · Enter 저장` : '이 판 전체에 대한 요약·총평 · Enter 저장'}
          emptyText={props.memoLabel ? `${props.memoLabel}이(가) 없습니다.` : '판 전체 메모가 없습니다.'}
          onCoordClick={onCoordClick}
        />
      </section>

      {canEdit && (
        <p className={s.help}>
          <b>**굵게**</b> 처럼 별표 두 개로 감싸면 굵은 글씨. D4 같은 좌표를 쓰면 누를 때 판에 위치가 표시됩니다.
        </p>
      )}
    </div>
  )
}

function SourceNote({ body, boardSize, onCoordClick }: { body: string; boardSize: number; onCoordClick?: (p: Point) => void }) {
  return (
    <div className={s.source}>
      <span className={s.sourceLabel}>원본 기보 메모</span>
      <CommentText body={body} boardSize={boardSize} onCoordClick={onCoordClick} />
    </div>
  )
}

interface BlockProps {
  commentKey: string
  comment?: BoardComment
  boardSize: number
  canEdit: boolean
  actions?: CommentActions
  drafts: Record<string, string>
  placeholder: string
  emptyText: string
  onCoordClick?: (p: Point) => void
  focusSignal?: number
}

function CommentBlock({
  commentKey,
  comment,
  boardSize,
  canEdit,
  actions,
  drafts,
  placeholder,
  emptyText,
  onCoordClick,
  focusSignal,
}: BlockProps) {
  const hasDraft = drafts[commentKey] !== undefined
  const [editing, setEditing] = useState(hasDraft)
  const [text, setText] = useState(drafts[commentKey] ?? comment?.body ?? '')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const showEditor = canEdit && (editing || !comment)

  // 다른 사람이 (실시간으로) 코멘트를 바꿨고 내가 편집 중이 아니면 새 내용 반영
  useEffect(() => {
    if (!editing && drafts[commentKey] === undefined) setText(comment?.body ?? '')
  }, [comment?.body, editing, commentKey, drafts])

  // Enter 단축키: 입력칸을 연 뒤(화면에 그려진 다음) 커서를 글 끝에 둠
  const [wantFocus, setWantFocus] = useState(false)
  // 처음 그려질 때의 값은 무시하고, 값이 바뀔 때만 반응 (수를 옮길 때마다 입력칸이 열리지 않도록)
  const seenSignal = useRef(focusSignal)
  useEffect(() => {
    if (focusSignal === seenSignal.current) return
    seenSignal.current = focusSignal
    if (canEdit) {
      setEditing(true)
      setWantFocus(true)
    }
  }, [focusSignal, canEdit])

  useEffect(() => {
    const el = ref.current
    if (!wantFocus || !el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    setWantFocus(false)
  }, [wantFocus, showEditor])

  // 입력칸 높이를 내용에 맞춤
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
  }, [text, showEditor])

  function update(v: string) {
    setText(v)
    drafts[commentKey] = v
  }

  async function save() {
    if (!actions) return
    const body = text.trim()
    setBusy(true)
    try {
      if (!body) {
        if (comment) await actions.remove(commentKey)
      } else if (body !== comment?.body) {
        await actions.save(commentKey, body)
      }
      delete drafts[commentKey]
      setEditing(false)
      ref.current?.blur()
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    delete drafts[commentKey]
    setText(comment?.body ?? '')
    setEditing(false)
    ref.current?.blur()
  }

  async function remove() {
    if (!actions || !comment) return
    if (!window.confirm('이 코멘트를 삭제할까요?')) return
    setBusy(true)
    try {
      await actions.remove(commentKey)
      delete drafts[commentKey]
      setText('')
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 조합 중의 Enter는 글자 확정용이므로 무시
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (showEditor) {
    const dirty = text.trim() !== (comment?.body ?? '')
    return (
      <div className={s.editor}>
        <textarea
          ref={ref}
          className={s.textarea}
          value={text}
          placeholder={placeholder}
          rows={2}
          onChange={(e) => update(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          enterKeyHint="done"
        />
        {(dirty || editing) && (
          <div className={s.editorActions}>
            {comment && (
              <Button size="small" variant="ghost" onClick={cancel} disabled={busy}>
                취소
              </Button>
            )}
            <Button size="small" variant="primary" onClick={() => void save()} disabled={busy || !dirty}>
              저장
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (!comment) return <p className={s.empty}>{emptyText}</p>

  return (
    <div className={s.comment}>
      <CommentText body={comment.body} boardSize={boardSize} onCoordClick={onCoordClick} />
      <div className={s.meta}>
        <span>
          {comment.updatedAt !== comment.createdAt ? '수정 ' : ''}
          {formatDateTime(comment.updatedAt)}
        </span>
        {canEdit && (
          <span className={s.metaActions}>
            <Button size="small" variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
              수정
            </Button>
            <Button size="small" variant="ghost" danger onClick={() => void remove()} disabled={busy}>
              삭제
            </Button>
          </span>
        )}
      </div>
    </div>
  )
}
