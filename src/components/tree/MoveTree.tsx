import { memo, useEffect, useMemo, useRef, type ReactElement } from 'react'
import { toDisplay } from '../../go/coords'
import { moveNumber, nodeMove, pathTo, type GameTree } from '../../go/tree/gameTree'
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

/** 수순 트리: 본선은 가로로, 변화도는 아래 줄로 갈라짐. 눌러서 해당 수로 이동 */
export const MoveTree = memo(function MoveTree({ tree, currentId, commentedIds, onSelect }: Props) {
  const layout = useMemo(() => layoutTree(tree), [tree])
  const scrollRef = useRef<HTMLDivElement>(null)
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
      <g key={id} className={s.node} onClick={() => onSelect(id)}>
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
    <div ref={scrollRef} className={s.scroll}>
      <svg width={width} height={height} className={s.svg} role="tree" aria-label="수순 트리">
        <g>{edges}</g>
        <g>{nodes}</g>
      </svg>
    </div>
  )
})
