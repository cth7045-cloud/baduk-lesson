import { useMemo, useRef, useState, type ReactNode } from 'react'
import { GoBoard } from '../../components/board/GoBoard'
import { CommentText } from '../../components/comments/CommentText'
import { BOARD_MEMO, type CommentMap } from '../../components/comments/types'
import { Button } from '../../components/ui/Button'
import { toSgf } from '../../go/coords'
import type { NodeMarkup } from '../../go/markup'
import { nodeMarkup } from '../../go/markup'
import { BoardState } from '../../go/rules/board'
import { playMove } from '../../go/tree/edit'
import { createTree, getNode, newNodeId, nodeMove, type GameTree } from '../../go/tree/gameTree'
import { applyOps } from '../../go/tree/ops'
import { lastMovePoint, moveNumbersOnBoard, positionAt } from '../../go/tree/position'
import { samePoint, type Color, type Point } from '../../go/types'
import type { TryResult } from './ProblemSolver'
import s from './Solver.module.css'

interface Props {
  title: string
  problemTree: GameTree
  comments: CommentMap
  initialAttemptTree?: GameTree | null
  onTryEnd?: (result: TryResult, attemptTree: GameTree) => void
  footer?: ReactNode
  alreadySolved?: boolean
}

/** 본선(첫 번째 갈래) 노드들: 루트부터 끝까지 */
export function mainLineIds(tree: GameTree): string[] {
  const ids = [tree.rootId]
  let n = getNode(tree, tree.rootId)
  while (n.children.length) {
    n = getNode(tree, n.children[0])
    ids.push(n.id)
  }
  return ids
}

/** 외울 수순: 본선의 착수들 (한 수 쉼은 건너뜀) */
export function memorizeMoves(tree: GameTree): { nodeId: string; color: Color; p: Point }[] {
  const out: { nodeId: string; color: Color; p: Point }[] = []
  for (const id of mainLineIds(tree)) {
    const mv = nodeMove(tree, getNode(tree, id))
    if (mv?.point) out.push({ nodeId: id, color: mv.color, p: mv.point })
  }
  return out
}

/** 풀이 기록 판: 수순 외우기는 처음 배치에서, 모양 외우기는 빈 판에서 시작 (갈래마다 한 번의 답) */
function freshAttemptTree(problem: GameTree, mode: 'sequence' | 'shape'): GameTree {
  const root = getNode(problem, problem.rootId)
  const keep: Record<string, string[]> = {}
  const keys = mode === 'sequence' ? ['GM', 'FF', 'SZ', 'AB', 'AW', 'AE', 'PL'] : ['GM', 'FF', 'SZ']
  for (const k of keys) if (root.props[k]) keep[k] = root.props[k]
  return createTree(problem.size, keep)
}

function loadConfirmTouch(): boolean {
  try {
    return JSON.parse(localStorage.getItem('baduk-board-prefs-v1') ?? '{}').confirmTouch ?? true
  } catch {
    return true
  }
}

const NO_MARKUP: NodeMarkup = { shapes: [], labels: [], arrows: [] }

/**
 * 학생용 "모양 외우기".
 *  - 수순이 있으면(정석 등): 먼저 수순을 넘겨 보며 외우고 → 시험에서 처음 배치부터 한 수씩 순서대로 둠
 *  - 수순 없이 배치만 있으면(모양): 먼저 보고 외우고 → 빈 판에 흑·백 돌을 그대로 놓고 채점
 */
