import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { toDisplay } from '../../go/coords'
import { moveNumber, nodeMove, pathTo, type GameTree } from '../../go/tree/gameTree'
import { lastMovePoint, positionAt } from '../../go/tree/position'
import { GoBoard } from '../board/GoBoard'
import s from './MoveTree.module.css'
import { layoutTree } from './layout'

const DX = 30
const DY = 30
const R = 10.5
const PAD = 16

interface Props {
  tree: GameTree
  currentId: string
  /** 코멘트가 달린 노드 ID */
  commentedIds?: Set<string>
  onSelect: (id: string) => void
}

interface Peek {
  id: string
  x: number
  y: number
  touch: boolean
}

const PEEK_LONG_PRESS_MS = 350

/** 화면 좌표 아래의 트리 노드 ID */
function nodeAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)
  return (el?.closest('[data-node-id]') as HTMLElement | null)?.dataset.nodeId ?? null
}

/**
 * 수순 트리: 본선은 가로로, 변화도는 아래 줄로 갈라짐. 눌러서 해당 수로 이동.
 * 미리 보기(카타고 클라우드와 같음): PC는 노드 위에 마우스를 올리면, 폰은 길게 누르면 그 수의 판을 작게 보여 줌
 * (누른 채로 손가락을 밀면 다른 수, 떼면 닫힘. 이동은 하지 않음)
 */
