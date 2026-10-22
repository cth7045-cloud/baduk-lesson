import { expandSgfPoints, fromSgf } from '../coords'
import { BoardState, colorToCell, type Cell } from '../rules/board'
import type { Point } from '../types'
import { getNode, nodeMove, pathTo, type GameNode, type GameTree } from './gameTree'

/**
 * 노드 시점의 판 상태 계산.
 * 같은 트리 객체에 대해서는 결과를 기억해 두었다가 재사용(수순 이동이 빠르도록).
 */
const cache = new WeakMap<GameTree['nodes'], Map<string, BoardState>>()

function applyNode(tree: GameTree, board: BoardState, node: GameNode, koBoard: BoardState | null): BoardState {
  let b = board
  const setup: { p: Point; cell: Cell }[] = []
  for (const p of expandSgfPoints(node.props.AE ?? [], tree.size)) setup.push({ p, cell: 0 })
  for (const p of expandSgfPoints(node.props.AB ?? [], tree.size)) setup.push({ p, cell: 1 })
  for (const p of expandSgfPoints(node.props.AW ?? [], tree.size)) setup.push({ p, cell: 2 })
  if (setup.length) b = b.setStones(setup)

  const mv = nodeMove(tree, node)
  if (mv?.point) {
    const r = b.play(mv.point, mv.color, koBoard)
    // 불러온 기보에 규칙상 맞지 않는 수가 있어도 그대로 보여 줌
    b = r.ok ? r.board : b.setStones([{ p: mv.point, cell: colorToCell(mv.color) }])
  }
  return b
}

export function positionAt(tree: GameTree, id: string): BoardState {
  let map = cache.get(tree.nodes)
  if (!map) {
    map = new Map()
    cache.set(tree.nodes, map)
  }
  const hit = map.get(id)
  if (hit) return hit

  const path = pathTo(tree, id)
  // 이미 계산된 가장 가까운 조상부터 이어서 계산
  let start = path.length - 1
  while (start >= 0 && !map.has(path[start])) start--
  let board = start >= 0 ? map.get(path[start])! : BoardState.empty(tree.size)
  for (let i = start + 1; i < path.length; i++) {
    const node = getNode(tree, path[i])
    board = applyNode(tree, board, node, null)
    map.set(path[i], board)
  }
  return board
}

/** 판 위에 남아 있는 돌들의 수 번호 (수순 번호 표시용) */
export function moveNumbersOnBoard(tree: GameTree, id: string): Map<number, number> {
  const board = positionAt(tree, id)
  const nums = new Map<number, number>()
  let n = 0
  for (const nid of pathTo(tree, id)) {
    const node = getNode(tree, nid)
    const mv = nodeMove(tree, node)
    if (!mv) continue
    n++
    if (mv.point) nums.set(mv.point.y * tree.size + mv.point.x, n)
  }
  for (const [idx] of nums) {
    if (board.cells[idx] === 0) nums.delete(idx)
  }
  return nums
}

/** 마지막 착수 위치 (표시용) */
export function lastMovePoint(tree: GameTree, id: string): Point | null {
  const node = getNode(tree, id)
  const v = node.props.B?.[0] ?? node.props.W?.[0]
  return v === undefined ? null : fromSgf(v, tree.size)
}
