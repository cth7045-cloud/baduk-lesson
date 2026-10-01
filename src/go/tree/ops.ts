import type { GameNode, GameTree } from './gameTree'
import { subtreeIds } from './gameTree'

/**
 * 트리 편집 연산. 모든 수정은 이 연산들로만 이루어짐.
 * 연산은 JSON으로 그대로 보낼 수 있어서, 3단계 실시간 수업방에서
 * 다른 사람 화면에 같은 연산을 적용하는 방식으로 동기화함.
 */
export type TreeOp =
  | { type: 'addNode'; parentId: string; id: string; props: Record<string, string[]>; index?: number }
  /** 값이 null인 속성은 삭제 */
  | { type: 'setProps'; nodeId: string; props: Record<string, string[] | null> }
  | { type: 'deleteNode'; nodeId: string }
  /** 형제들 사이에서 순서 바꾸기 (0 = 본선) */
  | { type: 'moveChild'; nodeId: string; index: number }
  | { type: 'replaceTree'; tree: GameTree }

/** 연산 적용. 원래 트리는 건드리지 않고 새 트리를 돌려줌. 적용 불가한 연산은 무시 */
export function applyOp(tree: GameTree, op: TreeOp): GameTree {
  switch (op.type) {
    case 'replaceTree':
      return op.tree
    case 'addNode': {
      const parent = tree.nodes[op.parentId]
      if (!parent || tree.nodes[op.id]) return tree
      const children = parent.children.slice()
      const idx = op.index === undefined ? children.length : Math.max(0, Math.min(op.index, children.length))
      children.splice(idx, 0, op.id)
      const node: GameNode = { id: op.id, parentId: op.parentId, children: [], props: { ...op.props } }
      return { ...tree, nodes: { ...tree.nodes, [op.parentId]: { ...parent, children }, [op.id]: node } }
    }
    case 'setProps': {
      const node = tree.nodes[op.nodeId]
      if (!node) return tree
      const props = { ...node.props }
      for (const [k, v] of Object.entries(op.props)) {
        if (v === null || v.length === 0) delete props[k]
        else props[k] = v
      }
      return { ...tree, nodes: { ...tree.nodes, [op.nodeId]: { ...node, props } } }
    }
    case 'deleteNode': {
      const node = tree.nodes[op.nodeId]
      if (!node || !node.parentId) return tree
      const parent = tree.nodes[node.parentId]
      const nodes = { ...tree.nodes }
      for (const id of subtreeIds(tree, op.nodeId)) delete nodes[id]
      nodes[parent.id] = { ...parent, children: parent.children.filter((c) => c !== op.nodeId) }
      return { ...tree, nodes }
    }
    case 'moveChild': {
      const node = tree.nodes[op.nodeId]
      if (!node || !node.parentId) return tree
      const parent = tree.nodes[node.parentId]
      const children = parent.children.filter((c) => c !== op.nodeId)
      children.splice(Math.max(0, Math.min(op.index, children.length)), 0, op.nodeId)
      return { ...tree, nodes: { ...tree.nodes, [parent.id]: { ...parent, children } } }
    }
  }
}

export function applyOps(tree: GameTree, ops: TreeOp[]): GameTree {
  return ops.reduce(applyOp, tree)
}
