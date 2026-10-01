import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { GoBoard } from '../../components/board/GoBoard'
import { useGameEditor } from '../../components/board/useGameEditor'
import { CommentText } from '../../components/comments/CommentText'
import { BOARD_MEMO, type CommentMap } from '../../components/comments/types'
import { Button } from '../../components/ui/Button'
import { nodeMarkup } from '../../go/markup'
import { judgeMove } from '../../go/problem/grader'
import { PLAY_ERROR_MESSAGE } from '../../go/rules/board'
import { playMove } from '../../go/tree/edit'
import { createTree, getNode, nextColor, nodeMove, type GameTree } from '../../go/tree/gameTree'
import { applyOps } from '../../go/tree/ops'
import { lastMovePoint, positionAt } from '../../go/tree/position'
import { samePoint, type Color, type Point } from '../../go/types'
import s from './Solver.module.css'

export type TryResult = 'solved' | 'wrong'

type Status = 'playing' | 'thinking' | 'wrong' | 'unexpected' | 'solved'

interface Props {
  title: string
  problemTree: GameTree
  comments: CommentMap
  /** 지금까지의 풀이 기록 판 (없으면 새로) */
  initialAttemptTree?: GameTree | null
  /** 한 번의 시도가 끝날 때 (기록 저장용). 미리보기에서는 생략 */
  onTryEnd?: (result: TryResult, attemptTree: GameTree) => void
  /** 결과 상자 아래에 붙일 버튼 (다음 문제 등) */
  footer?: ReactNode
  /** 이미 맞힌 문제 안내 */
  alreadySolved?: boolean
}

const RESPONSE_DELAY = 450

/** 풀이 기록 판을 문제의 처음 배치로 시작 */
function freshAttemptTree(problem: GameTree): GameTree {
  const root = getNode(problem, problem.rootId)
  const keep: Record<string, string[]> = {}
  for (const k of ['GM', 'FF', 'SZ', 'AB', 'AW', 'AE', 'PL']) if (root.props[k]) keep[k] = root.props[k]
  return createTree(problem.size, keep)
}

function loadConfirmTouch(): boolean {
  try {
    return JSON.parse(localStorage.getItem('baduk-board-prefs-v1') ?? '{}').confirmTouch ?? true
  } catch {
    return true
  }
}

/**
 * 학생용 문제 풀이판.
 * 정답 수순이 드러나지 않도록 수순 트리·다음 수 힌트를 보여 주지 않음.
 */
