import type { GameTree } from '../../go/tree/gameTree'

export interface TreeLayout {
  pos: Map<string, { col: number; row: number }>
  cols: number
  rows: number
}

/**
 * 수순 트리 배치 계산.
 * - 첫 자식(본선)은 같은 줄에서 오른쪽으로 이어짐
 * - 다른 변화는 아래쪽 빈 줄을 찾아 배치 (겹치지 않게 최대한 위로 붙임)
 * - 뒤쪽 수의 변화부터 배치해야 연결선이 다른 노드와 겹치지 않음
 */
export function layoutTree(tree: GameTree): TreeLayout {
  const pos = new Map<string, { col: number; row: number }>()
  const occupied: [number, number][][] = []
  let cols = 0
  let rows = 0

  const isFree = (row: number, a: number, b: number) =>
    !(occupied[row] ?? []).some(([x, y]) => a <= y && b >= x)
  const mark = (row: number, a: number, b: number) => {
    ;(occupied[row] ??= []).push([a, b])
  }

  const chainFrom = (id: string): string[] => {
    const chain = [id]
    let cur = tree.nodes[id]
    while (cur && cur.children.length) {
      chain.push(cur.children[0])
      cur = tree.nodes[cur.children[0]]
    }
    return chain
  }

  // 재귀 대신 작업 목록 사용 (깊이가 깊어도 안전)
  type Job = { id: string; col: number; minRow: number }
  const jobs: Job[] = [{ id: tree.rootId, col: 0, minRow: 0 }]
  while (jobs.length) {
    const { id, col, minRow } = jobs.pop()!
    const chain = chainFrom(id)
    const start = col === 0 ? 0 : col - 1 // 연결선 자리까지 확보
    const end = col + chain.length - 1
    let row = minRow
    while (!isFree(row, start, end)) row++
    mark(row, start, end)
    chain.forEach((cid, i) => pos.set(cid, { col: col + i, row }))
    cols = Math.max(cols, end + 1)
    rows = Math.max(rows, row + 1)

    // 이 줄에서 갈라지는 변화들: 뒤쪽 수부터 처리되도록, 형제끼리는 순서 유지
    const branchJobs: Job[] = []
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = tree.nodes[chain[i]]
      for (const child of node.children.slice(1)) {
        branchJobs.push({ id: child, col: col + i + 1, minRow: row + 1 })
      }
    }
    // 스택이므로 먼저 처리할 것을 마지막에 넣음
    for (let i = branchJobs.length - 1; i >= 0; i--) jobs.push(branchJobs[i])
  }
  return { pos, cols, rows }
}