export function MemorizeSolver({ title, problemTree, comments, initialAttemptTree, onTryEnd, footer, alreadySolved }: Props) {
  const moves = useMemo(() => memorizeMoves(problemTree), [problemTree])
  const mode: 'sequence' | 'shape' = moves.length ? 'sequence' : 'shape'
  const [phase, setPhase] = useState<'study' | 'test'>('study')
  const memo = comments[BOARD_MEMO]?.body
  const attemptRef = useRef<GameTree>(initialAttemptTree ?? freshAttemptTree(problemTree, mode))
  const [highlight, setHighlight] = useState<{ points: Point[]; key: number } | null>(null)

  const header = (
    <>
      <div className={s.problemHead}>
        <h1 className={s.title}>{title}</h1>
        <span className={s.turn}>{mode === 'sequence' ? `수순 외우기 · ${moves.length}수` : '모양 외우기'}</span>
      </div>
      {memo && (
        <div className={s.memo}>
          <CommentText body={memo} boardSize={problemTree.size} onCoordClick={(p) => setHighlight({ points: [p], key: Date.now() })} />
        </div>
      )}
      {alreadySolved && phase === 'study' && <p className={s.note}>이미 다 외운 과제입니다. 다시 해 봐도 기록은 바뀌지 않습니다.</p>}
    </>
  )

  if (phase === 'study')
    return (
      <Study
        tree={problemTree}
        comments={comments}
        mode={mode}
        header={header}
        highlight={highlight}
        onHighlight={setHighlight}
        onStart={() => setPhase('test')}
      />
    )
  return mode === 'sequence' ? (
    <SequenceTest
      tree={problemTree}
      moves={moves}
      header={header}
      attemptRef={attemptRef}
      onTryEnd={onTryEnd}
      onStudy={() => setPhase('study')}
      footer={footer}
    />
  ) : (
    <ShapeTest tree={problemTree} header={header} attemptRef={attemptRef} onTryEnd={onTryEnd} onStudy={() => setPhase('study')} footer={footer} />
  )
}