export function ProblemSolver({ title, problemTree, comments, initialAttemptTree, onTryEnd, footer, alreadySolved }: Props) {
  // 화면에 보이는 판 = 문제 트리 (예상 밖의 수는 이 화면에서만 임시로 추가)
  const view = useGameEditor(problemTree)
  const [status, setStatus] = useState<Status>('playing')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<{ p: Point; color: Color } | null>(null)
  const [confirmTouch] = useState(loadConfirmTouch)
  const [highlight, setHighlight] = useState<{ points: Point[]; key: number } | null>(null)

  // 풀이 기록 (모든 시도를 변화도로 쌓음)
  const attemptRef = useRef<GameTree>(initialAttemptTree ?? freshAttemptTree(problemTree))
  const attemptCursor = useRef(attemptRef.current.rootId)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const toPlay = nextColor(problemTree, problemTree.rootId)
  const board = useMemo(() => positionAt(view.tree, view.currentId), [view.tree, view.currentId])
  const node = view.tree.nodes[view.currentId]
  const markup = useMemo(() => nodeMarkup(node, view.tree.size), [node, view.tree.size])
  // 마지막으로 둔 학생 수와 상대 응수의 코멘트를 함께 보여 줌 (오답 이유는 학생 수에 달려 있음)
  const [shownIds, setShownIds] = useState<string[]>([])
  const shownComments = shownIds.map((id) => comments[id]?.body).filter((b): b is string => !!b)

  /** 풀이 기록 판에 한 수 추가 */
  const record = useCallback((color: Color, p: Point, mark?: 'BM' | 'TE') => {
    const r = playMove(attemptRef.current, attemptCursor.current, color, p)
    if (!r.ok) return
    let t = applyOps(attemptRef.current, r.ops)
    if (mark) t = applyOps(t, [{ type: 'setProps', nodeId: r.nodeId, props: { [mark]: ['1'] } }])
    attemptRef.current = t
    attemptCursor.current = r.nodeId
  }, [])

  const recordNode = useCallback(
    (nodeId: string, mark?: 'BM' | 'TE') => {
      const mv = nodeMove(problemTree, getNode(problemTree, nodeId))
      if (mv?.point) record(mv.color, mv.point, mark)
    },
    [problemTree, record],
  )

  const finishTry = useCallback(
    (result: TryResult) => {
      onTryEnd?.(result, attemptRef.current)
    },
    [onTryEnd],
  )

  function later(fn: () => void) {
    timers.current.push(window.setTimeout(fn, RESPONSE_DELAY))
  }

  function onPointClick(p: Point, pointerType: string) {
    if (status !== 'playing') return
    if (board.get(p) !== 0) return
    if (pointerType === 'touch' && confirmTouch && !samePoint(pending?.p, p)) {
      setPending({ p, color: nextColor(view.tree, view.currentId) })
      return
    }
    setPending(null)
    setMessage(null)
    const v = judgeMove(problemTree, view.currentId, p)
    if (v.kind === 'continue' || v.kind === 'wrong' || v.kind === 'solved') {
      setShownIds([v.studentNodeId, ...(v.responseId ? [v.responseId] : [])])
    } else if (v.kind === 'unexpected') {
      setShownIds([])
    }
    switch (v.kind) {
      case 'illegal':
        setMessage(PLAY_ERROR_MESSAGE[v.error])
        return
      case 'unexpected': {
        const color = nextColor(view.tree, view.currentId)
        const r = playMove(view.tree, view.currentId, color, p)
        if (r.ok) view.apply(r.ops, r.nodeId)
        record(color, p, 'BM')
        setStatus('unexpected')
        finishTry('wrong')
        return
      }
      case 'wrong':
        view.goTo(v.studentNodeId)
        recordNode(v.studentNodeId, 'BM')
        setStatus('thinking')
        if (v.responseId) {
          const rid = v.responseId
          later(() => {
            view.goTo(rid)
            recordNode(rid)
            setStatus('wrong')
            finishTry('wrong')
          })
        } else {
          setStatus('wrong')
          finishTry('wrong')
        }
        return
      case 'continue':
        view.goTo(v.studentNodeId)
        recordNode(v.studentNodeId)
        setStatus('thinking')
        later(() => {
          view.goTo(v.responseId)
          recordNode(v.responseId)
          setStatus('playing')
        })
        return
      case 'solved':
        view.goTo(v.studentNodeId)
        setStatus('thinking')
        if (v.responseId) {
          const rid = v.responseId
          recordNode(v.studentNodeId)
          later(() => {
            view.goTo(rid)
            recordNode(rid, 'TE')
            setStatus('solved')
            finishTry('solved')
          })
        } else {
          recordNode(v.studentNodeId, 'TE')
          setStatus('solved')
          finishTry('solved')
        }
        return
    }
  }

  function retry() {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    attemptCursor.current = attemptRef.current.rootId
    view.replace(problemTree)
    setStatus('playing')
    setShownIds([])
    setMessage(null)
    setPending(null)
  }

  const memo = comments[BOARD_MEMO]?.body
  const turnText = `${toPlay === 'B' ? '흑' : '백'}선`

  return (
    <div className={s.layout}>
      <div className={s.boardArea}>
        <div className={s.boardBox}>
          <GoBoard
            board={board}
            markup={markup}
            lastMove={lastMovePoint(view.tree, view.currentId)}
            pending={pending}
            highlights={highlight?.points}
            highlightKey={highlight?.key}
            hoverColor={status === 'playing' ? nextColor(view.tree, view.currentId) : null}
            onPointClick={status === 'playing' ? onPointClick : undefined}
          />
          {pending && (
            <div className={`${s.hint} ${pending.p.y >= view.tree.size / 2 ? s.hintTop : s.hintBottom}`}>
              같은 자리를 한 번 더 누르면 둡니다
            </div>
          )}
        </div>
      </div>

      <aside className={s.side}>
        <div className={s.problemHead}>
          <h1 className={s.title}>{title}</h1>
          <span className={s.turn}>
            <span className={toPlay === 'B' ? s.dotB : s.dotW} /> {turnText}
          </span>
        </div>

        {memo && (
          <div className={s.memo}>
            <CommentText body={memo} boardSize={problemTree.size} onCoordClick={(p) => setHighlight({ points: [p], key: Date.now() })} />
          </div>
        )}

        {alreadySolved && status === 'playing' && view.currentId === problemTree.rootId && (
          <p className={s.note}>이미 맞힌 문제입니다. 다시 풀어 봐도 기록은 바뀌지 않습니다.</p>
        )}

        <div className={`${s.result} ${s[status] ?? ''}`} role="status" aria-live="polite">
          {status === 'playing' && view.currentId === problemTree.rootId && <p>판을 눌러 첫 수를 두세요.</p>}
          {status === 'playing' && view.currentId !== problemTree.rootId && <p>좋습니다. 다음 수를 두세요.</p>}
          {status === 'thinking' && <p>상대가 생각하는 중…</p>}
          {status === 'solved' && <p className={s.big}>정답입니다!</p>}
          {status === 'wrong' && <p className={s.big}>아쉽습니다. 틀렸어요.</p>}
          {status === 'unexpected' && (
            <>
              <p className={s.big}>예상하지 못한 수입니다.</p>
              <p>다른 수를 생각해 보세요.</p>
            </>
          )}
          {message && <p>{message}</p>}
          {status !== 'thinking' &&
            shownComments.map((body, i) => (
              <div key={i} className={s.comment}>
                <CommentText body={body} boardSize={problemTree.size} onCoordClick={(p) => setHighlight({ points: [p], key: Date.now() })} />
              </div>
            ))}
        </div>

        <div className={s.actions}>
          {(status === 'wrong' || status === 'unexpected' || status === 'solved') && (
            <Button variant={status === 'solved' ? 'default' : 'primary'} onClick={retry}>
              {status === 'solved' ? '처음부터 다시 풀기' : '다시 시도'}
            </Button>
          )}
          {status === 'playing' && view.currentId !== problemTree.rootId && (
            <Button variant="ghost" onClick={retry}>
              처음으로
            </Button>
          )}
          {footer}
        </div>
      </aside>
    </div>
  )
}
