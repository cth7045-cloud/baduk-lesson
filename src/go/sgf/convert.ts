import { createTree, newNodeId, type GameNode, type GameTree } from '../tree/gameTree'
import { parseSgf, type SgfNode } from './parse'
import { stringifySgf } from './stringify'

/** 내부 저장용 노드 ID 속성 이름 (SGF 규격상 다른 프로그램은 모르는 속성을 무시함) */
export const NODE_ID_PROP = 'XID'

export const MIN_SIZE = 2
export const MAX_SIZE = 25

export interface ImportedGame {
  tree: GameTree
  /** 노드 ID → 기보 파일 안에 있던 코멘트(C) */
  nodeComments: Record<string, string>
  /** 루트의 GC (대국 설명) → 판 전체 메모 */
  gameComment: string
}

/** SGF 텍스트 → 수순 트리 + 코멘트. 파일에 대국이 여러 개면 첫 번째만 */
export function importSgf(text: string): ImportedGame {
  const [root] = parseSgf(text)
  const sz = Number.parseInt(root.props.SZ?.[0] ?? '19', 10)
  const size = Number.isFinite(sz) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, sz)) : 19

  const tree: GameTree = { rootId: '', size, nodes: {} }
  const nodeComments: Record<string, string> = {}
  let gameComment = ''
  const used = new Set<string>()

  const stack: { sgf: SgfNode; parentId: string | null }[] = [{ sgf: root, parentId: null }]
  while (stack.length) {
    const { sgf, parentId } = stack.pop()!
    const props = { ...sgf.props }
    let id = props[NODE_ID_PROP]?.[0]
    if (!id || used.has(id)) id = newNodeId()
    used.add(id)
    delete props[NODE_ID_PROP]

    const comment = props.C?.join('\n').trim()
    delete props.C
    if (comment) nodeComments[id] = comment
    if (!parentId) {
      gameComment = props.GC?.join('\n').trim() ?? ''
      delete props.GC
    }

    const node: GameNode = { id, parentId, children: [], props }
    tree.nodes[id] = node
    if (parentId) tree.nodes[parentId].children.push(id)
    else tree.rootId = id
    // 자식 순서를 지키기 위해 역순으로 쌓음
    for (let i = sgf.children.length - 1; i >= 0; i--) stack.push({ sgf: sgf.children[i], parentId: id })
  }
  return { tree, nodeComments, gameComment }
}

export interface ExportOptions {
  nodeComments?: Record<string, string>
  gameComment?: string
  /** true면 내부 노드 ID를 남김 (DB 저장용). 파일 내보내기에는 false */
  keepIds?: boolean
}

/** 수순 트리 + 코멘트 → SGF 텍스트. 코멘트는 C, 판 전체 메모는 루트의 GC로 들어감 */
export function exportSgf(tree: GameTree, opts: ExportOptions = {}): string {
  const toSgfNode = (id: string): SgfNode => {
    // 깊은 트리에서도 안전하도록 재귀 대신 반복
    const rootOut: SgfNode = { props: {}, children: [] }
    const stack: { id: string; out: SgfNode }[] = [{ id, out: rootOut }]
    while (stack.length) {
      const { id: cur, out } = stack.pop()!
      const node = tree.nodes[cur]
      const props: Record<string, string[]> = {}
      if (cur === tree.rootId) {
        props.GM = ['1']
        props.FF = ['4']
        props.CA = ['UTF-8']
        props.AP = ['BadukLesson:1']
        props.SZ = [String(tree.size)]
      }
      Object.assign(props, node.props)
      if (cur === tree.rootId) {
        props.CA = ['UTF-8']
        props.SZ = [String(tree.size)]
        if (opts.gameComment?.trim()) props.GC = [opts.gameComment.trim()]
      }
      const c = opts.nodeComments?.[cur]?.trim()
      if (c) props.C = [c]
      if (opts.keepIds) props[NODE_ID_PROP] = [cur]
      out.props = props
      out.children = node.children.map(() => ({ props: {}, children: [] }))
      node.children.forEach((cid, i) => stack.push({ id: cid, out: out.children[i] }))
    }
    return rootOut
  }
  return stringifySgf([toSgfNode(tree.rootId)])
}

/** 빈 판 */
export function newGame(size: number): GameTree {
  return createTree(size, { GM: ['1'], FF: ['4'], SZ: [String(size)] })
}
