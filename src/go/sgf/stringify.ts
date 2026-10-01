import type { SgfNode } from './parse'

export function escapeSgfValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/]/g, '\\]')
}

// 루트 노드에서 보기 좋은 순서
const ROOT_ORDER = ['GM', 'FF', 'CA', 'AP', 'SZ', 'KM', 'HA', 'RU', 'GN', 'EV', 'DT', 'PB', 'BR', 'PW', 'WR', 'RE']

function nodeToString(node: SgfNode, isRoot: boolean): string {
  const keys = Object.keys(node.props)
  if (isRoot) {
    keys.sort((a, b) => {
      const ia = ROOT_ORDER.indexOf(a)
      const ib = ROOT_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  }
  let s = ';'
  for (const k of keys) {
    const vals = node.props[k]
    if (!vals.length) continue
    s += k + vals.map((v) => '[' + escapeSgfValue(v) + ']').join('')
  }
  return s
}

/** SgfNode 트리를 SGF 텍스트로. 재귀 없이 처리 */
export function stringifySgf(roots: SgfNode[]): string {
  type Frame = { kind: 'open' } | { kind: 'close' } | { kind: 'seq'; node: SgfNode; isRoot: boolean }
  let out = ''
  for (const root of roots) {
    const stack: Frame[] = [{ kind: 'close' }, { kind: 'seq', node: root, isRoot: true }, { kind: 'open' }]
    let nodesOnLine = 0
    while (stack.length) {
      const f = stack.pop()!
      if (f.kind === 'open') {
        if (out && !out.endsWith('\n')) out += '\n'
        out += '('
        nodesOnLine = 0
        continue
      }
      if (f.kind === 'close') {
        out += ')'
        continue
      }
      // 한 수순(외길로 이어지는 노드들) 출력
      let node: SgfNode | undefined = f.node
      let isRoot = f.isRoot
      while (node) {
        out += nodeToString(node, isRoot)
        if (isRoot || ++nodesOnLine >= 10) {
          out += '\n'
          nodesOnLine = 0
        }
        isRoot = false
        if (node.children.length === 1) {
          node = node.children[0]
        } else {
          // 분기: 자식마다 괄호로 감쌈 (역순으로 쌓아야 순서대로 출력됨)
          for (let c = node.children.length - 1; c >= 0; c--) {
            stack.push({ kind: 'close' }, { kind: 'seq', node: node.children[c], isRoot: false }, { kind: 'open' })
          }
          node = undefined
        }
      }
    }
    out += '\n'
  }
  return out
}
