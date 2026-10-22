import { toSgf } from '../coords'
import type { PlayError } from '../rules/board'
import { findChildWithMove, getNode, nextColor, type GameNode, type GameTree } from '../tree/gameTree'
import { positionAt } from '../tree/position'
import type { Point } from '../types'

/*
 * 사활·수읽기 문제 자동 채점.
 *
 * 문제 = SGF 트리 하나
 *  - 루트: 초기 배치(AB/AW) + 둘 차례(PL)
 *  - 학생 수 → 그 다음 첫 자식 = 상대 응수 → 학생 수 → ...
 *  - 오답 수: 표준 "나쁜 수" 표시 BM. 그 첫 자식이 있으면 상대의 응징 수로 자동으로 둠
 *  - 정답 완료: 표준 "좋은 수" 표시 TE 가 붙은 수, 또는 수순의 끝(자식 없음)에 도달
 *  - 트리에 없는 수: 예상 밖의 수 = 오답
 */

export type Verdict =
  /** 맞는 수. 상대 응수(responseId)를 두고 계속 */
  | { kind: 'continue'; studentNodeId: string; responseId: string }
  /** 문제 해결 */
  | { kind: 'solved'; studentNodeId: string; responseId: string | null }
  /** 오답 표시된 수 (응징 수가 있으면 responseId) */
  | { kind: 'wrong'; studentNodeId: string; responseId: string | null }
  /** 수순에 없는 수 */
  | { kind: 'unexpected' }
  /** 둘 수 없는 자리 (이미 돌 있음, 자충, 패) */
  | { kind: 'illegal'; error: PlayError }

export function isWrongNode(node: GameNode): boolean {
  return !!node.props.BM
}

export function isCorrectEnd(node: GameNode): boolean {
  return !!node.props.TE || node.children.length === 0
}

/** 문제 트리의 nodeId 시점에서 학생이 point 에 두었을 때의 판정 */
export function judgeMove(problem: GameTree, nodeId: string, point: Point): Verdict {
  const color = nextColor(problem, nodeId)
  const board = positionAt(problem, nodeId)
  const node = getNode(problem, nodeId)
  const koBoard = node.parentId && (node.props.B || node.props.W) ? positionAt(problem, node.parentId) : null
  const legal = board.play(point, color, koBoard)
  if (!legal.ok) return { kind: 'illegal', error: legal.error }

  const childId = findChildWithMove(problem, nodeId, color, toSgf(point))
  if (!childId) return { kind: 'unexpected' }
  const child = getNode(problem, childId)
  const responseId = child.children[0] ?? null

  if (isWrongNode(child)) return { kind: 'wrong', studentNodeId: childId, responseId }
  if (child.props.TE || !responseId) return { kind: 'solved', studentNodeId: childId, responseId: null }
  const response = getNode(problem, responseId)
  if (isCorrectEnd(response)) return { kind: 'solved', studentNodeId: childId, responseId }
  return { kind: 'continue', studentNodeId: childId, responseId }
}

/** 문제 요약: 정답·오답 수순 개수 (출제 화면 안내용) */
export function summarizeProblem(problem: GameTree): { correctLines: number; wrongMoves: number } {
  let correctLines = 0
  let wrongMoves = 0
  const stack = [problem.rootId]
  while (stack.length) {
    const id = stack.pop()!
    const n = getNode(problem, id)
    if (isWrongNode(n)) {
      wrongMoves++
      continue
    }
    if (id !== problem.rootId && isCorrectEnd(n)) {
      correctLines++
      if (n.props.TE) continue
    }
    stack.push(...n.children)
  }
  return { correctLines, wrongMoves }
}
