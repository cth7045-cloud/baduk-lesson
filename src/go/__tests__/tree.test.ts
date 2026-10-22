import { describe, expect, it } from 'vitest'
import { fromDisplay } from '../coords'
import { newGame } from '../sgf/convert'
import { editStone, playMove, promoteToMainLine, toggleArrow, toggleLabel, toggleShape } from '../tree/edit'
import { getNode, lineEnd, moveNumber, nextColor, pathTo, type GameTree } from '../tree/gameTree'
import { applyOps } from '../tree/ops'
import { moveNumbersOnBoard, positionAt } from '../tree/position'

function play(tree: GameTree, nodeId: string, coord: string): { tree: GameTree; nodeId: string } {
  const color = nextColor(tree, nodeId)
  const r = playMove(tree, nodeId, color, fromDisplay(coord, tree.size))
  if (!r.ok) throw new Error(r.error)
  return { tree: applyOps(tree, r.ops), nodeId: r.nodeId }
}

describe('수순 트리', () => {
  it('흑백이 번갈아 두고 수 번호가 매겨진다', () => {
    let t = newGame(9)
    let id = t.rootId
    ;({ tree: t, nodeId: id } = play(t, id, 'E5'))
    ;({ tree: t, nodeId: id } = play(t, id, 'C3'))
    expect(moveNumber(t, id)).toBe(2)
    expect(nextColor(t, id)).toBe('B')
    expect(positionAt(t, id).get(fromDisplay('E5', 9)!)).toBe(1)
    expect(positionAt(t, id).get(fromDisplay('C3', 9)!)).toBe(2)
  })

  it('같은 자리에 다시 두면 기존 변화로 이동하고, 다른 수는 변화도가 된다', () => {
    let t = newGame(9)
    const root = t.rootId
    const a = play(t, root, 'E5')
    t = a.tree
    const again = playMove(t, root, 'B', fromDisplay('E5', 9))
    expect(again.ok && again.ops.length === 0 && again.nodeId === a.nodeId).toBe(true)
    const b = play(t, root, 'C3')
    t = b.tree
    expect(getNode(t, root).children).toEqual([a.nodeId, b.nodeId])
    // 변화도를 본선으로 올리기
    t = applyOps(t, promoteToMainLine(t, b.nodeId))
    expect(getNode(t, root).children[0]).toBe(b.nodeId)
    expect(lineEnd(t, root)).toBe(b.nodeId)
  })

  it('패 금지가 트리에서도 적용된다', () => {
    // 9줄 판에 패 모양 배치
    let t = newGame(9)
    let id = t.rootId
    const stones: [string, 'B' | 'W'][] = [
      ['B8', 'B'], ['A7', 'B'], ['B6', 'B'],
      ['C8', 'W'], ['D7', 'W'], ['C6', 'W'], ['B7', 'W'],
    ]
    for (const [c, color] of stones) {
      const r = editStone(t, id, fromDisplay(c, 9)!, color)
      if (!r.ok) throw new Error()
      t = applyOps(t, r.ops)
      id = r.nodeId
    }
    // 흑 C7로 백 B7을 따냄
    const cap = playMove(t, id, 'B', fromDisplay('C7', 9))
    expect(cap.ok).toBe(true)
    if (!cap.ok) return
    t = applyOps(t, cap.ops)
    expect(positionAt(t, cap.nodeId).get(fromDisplay('B7', 9)!)).toBe(0)
    // 백이 바로 B7에 되따내기 → 금지
    const retake = playMove(t, cap.nodeId, 'W', fromDisplay('B7', 9))
    expect(retake).toEqual({ ok: false, error: 'ko' })
  })

  it('배치 도구는 착수 다음에 새 노드를 만들고, 다시 누르면 지운다', () => {
    let t = newGame(9)
    const a = play(t, t.rootId, 'E5')
    t = a.tree
    const r = editStone(t, a.nodeId, fromDisplay('A1', 9)!, 'W')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.nodeId).not.toBe(a.nodeId)
    t = applyOps(t, r.ops)
    expect(positionAt(t, r.nodeId).get(fromDisplay('A1', 9)!)).toBe(2)
    const r2 = editStone(t, r.nodeId, fromDisplay('A1', 9)!, 'W')
    if (!r2.ok) throw new Error()
    t = applyOps(t, r2.ops)
    expect(positionAt(t, r2.nodeId).get(fromDisplay('A1', 9)!)).toBe(0)
    expect(getNode(t, r2.nodeId).props.AW).toBeUndefined()
    // 앞선 수의 돌 지우기 → AE
    const r3 = editStone(t, r2.nodeId, fromDisplay('E5', 9)!, null)
    if (!r3.ok) throw new Error()
    t = applyOps(t, r3.ops)
    expect(positionAt(t, r3.nodeId).get(fromDisplay('E5', 9)!)).toBe(0)
    expect(getNode(t, r3.nodeId).props.AE).toEqual(['ee'])
  })

  it('표시 도구는 토글되고 한 점에 하나만 남는다', () => {
    let t = newGame(9)
    const id = t.rootId
    const p = fromDisplay('C3', 9)!
    t = applyOps(t, toggleShape(t, id, p, 'TR'))
    expect(getNode(t, id).props.TR).toEqual(['cg'])
    t = applyOps(t, toggleLabel(t, id, p))
    expect(getNode(t, id).props.TR).toBeUndefined()
    expect(getNode(t, id).props.LB).toEqual(['cg:A'])
    t = applyOps(t, toggleLabel(t, id, fromDisplay('D4', 9)!))
    expect(getNode(t, id).props.LB).toEqual(['cg:A', 'df:B'])
    t = applyOps(t, toggleLabel(t, id, p))
    expect(getNode(t, id).props.LB).toEqual(['df:B'])
    t = applyOps(t, toggleArrow(t, id, p, fromDisplay('E5', 9)!))
    expect(getNode(t, id).props.AR).toEqual(['cg:ee'])
    t = applyOps(t, toggleArrow(t, id, p, fromDisplay('E5', 9)!))
    expect(getNode(t, id).props.AR).toBeUndefined()
  })

  it('따낸 돌 자리에는 수 번호를 표시하지 않는다', () => {
    let t = newGame(9)
    let id = t.rootId
    for (const c of ['A2', 'A1', 'B1']) ({ tree: t, nodeId: id } = play(t, id, c))
    const nums = moveNumbersOnBoard(t, id)
    expect([...nums.values()].sort()).toEqual([1, 3])
    expect(pathTo(t, id)).toHaveLength(4)
  })
})