// ---------------------------------------------------------------- 외우기 (보기)
function Study({
  tree,
  comments,
  mode,
  header,
  highlight,
  onHighlight,
  onStart,
}: {
  tree: GameTree
  comments: CommentMap
  mode: 'sequence' | 'shape'
  header: ReactNode
  highlight: { points: Point[]; key: number } | null
  onHighlight: (h: { points: Point[]; key: number }) => void
  onStart: () => void
}) {
  const ids = useMemo(() => mainLineIds(tree), [tree])
  const [idx, setIdx] = useState(mode === 'sequence' ? 0 : ids.length - 1)
  const id = ids[idx]
  const board = useMemo(() => positionAt(tree, id), [tree, id])
  const numbers = useMemo(() => (mode === 'sequence' ? moveNumbersOnBoard(tree, id) : null), [tree, id, mode])
  const markup = useMemo(() => nodeMarkup(getNode(tree, id), tree.size), [tree, id])
  const comment = id !== tree.rootId ? comments[id]?.body : undefined
  const last = ids.length - 1

  return (
    <div className={s.layout}>
      <div className={s.boardArea}>
        <div className={s.boardBox}>
          <GoBoard
            board={board}
            markup={markup}
            numbers={numbers}
            lastMove={lastMovePoint(tree, id)}
            highlights={highlight?.points}
            highlightKey={highlight?.key}
          />
        </div>
      </div>
      <aside className={s.side}>
        {header}
        <div className={`${s.result} ${s.playing}`}>
          <p className={s.big}>1단계: 외우기</p>
          <p>
            {mode === 'sequence'
              ? '아래 버튼으로 한 수씩 넘기며 수순을 외우세요. 다 외웠으면 "시험 보기"를 누르세요. 시험에서는 처음 배치부터 같은 순서로 직접 둡니다.'
              : '판의 돌 모양을 잘 보고 외우세요. 다 외웠으면 "시험 보기"를 누르세요. 시험에서는 빈 판에 같은 모양을 직접 놓습니다.'}
          </p>
          {comment && (
            <div className={s.comment}>
              <CommentText body={comment} boardSize={tree.size} onCoordClick={(p) => onHighlight({ points: [p], key: Date.now() })} />
            </div>
          )}
        </div>
        {mode === 'sequence' && (
          <div className={s.actions}>
            <Button onClick={() => setIdx(0)} disabled={idx === 0} aria-label="처음">
              ⏮
            </Button>
            <Button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>
              ◀ 이전
            </Button>
            <span className={s.counter}>
              {idx} / {last}수
            </span>
            <Button onClick={() => setIdx(Math.min(last, idx + 1))} disabled={idx === last}>
              다음 ▶
            </Button>
            <Button onClick={() => setIdx(last)} disabled={idx === last} aria-label="끝">
              ⏭
            </Button>
          </div>
        )}
        <div className={s.actions}>
          <Button variant="primary" onClick={onStart}>
            다 외웠어요 — 시험 보기
          </Button>
        </div>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------- 시험: 수순
function SequenceTest({
  tree,
  moves,
  header,
  attemptRef,
  onTryEnd,
  onStudy,
  footer,
}: {
  tree: GameTree
  moves: { nodeId: string; color: Color; p: Point }[]
  header: ReactNode
  attemptRef: { current: GameTree }
  onTryEnd?: (result: TryResult, attemptTree: GameTree) => void
  onStudy: () => void
  footer?: ReactNode
}) {
  const [step, setStep] = useState(0) // 지금까지 맞게 놓인 수
  const [mistakes, setMistakes] = useState(0)
  const [flash, setFlash] = useState<{ wrong: Point; right: Point; key: number } | null>(null)
  const [pending, setPending] = useState<Point | null>(null)
  const [confirmTouch] = useState(loadConfirmTouch)
  const cursor = useRef(attemptRef.current.rootId)
  const done = step >= moves.length
  const atId = step === 0 ? tree.rootId : moves[step - 1].nodeId
  const board = useMemo(() => positionAt(tree, atId), [tree, atId])
  const numbers = useMemo(() => moveNumbersOnBoard(tree, atId), [tree, atId])
  const next = moves[step]

  function record(color: Color, p: Point, mark?: 'BM' | 'TE', advance = true) {
    const t = attemptRef.current
    const r = playMove(t, cursor.current, color, p)
    if (!r.ok) return
    let nt = applyOps(t, r.ops)
    if (mark) nt = applyOps(nt, [{ type: 'setProps', nodeId: r.nodeId, props: { [mark]: ['1'] } }])
    attemptRef.current = nt
    if (advance) cursor.current = r.nodeId
  }

  function onPointClick(p: Point, pointerType: string) {
    if (done || !next || board.get(p) !== 0) return
    if (pointerType === 'touch' && confirmTouch && !samePoint(pending, p)) {
      setPending(p)
      return
    }
    setPending(null)
    if (samePoint(p, next.p)) {
      const last = step + 1 === moves.length
      record(next.color, p, last && mistakes === 0 ? 'TE' : undefined)
      setFlash(null)
      setStep(step + 1)
      if (last) onTryEnd?.(mistakes === 0 ? 'solved' : 'wrong', attemptRef.current)
    } else {
      // 틀린 수는 갈래로 남기고(오답 표시), 정답 수를 대신 놓아 이어 감
      record(next.color, p, 'BM', false)
      record(next.color, next.p)
      setMistakes(mistakes + 1)
      setFlash({ wrong: p, right: next.p, key: Date.now() })
      const last = step + 1 === moves.length
      setStep(step + 1)
      if (last) onTryEnd?.('wrong', attemptRef.current)
    }
  }

  function retry() {
    cursor.current = attemptRef.current.rootId
    setStep(0)
    setMistakes(0)
    setFlash(null)
    setPending(null)
  }

  const markup: NodeMarkup = flash ? { shapes: [{ p: flash.wrong, kind: 'MA' }], labels: [], arrows: [] } : NO_MARKUP
  const status = done ? (mistakes === 0 ? 'solved' : 'wrong') : flash ? 'wrong' : 'playing'

  return (
    <div className={s.layout}>
      <div className={s.boardArea}>
        <div className={s.boardBox}>
          <GoBoard
            board={board}
            markup={markup}
            numbers={numbers}
            lastMove={step ? moves[step - 1].p : null}
            highlights={flash ? [flash.right] : undefined}
            highlightKey={flash?.key}
            pending={pending && next ? { p: pending, color: next.color } : null}
            hoverColor={done ? null : next?.color}
            onPointClick={done ? undefined : onPointClick}
          />
          {pending && (
            <div className={`${s.hint} ${pending.y >= tree.size / 2 ? s.hintTop : s.hintBottom}`}>같은 자리를 한 번 더 누르면 둡니다</div>
          )}
        </div>
      </div>
      <aside className={s.side}>
        {header}
        <div className={`${s.result} ${s[status]}`} role="status" aria-live="polite">
          {!done && (
            <>
              <p className={flash ? s.big : undefined}>{flash ? '틀렸어요.' : '2단계: 시험'}</p>
              <p>
                {flash
                  ? `빨간 ✕ 자리가 아니라 반짝이는 자리였습니다. 정답 수를 대신 놓았으니 이어서 ${next.color === 'B' ? '흑' : '백'} ${step + 1}수를 두세요.`
                  : `외운 순서대로 두세요. 지금은 ${next.color === 'B' ? '흑' : '백'} ${step + 1}수째입니다.`}
              </p>
              <p className={s.note}>
                {step} / {moves.length}수 · 틀린 수 {mistakes}개
              </p>
            </>
          )}
          {done && mistakes === 0 && <p className={s.big}>완벽합니다! 수순을 모두 외웠어요.</p>}
          {done && mistakes > 0 && (
            <>
              <p className={s.big}>끝까지 두었어요. 틀린 수 {mistakes}개</p>
              <p>한 번 더 외운 뒤 다시 해 보세요. 틀린 곳 없이 끝내면 통과입니다.</p>
            </>
          )}
        </div>
        <div className={s.actions}>
          {done ? (
            <Button variant={mistakes === 0 ? 'default' : 'primary'} onClick={retry}>
              처음부터 다시
            </Button>
          ) : (
            step > 0 && (
              <Button variant="ghost" onClick={retry}>
                처음으로
              </Button>
            )
          )}
          <Button variant="ghost" onClick={onStudy}>
            다시 외우기
          </Button>
          {footer}
        </div>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------- 시험: 모양
function ShapeTest({
  tree,
  header,
  attemptRef,
  onTryEnd,
  onStudy,
  footer,
}: {
  tree: GameTree
  header: ReactNode
  attemptRef: { current: GameTree }
  onTryEnd?: (result: TryResult, attemptTree: GameTree) => void
  onStudy: () => void
  footer?: ReactNode
}) {
  const target = useMemo(() => positionAt(tree, tree.rootId), [tree])
  const size = tree.size
  const [cells, setCells] = useState(() => new Uint8Array(size * size))
  const [color, setColor] = useState<'B' | 'W' | 'erase'>('B')
  const [graded, setGraded] = useState<{ ok: number; missing: Point[]; wrong: Point[]; total: number } | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [pending, setPending] = useState<Point | null>(null)
  const [confirmTouch] = useState(loadConfirmTouch)
  const board = useMemo(() => (showAnswer ? target : new BoardState(size, cells)), [showAnswer, target, size, cells])

  function onPointClick(p: Point, pointerType: string) {
    if (graded) return
    const i = p.y * size + p.x
    const want = color === 'erase' ? 0 : color === 'B' ? 1 : 2
    if (pointerType === 'touch' && confirmTouch && cells[i] === 0 && want !== 0 && !samePoint(pending, p)) {
      setPending(p)
      return
    }
    setPending(null)
    const next = cells.slice()
    // 같은 돌을 다시 누르면 지움
    next[i] = cells[i] === want ? 0 : want
    setCells(next)
  }

  function grade() {
    let ok = 0
    let total = 0
    const missing: Point[] = []
    const wrong: Point[] = []
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const t = target.cells[y * size + x]
        const c = cells[y * size + x]
        if (t) total++
        if (t && c === t) ok++
        else if (t && !c) missing.push({ x, y })
        else if (c && c !== t) wrong.push({ x, y })
      }
    const solved = missing.length === 0 && wrong.length === 0
    setGraded({ ok, missing, wrong, total })
    // 기록: 이번에 놓은 모양을 갈래 하나로 (틀린 돌 ✕, 빠진 돌 △)
    const props: Record<string, string[]> = {}
    const ab: string[] = []
    const aw: string[] = []
    cells.forEach((c, i) => {
      const p = { x: i % size, y: Math.floor(i / size) }
      if (c === 1) ab.push(toSgf(p))
      if (c === 2) aw.push(toSgf(p))
    })
    if (ab.length) props.AB = ab
    if (aw.length) props.AW = aw
    if (wrong.length) props.MA = wrong.map(toSgf)
    if (missing.length) props.TR = missing.map(toSgf)
    props[solved ? 'TE' : 'BM'] = ['1']
    const t = attemptRef.current
    attemptRef.current = applyOps(t, [{ type: 'addNode', parentId: t.rootId, id: newNodeId(), props }])
    onTryEnd?.(solved ? 'solved' : 'wrong', attemptRef.current)
  }

  function retry() {
    setCells(new Uint8Array(size * size))
    setGraded(null)
    setShowAnswer(false)
    setPending(null)
  }

  const markup: NodeMarkup =
    graded && !showAnswer
      ? { shapes: [...graded.wrong.map((p) => ({ p, kind: 'MA' as const })), ...graded.missing.map((p) => ({ p, kind: 'TR' as const }))], labels: [], arrows: [] }
      : NO_MARKUP
  const solved = graded && graded.missing.length === 0 && graded.wrong.length === 0
  const placed = cells.reduce((a, c) => a + (c ? 1 : 0), 0)

  return (
    <div className={s.layout}>
      <div className={s.boardArea}>
        <div className={s.boardBox}>
          <GoBoard
            board={board}
            markup={markup}
            pending={pending && color !== 'erase' ? { p: pending, color } : null}
            hoverColor={graded || color === 'erase' ? null : color}
            onPointClick={graded ? undefined : onPointClick}
          />
          {pending && (
            <div className={`${s.hint} ${pending.y >= size / 2 ? s.hintTop : s.hintBottom}`}>같은 자리를 한 번 더 누르면 놓습니다</div>
          )}
        </div>
      </div>
      <aside className={s.side}>
        {header}
        <div className={`${s.result} ${graded ? (solved ? s.solved : s.wrong) : s.playing}`} role="status" aria-live="polite">
          {!graded && (
            <>
              <p>2단계: 외운 모양을 빈 판에 그대로 놓으세요. 다 놓았으면 "채점하기"를 누르세요.</p>
              <p className={s.note}>놓은 돌 {placed}개 · 같은 돌을 다시 누르면 지워집니다</p>
            </>
          )}
          {graded && solved && <p className={s.big}>완벽합니다! 모양을 정확히 외웠어요.</p>}
          {graded && !solved && (
            <>
              <p className={s.big}>
                {graded.total}개 중 {graded.ok}개 맞음
              </p>
              <p>
                {graded.missing.length > 0 && `빠진 돌 ${graded.missing.length}개(△) `}
                {graded.wrong.length > 0 && `잘못 놓은 돌 ${graded.wrong.length}개(✕)`}
              </p>
            </>
          )}
        </div>
        {!graded && (
          <div className={s.actions}>
            <div className={s.colorPick} role="group" aria-label="놓을 돌">
              {(['B', 'W', 'erase'] as const).map((c) => (
                <button key={c} type="button" className={color === c ? s.on : ''} onClick={() => setColor(c)}>
                  {c === 'B' ? '● 흑' : c === 'W' ? '○ 백' : '지우개'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={s.actions}>
          {!graded && (
            <Button variant="primary" onClick={grade} disabled={placed === 0}>
              채점하기
            </Button>
          )}
          {graded && !solved && (
            <Button variant={showAnswer ? 'default' : 'ghost'} onClick={() => setShowAnswer(!showAnswer)}>
              {showAnswer ? '내 답 보기' : '정답 보기'}
            </Button>
          )}
          {graded && (
            <Button variant={solved ? 'default' : 'primary'} onClick={retry}>
              다시 하기
            </Button>
          )}
          <Button variant="ghost" onClick={onStudy}>
            다시 외우기
          </Button>
          {footer}
        </div>
      </aside>
    </div>
  )
}
