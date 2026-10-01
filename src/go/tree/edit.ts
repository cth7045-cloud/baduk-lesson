import { expandSgfPoints, toSgf } from '../coords'
import { cellToColor, type PlayError, type Cell } from '../rules/board'
import type { Color, Point } from '../types'
import { findChildWithMove, getNode, newNodeId, nodeMove, type GameTree } from './gameTree'
import type { TreeOp } from './ops'
import { positionAt } from './position'

/*
 * 사용자 동작(착수, 표시, 배치 등)을 트리 연산(TreeOp) 목록으로 바꿔 주는 함수들.
 * 여기서는 트리를 직접 바꾸지 않고 "무엇을 바꿀지"만 계산함.
 */

export type EditResult =
  | { ok: true; ops: TreeOp[]; /** 편집 후 보고 있어야 할 노드 */ nodeId: string }
  | { ok: false; error: PlayError }

/** 착수 (point가 null이면 한 수 쉼). 같은 수가 이미 변화도에 있으면 그 수로 이동만 함 */
export function playMove(tree: GameTree, nodeId: string, color: Color, point: Point | null): EditResult {
  const sgf = point ? toSgf(point) : ''
  const existing = findChildWithMove(tree, nodeId, color, sgf)
  if (existing) return { ok: true, ops: [], nodeId: existing }

  if (point) {
    const node = getNode(tree, nodeId)
    const board = positionAt(tree, nodeId)
    // 패 판정: 직전 상대 수를 두기 전의 판과 같아지면 금지
    const koBoard = node.parentId && nodeMove(tree, node) ? positionAt(tree, node.parentId) : null
    const r = board.play(point, color, koBoard)
    if (!r.ok) return { ok: false, error: r.error }
  }
  const id = newNodeId()
  return { ok: true, ops: [{ type: 'addNode', parentId: nodeId, id, props: { [color]: [sgf] } }], nodeId: id }
}

function pointsWithout(values: string[] | undefined, size: number, p: Point): string[] {
  return expandSgfPoints(values ?? [], size)
    .filter((q) => q.x !== p.x || q.y !== p.y)
    .map(toSgf)
}

/**
 * 돌 배치·지우기 도구. 착수(B/W)가 있는 노드에서는 그 다음에 배치용 노드를 새로 만듦.
 * stone: 'B' | 'W' = 해당 색 놓기(이미 있으면 치움), null = 지우기
 */
export function editStone(tree: GameTree, nodeId: string, p: Point, stone: Color | null): EditResult {
  let targetId = nodeId
  const ops: TreeOp[] = []
  let node = getNode(tree, nodeId)

  const current = positionAt(tree, nodeId).get(p)
  const desired: Cell = stone === null ? 0 : current === (stone === 'B' ? 1 : 2) ? 0 : stone === 'B' ? 1 : 2
  if (desired === current) return { ok: true, ops: [], nodeId }

  if (nodeMove(tree, node)) {
    targetId = newNodeId()
    ops.push({ type: 'addNode', parentId: nodeId, id: targetId, props: {} })
    node = { id: targetId, parentId: nodeId, children: [], props: {} }
  }

  // 배치 노드 적용 이전(부모 시점)의 상태와 비교해서 필요한 속성만 남김
  const base: Cell = node.parentId ? positionAt(tree, node.parentId).get(p) : 0
  const AB = pointsWithout(node.props.AB, tree.size, p)
  const AW = pointsWithout(node.props.AW, tree.size, p)
  const AE = pointsWithout(node.props.AE, tree.size, p)
  if (desired !== base) {
    const c = cellToColor(desired)
    if (c === 'B') AB.push(toSgf(p))
    else if (c === 'W') AW.push(toSgf(p))
    else AE.push(toSgf(p))
  }
  ops.push({ type: 'setProps', nodeId: targetId, props: { AB, AW, AE } })
  return { ok: true, ops, nodeId: targetId }
}

export type ShapeKind = 'TR' | 'CR' | 'SQ' | 'MA'
const SHAPES: ShapeKind[] = ['TR', 'CR', 'SQ', 'MA']

function labelPoint(v: string): string {
  return v.split(':')[0]
}

/** 도형 표시 토글. 한 점에는 도형·글자 중 하나만 */
export function toggleShape(tree: GameTree, nodeId: string, p: Point, kind: ShapeKind): TreeOp[] {
  const node = getNode(tree, nodeId)
  const sp = toSgf(p)
  const had = expandSgfPoints(node.props[kind] ?? [], tree.size).some((q) => q.x === p.x && q.y === p.y)
  const props: Record<string, string[]> = {}
  for (const k of SHAPES) props[k] = pointsWithout(node.props[k], tree.size, p)
  props.LB = (node.props.LB ?? []).filter((v) => labelPoint(v) !== sp)
  if (!had) props[kind].push(sp)
  return [{ type: 'setProps', nodeId, props }]
}

/** 다음에 쓸 글자 (A, B, C ... 이미 쓴 글자는 건너뜀) */
export function nextLabel(tree: GameTree, nodeId: string): string {
  const used = new Set((getNode(tree, nodeId).props.LB ?? []).map((v) => v.split(':')[1]))
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  for (const ch of letters) if (!used.has(ch)) return ch
  return '?'
}

/** 글자 표시 토글 (이미 글자가 있으면 지움) */
export function toggleLabel(tree: GameTree, nodeId: string, p: Point, text?: string): TreeOp[] {
  const node = getNode(tree, nodeId)
  const sp = toSgf(p)
  const had = (node.props.LB ?? []).some((v) => labelPoint(v) === sp)
  const props: Record<string, string[]> = {}
  for (const k of SHAPES) props[k] = pointsWithout(node.props[k], tree.size, p)
  props.LB = (node.props.LB ?? []).filter((v) => labelPoint(v) !== sp)
  if (!had) props.LB.push(`${sp}:${text ?? nextLabel(tree, nodeId)}`)
  return [{ type: 'setProps', nodeId, props }]
}

/** 화살표 토글 (같은 화살표가 있으면 지움) */
export function toggleArrow(tree: GameTree, nodeId: string, from: Point, to: Point): TreeOp[] {
  if (from.x === to.x && from.y === to.y) return []
  const node = getNode(tree, nodeId)
  const key = `${toSgf(from)}:${toSgf(to)}`
  const list = node.props.AR ?? []
  const next = list.includes(key) ? list.filter((v) => v !== key) : [...list, key]
  return [{ type: 'setProps', nodeId, props: { AR: next } }]
}

/** 현재 수의 표시(도형·글자·화살표) 모두 지우기 */
export function clearMarkup(nodeId: string): TreeOp[] {
  return [{ type: 'setProps', nodeId, props: { TR: null, CR: null, SQ: null, MA: null, LB: null, AR: null } }]
}

/** 이 수를 본선(첫 번째 변화)으로 올리기 — 루트까지 거슬러 올라가며 모두 첫 자리로 */
export function promoteToMainLine(tree: GameTree, nodeId: string): TreeOp[] {
  const ops: TreeOp[] = []
  let cur = getNode(tree, nodeId)
  while (cur.parentId) {
    const parent = getNode(tree, cur.parentId)
    if (parent.children[0] !== cur.id) ops.push({ type: 'moveChild', nodeId: cur.id, index: 0 })
    cur = parent
  }
  return ops
}
