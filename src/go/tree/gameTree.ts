import { fromSgf } from '../coords'
import type { Color, Point } from '../types'

/**
 * 수순 트리의 노드 하나.
 * props는 SGF 속성 그대로(B, W, AB, AW, AE, TR, CR, SQ, MA, LB, AR, PL ...).
 * 코멘트(C)와 판 전체 메모(GC)는 여기에 두지 않고 따로 관리함 (설계 문서 3-1 참고).
 */
export interface GameNode {
  id: string
  parentId: string | null
  children: string[]
  props: Record<string, string[]>
}

export interface GameTree {
  rootId: string
  size: number
  nodes: Record<string, GameNode>
}

/**
 * 짧은 고유 ID. crypto.randomUUID는 https가 아닌 주소(같은 와이파이의 폰에서 접속 등)에서
 * 쓸 수 없으므로 getRandomValues를 사용.
 */
export function newNodeId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

export function createTree(size: number, rootProps: Record<string, string[]> = {}): GameTree {
  const id = newNodeId()
  return {
    rootId: id,
    size,
    nodes: { [id]: { id, parentId: null, children: [], props: { ...rootProps } } },
  }
}

export function getNode(tree: GameTree, id: string): GameNode {
  const n = tree.nodes[id]
  if (!n) throw new Error(`노드를 찾을 수 없음: ${id}`)
  return n
}

export function hasNode(tree: GameTree, id: string | null | undefined): id is string {
  return !!id && !!tree.nodes[id]
}

/** 루트부터 해당 노드까지의 ID 목록 */
export function pathTo(tree: GameTree, id: string): string[] {
  const path: string[] = []
  let cur: string | null = id
  while (cur) {
    path.push(cur)
    cur = tree.nodes[cur]?.parentId ?? null
  }
  return path.reverse()
}

export interface NodeMove {
  color: Color
  /** null이면 패스(한 수 쉼) */
  point: Point | null
}

export function nodeMove(tree: GameTree, node: GameNode): NodeMove | null {
  if (node.props.B) return { color: 'B', point: fromSgf(node.props.B[0] ?? '', tree.size) }
  if (node.props.W) return { color: 'W', point: fromSgf(node.props.W[0] ?? '', tree.size) }
  return null
}

export function isSetupNode(node: GameNode): boolean {
  return !!(node.props.AB || node.props.AW || node.props.AE)
}

/** 이 노드 다음에 둘 차례 */
export function nextColor(tree: GameTree, id: string): Color {
  let cur: GameNode | undefined = tree.nodes[id]
  while (cur) {
    if (cur.props.PL?.[0] === 'B' || cur.props.PL?.[0] === 'W') return cur.props.PL[0] as Color
    if (cur.props.B) return 'W'
    if (cur.props.W) return 'B'
    if (!cur.parentId) {
      // 접바둑: 루트에 흑 배치석만 있으면 백 차례
      const ha = Number(cur.props.HA?.[0] ?? 0)
      if (ha >= 2 && cur.props.AB && !cur.props.AW) return 'W'
      return 'B'
    }
    cur = tree.nodes[cur.parentId]
  }
  return 'B'
}

/** 루트부터 이 노드까지 둔 수의 개수 (= 이 노드의 수 번호) */
export function moveNumber(tree: GameTree, id: string): number {
  let count = 0
  let cur: GameNode | undefined = tree.nodes[id]
  while (cur) {
    if (cur.props.B || cur.props.W) count++
    cur = cur.parentId ? tree.nodes[cur.parentId] : undefined
  }
  return count
}

/** 첫 자식을 따라 끝까지 */
export function lineEnd(tree: GameTree, id: string): string {
  let cur = getNode(tree, id)
  while (cur.children.length) cur = getNode(tree, cur.children[0])
  return cur.id
}

/** 본선(첫 자식만 따라간 줄)에 속하는지 */
export function isOnMainLine(tree: GameTree, id: string): boolean {
  let cur = getNode(tree, id)
  while (cur.parentId) {
    const parent = getNode(tree, cur.parentId)
    if (parent.children[0] !== cur.id) return false
    cur = parent
  }
  return true
}

/** 부모 노드에서 같은 착수를 가진 자식이 있으면 그 ID */
export function findChildWithMove(tree: GameTree, parentId: string, color: Color, sgfPoint: string): string | null {
  const parent = getNode(tree, parentId)
  for (const cid of parent.children) {
    const v = tree.nodes[cid]?.props[color]
    if (v && (v[0] ?? '') === sgfPoint) return cid
  }
  return null
}

/** 서브트리의 모든 노드 ID (자기 자신 포함) */
export function subtreeIds(tree: GameTree, id: string): string[] {
  const out: string[] = []
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    const n = tree.nodes[cur]
    if (n) stack.push(...n.children)
  }
  return out
}