export const MoveTree = memo(function MoveTree({ tree, currentId, commentedIds, onSelect }: Props) {
  const layout = useMemo(() => layoutTree(tree), [tree])
  const scrollRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [peek, setPeek] = useState<Peek | null>(null)

  // 터치: 길게 누르기 → 미리 보기 (passive: false 가 필요해 직접 등록)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    let st: { x0: number; y0: number; x: number; y: number; on: boolean; timer: number } | null = null
    const end = () => {
      if (st?.timer) window.clearTimeout(st.timer)
      if (st?.on) setPeek(null)
      st = null
    }
    const onStart = (ev: TouchEvent) => {
      end()
      if (ev.touches.length !== 1) return
      const t = ev.touches[0]
      const g = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, on: false, timer: 0 }
      g.timer = window.setTimeout(() => {
        g.timer = 0
        const id = nodeAt(g.x, g.y)
        if (id) {
          g.on = true
          setPeek({ id, x: g.x, y: g.y, touch: true })
        }
      }, PEEK_LONG_PRESS_MS)
      st = g
    }
    const onMove = (ev: TouchEvent) => {
      const g = st
      if (!g || ev.touches.length !== 1) return end()
      const t = ev.touches[0]
      g.x = t.clientX
      g.y = t.clientY
      if (g.on) {
        ev.preventDefault() // 보는 동안은 트리를 스크롤하지 않음
        const id = nodeAt(g.x, g.y)
        if (id) setPeek({ id, x: g.x, y: g.y, touch: true })
      } else if (Math.hypot(g.x - g.x0, g.y - g.y0) > 10) end() // 손가락으로 트리 스크롤
    }
    const onEnd = (ev: TouchEvent) => {
      if (st?.on) ev.preventDefault() // 보기만 하고 이동하지 않음
      end()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: false })
    el.addEventListener('touchcancel', end)
    return () => {
      end()
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', end)
    }
  }, [])

  // 트리가 바뀌어 사라진 노드의 미리 보기는 닫음
  const peekNode = peek && tree.nodes[peek.id] ? peek : null
  const currentPath = useMemo(() => new Set(pathTo(tree, currentId)), [tree, currentId])

  // 현재 수가 보이도록 자동 스크롤
  useEffect(() => {
    const el = scrollRef.current
    const p = layout.pos.get(currentId)
    if (!el || !p) return
    const x = PAD + p.col * DX
    const y = PAD + p.row * DY
    const margin = 60
    if (x < el.scrollLeft + margin || x > el.scrollLeft + el.clientWidth - margin) {
      el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' })
    }
    if (y < el.scrollTop + 20 || y > el.scrollTop + el.clientHeight - 20) {
      el.scrollTo({ top: Math.max(0, y - el.clientHeight / 2), behavior: 'smooth' })
    }
  }, [currentId, layout])

  const width = PAD * 2 + Math.max(0, layout.cols - 1) * DX
  const height = PAD * 2 + Math.max(0, layout.rows - 1) * DY

  const edges: ReactElement[] = []
  const nodes: ReactElement[] = []

  for (const [id, p] of layout.pos) {
    const node = tree.nodes[id]
    const x = PAD + p.col * DX
    const y = PAD + p.row * DY
    const onPath = currentPath.has(id)

    if (node.parentId) {
      const pp = layout.pos.get(node.parentId)!
      const px = PAD + pp.col * DX
      const py = PAD + pp.row * DY
      const d = pp.row === p.row ? `M${px},${py} L${x},${y}` : `M${px},${py} L${px},${y - DY} L${x},${y}`
      edges.push(<path key={`e${id}`} d={d} className={onPath ? s.edgeOn : s.edge} />)
    }

    const mv = nodeMove(tree, node)
    const isCurrent = id === currentId
    const commented = commentedIds?.has(id)
    let title: string
    let shape: ReactElement
    if (mv) {
      const n = moveNumber(tree, id)
      title = `${n}수 ${mv.color === 'B' ? '흑' : '백'} ${mv.point ? toDisplay(mv.point, tree.size) : '한 수 쉼'}${node.props.TE ? ' (정답)' : ''}${node.props.BM ? ' (오답)' : ''}`
      shape = (
        <>
          <circle cx={x} cy={y} r={R} className={mv.color === 'B' ? s.black : s.white} />
          <text x={x} y={y} dy="0.35em" className={mv.color === 'B' ? s.numB : s.numW} fontSize={n >= 100 ? 8 : 9.5}>
            {mv.point ? n : '–'}
          </text>
        </>
      )
    } else {
      title = id === tree.rootId ? '처음 (초기 배치)' : '배치 변경'
      shape = (
        <rect x={x - R * 0.75} y={y - R * 0.75} width={R * 1.5} height={R * 1.5} rx={2} className={s.setup} />
      )
    }

    nodes.push(
      <g
        key={id}
        className={s.node}
        data-node-id={id}
        onClick={() => onSelect(id)}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' && peek?.id !== id) setPeek({ id, x: e.clientX, y: e.clientY, touch: false })
        }}
      >
        <title>{title}</title>
        <circle cx={x} cy={y} r={R + 4} fill="transparent" />
        {isCurrent && <circle cx={x} cy={y} r={R + 3.5} className={s.current} />}
        {shape}
        {node.props.TE && <circle cx={x} cy={y} r={R + 3.5} className={s.good} />}
        {node.props.BM && <circle cx={x} cy={y} r={R + 3.5} className={s.bad} />}
        {commented && <circle cx={x + R * 0.78} cy={y - R * 0.78} r={3.6} className={s.badge} />}
      </g>,
    )
  }

  return (
    <div ref={scrollRef} className={s.scroll} onScroll={() => peekNode?.touch || setPeek(null)}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className={s.svg}
        role="tree"
        aria-label="수순 트리"
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPeek(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g>{edges}</g>
        <g>{nodes}</g>
      </svg>
      {peekNode && <PeekBoard tree={tree} peek={peekNode} box={scrollRef.current?.getBoundingClientRect() ?? null} />}
    </div>
  )
})

/** 미리 보기 판: 마우스는 옆에, 손가락은 트리 위쪽(자리가 없으면 손가락 옆)에 띄움 */
function PeekBoard({ tree, peek, box }: { tree: GameTree; peek: Peek; box: DOMRect | null }) {
  const board = useMemo(() => positionAt(tree, peek.id), [tree, peek.id])
  const w = Math.round(Math.min(200, window.innerWidth * 0.5))
  const h = w + 26
  let left = peek.x - w - 16
  let top = peek.y - h / 2
  if (peek.touch && box && box.top - h - 8 >= 8) {
    left = peek.x - w / 2
    top = box.top - h - 8
  } else if (left < 8) left = peek.x + 16
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left))
  top = Math.max(8, Math.min(window.innerHeight - h - 8, top))
  const label = peek.id === tree.rootId ? '처음' : nodeMove(tree, tree.nodes[peek.id]) ? `${moveNumber(tree, peek.id)}수` : '배치 변경'
  return (
    <div className={s.peek} style={{ left, top, width: w }} aria-hidden>
      <GoBoard board={board} lastMove={lastMovePoint(tree, peek.id)} showCoords={false} />
      <span className={s.peekText}>{label}</span>
    </div>
  )
}
