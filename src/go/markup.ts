import { expandSgfPoints, fromSgf } from './coords'
import type { ShapeKind } from './tree/edit'
import type { GameNode } from './tree/gameTree'
import type { Point } from './types'

export interface NodeMarkup {
  shapes: { p: Point; kind: ShapeKind }[]
  labels: { p: Point; text: string }[]
  arrows: { from: Point; to: Point }[]
}

/** 노드 속성에서 판 위 표시(도형·글자·화살표)를 꺼냄 */
export function nodeMarkup(node: GameNode, size: number): NodeMarkup {
  const shapes: NodeMarkup['shapes'] = []
  for (const kind of ['TR', 'CR', 'SQ', 'MA'] as const) {
    for (const p of expandSgfPoints(node.props[kind] ?? [], size)) shapes.push({ p, kind })
  }
  const labels: NodeMarkup['labels'] = []
  for (const v of node.props.LB ?? []) {
    const idx = v.indexOf(':')
    if (idx < 0) continue
    const p = fromSgf(v.slice(0, idx), size)
    if (p) labels.push({ p, text: v.slice(idx + 1) })
  }
  const arrows: NodeMarkup['arrows'] = []
  for (const v of node.props.AR ?? []) {
    const [a, b] = v.split(':')
    const from = fromSgf(a ?? '', size)
    const to = fromSgf(b ?? '', size)
    if (from && to) arrows.push({ from, to })
  }
  return { shapes, labels, arrows }
}
