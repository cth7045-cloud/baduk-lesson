import { describe, expect, it } from 'vitest'
import { fromDisplay } from '../coords'
import { judgeMove, summarizeProblem } from '../problem/grader'
import { importSgf } from '../sgf/convert'

//  정답 1: 흑 B9 → 백 C9 → 흑 A8 (끝)
//  정답 2: 흑 B8 → 백 A9 (TE 표시로 완료)
//  오답  : 흑 C8 (BM) → 백 B9 (응징)
const SGF = `(;SZ[9]PL[B]AB[da][db][cc][dc]AW[ea][eb][ec][ed][cd][dd][bd]GC[흑선 활]
(;B[ba]C[정답 첫 수];W[ca];B[ab]C[살았습니다])
(;B[bb];W[aa]TE[1]C[이것도 정답])
(;B[cb]BM[1]C[이 수는 늦습니다];W[ba]))`

const P = (c: string) => fromDisplay(c, 9)!

describe('문제 채점', () => {
  const { tree } = importSgf(SGF)
  const root = tree.rootId

  it('정답 수를 두면 상대가 응수하고 계속, 마지막 수에서 정답', () => {
    const v1 = judgeMove(tree, root, P('B9'))
    expect(v1.kind).toBe('continue')
    if (v1.kind !== 'continue') return
    const v2 = judgeMove(tree, v1.responseId, P('A8'))
    expect(v2.kind).toBe('solved')
  })

  it('상대 응수가 정답 표시(TE)면 그 자리에서 정답', () => {
    const v = judgeMove(tree, root, P('B8'))
    expect(v.kind).toBe('solved')
    if (v.kind === 'solved') expect(v.responseId).not.toBeNull()
  })

  it('오답 표시(BM) 수는 오답이고 응징 수를 돌려준다', () => {
    const v = judgeMove(tree, root, P('C8'))
    expect(v.kind).toBe('wrong')
    if (v.kind === 'wrong') expect(v.responseId).not.toBeNull()
  })

  it('수순에 없는 수는 예상 밖의 수', () => {
    expect(judgeMove(tree, root, P('A1')).kind).toBe('unexpected')
  })

  it('이미 돌이 있는 곳은 둘 수 없다', () => {
    expect(judgeMove(tree, root, P('D9'))).toEqual({ kind: 'illegal', error: 'occupied' })
  })

  it('정답 수순 2개, 오답 1개로 요약된다', () => {
    expect(summarizeProblem(tree)).toEqual({ correctLines: 2, wrongMoves: 1 })
  })
})
