import { useCallback, useMemo, useReducer, useRef } from 'react'
import { getNode, hasNode, pathTo, type GameTree } from '../../go/tree/gameTree'
import { applyOps, type TreeOp } from '../../go/tree/ops'

/*
 * 바둑판 편집 상태(수순 트리 + 지금 보고 있는 수)를 관리하는 훅.
 * 모든 화면(연습판, 수업방, 과제, 자료실, 제출함)이 같은 훅을 씀.
 */

interface State {
  tree: GameTree
  currentId: string
  /** 부모 노드별로 마지막에 들어갔던 자식 (앞으로 가기 때 그 변화로 돌아가기 위함) */
  lastChild: Record<string, string>
}

type Action =
  | { type: 'apply'; ops: TreeOp[]; nodeId?: string }
  | { type: 'goto'; id: string }
  | { type: 'replace'; tree: GameTree; nodeId?: string }

function rememberPath(state: State, tree: GameTree, id: string): Record<string, string> {
  const path = pathTo(tree, id)
  const lastChild = { ...state.lastChild }
  for (let i = 1; i < path.length; i++) lastChild[path[i - 1]] = path[i]
  return lastChild
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'apply': {
      const tree = applyOps(state.tree, action.ops)
      let currentId = action.nodeId && hasNode(tree, action.nodeId) ? action.nodeId : state.currentId
      if (!hasNode(tree, currentId)) {
        // 보고 있던 수가 지워졌으면 남아 있는 가장 가까운 앞 수로
        const oldPath = pathTo(state.tree, state.currentId)
        currentId = [...oldPath].reverse().find((id) => hasNode(tree, id)) ?? tree.rootId
      }
      return { tree, currentId, lastChild: rememberPath(state, tree, currentId) }
    }
    case 'goto':
      if (!hasNode(state.tree, action.id) || action.id === state.currentId) return state
      return { ...state, currentId: action.id, lastChild: rememberPath(state, state.tree, action.id) }
    case 'replace': {
      const currentId = action.nodeId && hasNode(action.tree, action.nodeId) ? action.nodeId : action.tree.rootId
      return { tree: action.tree, currentId, lastChild: {} }
    }
  }
}

export interface GameEditor {
  tree: GameTree
  currentId: string
  /** 연산 적용 (내 편집). onOps로 바깥(저장·실시간 전송)에 알림 */
  apply: (ops: TreeOp[], nodeId?: string) => void
  /** 다른 사람이 보낸 연산 적용 (다시 내보내지 않음) */
  applyRemote: (ops: TreeOp[]) => void
  replace: (tree: GameTree, nodeId?: string) => void
  goTo: (id: string) => void
  back: (n?: number) => void
  forward: (n?: number) => void
  first: () => void
  last: () => void
  /** 같은 부모의 다른 변화로 (dir: -1 위, +1 아래) */
  switchVariation: (dir: -1 | 1) => void
  canBack: boolean
  canForward: boolean
}

export function useGameEditor(
  initial: GameTree | (() => GameTree),
  /** 내 편집이 일어날 때마다 호출 (nodeId = 편집 후 보고 있는 수) */
  onOps?: (ops: TreeOp[], nodeId?: string) => void,
): GameEditor {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const tree = typeof initial === 'function' ? initial() : initial
    return { tree, currentId: tree.rootId, lastChild: {} }
  })
  const onOpsRef = useRef(onOps)
  onOpsRef.current = onOps
  const stateRef = useRef(state)
  stateRef.current = state

  const apply = useCallback((ops: TreeOp[], nodeId?: string) => {
    dispatch({ type: 'apply', ops, nodeId })
    if (ops.length) onOpsRef.current?.(ops, nodeId)
  }, [])
  const applyRemote = useCallback((ops: TreeOp[]) => dispatch({ type: 'apply', ops }), [])
  const replace = useCallback((tree: GameTree, nodeId?: string) => dispatch({ type: 'replace', tree, nodeId }), [])
  const goTo = useCallback((id: string) => dispatch({ type: 'goto', id }), [])

  const nextChild = (st: State, id: string): string | null => {
    const node = st.tree.nodes[id]
    if (!node?.children.length) return null
    const remembered = st.lastChild[id]
    return remembered && node.children.includes(remembered) ? remembered : node.children[0]
  }

  const back = useCallback((n = 1) => {
    const st = stateRef.current
    let id = st.currentId
    for (let i = 0; i < n; i++) {
      const p = st.tree.nodes[id]?.parentId
      if (!p) break
      id = p
    }
    dispatch({ type: 'goto', id })
  }, [])

  const forward = useCallback((n = 1) => {
    const st = stateRef.current
    let id = st.currentId
    for (let i = 0; i < n; i++) {
      const c = nextChild(st, id)
      if (!c) break
      id = c
    }
    dispatch({ type: 'goto', id })
  }, [])

  const first = useCallback(() => dispatch({ type: 'goto', id: stateRef.current.tree.rootId }), [])
  const last = useCallback(() => forward(100000), [forward])

  const switchVariation = useCallback((dir: -1 | 1) => {
    const st = stateRef.current
    // 현재 수 또는 가장 가까운 앞 수 중 형제가 있는 곳에서 바꿈
    let id = st.currentId
    let depthBelow = 0
    for (;;) {
      const node = st.tree.nodes[id]
      if (!node?.parentId) return
      const siblings = getNode(st.tree, node.parentId).children
      if (siblings.length > 1) {
        const idx = siblings.indexOf(id)
        const next = siblings[idx + dir]
        if (!next) return
        // 원래 보던 깊이만큼 새 변화에서도 따라 내려감
        let target = next
        for (let i = 0; i < depthBelow; i++) {
          const c = st.tree.nodes[target]?.children[0]
          if (!c) break
          target = c
        }
        dispatch({ type: 'goto', id: target })
        return
      }
      id = node.parentId
      depthBelow++
    }
  }, [])

  const node = state.tree.nodes[state.currentId]
  return useMemo(
    () => ({
      tree: state.tree,
      currentId: state.currentId,
      apply,
      applyRemote,
      replace,
      goTo,
      back,
      forward,
      first,
      last,
      switchVariation,
      canBack: !!node?.parentId,
      canForward: !!node?.children.length,
    }),
    [state.tree, state.currentId, node, apply, applyRemote, replace, goTo, back, forward, first, last, switchVariation],
  )
}
