import { describe, expect, it } from 'vitest'
import { decodeSgfBytes } from '../sgf/encoding'
import { exportSgf, importSgf, NODE_ID_PROP } from '../sgf/convert'
import { parseSgf } from '../sgf/parse'
import { stringifySgf } from '../sgf/stringify'
import { getNode, lineEnd, moveNumber } from '../tree/gameTree'
import { positionAt } from '../tree/position'

const SAMPLE = `(;GM[1]FF[4]SZ[19]PB[이세돌]PW[알파고]GC[대국 총평]
;B[pd]C[좋은 출발 \\] 괄호 테스트];W[dd]
(;B[pq]C[본선];W[dp])
(;B[dp]C[변화도];W[pp]))`

describe('SGF', () => {
  it('속성, 이스케이프, 변화도를 읽는다', () => {
    const [root] = parseSgf(SAMPLE)
    expect(root.props.PB).toEqual(['이세돌'])
    const b1 = root.children[0]
    expect(b1.props.C).toEqual(['좋은 출발 ] 괄호 테스트'])
    const w2 = b1.children[0]
    expect(w2.children).toHaveLength(2)
  })

  it('불러오기 → 코멘트는 분리, GC는 판 전체 메모', () => {
    const g = importSgf(SAMPLE)
    expect(g.gameComment).toBe('대국 총평')
    expect(Object.values(g.nodeComments)).toEqual(['좋은 출발 ] 괄호 테스트', '본선', '변화도'])
    const end = lineEnd(g.tree, g.tree.rootId)
    expect(moveNumber(g.tree, end)).toBe(4)
    expect(getNode(g.tree, g.tree.rootId).props.C).toBeUndefined()
  })

  it('내보내기 → 다시 불러오면 내용이 같다 (코멘트는 C, 메모는 GC)', () => {
    const g = importSgf(SAMPLE)
    const text = exportSgf(g.tree, { nodeComments: g.nodeComments, gameComment: g.gameComment })
    expect(text).toContain('GC[대국 총평]')
    expect(text).toContain('C[좋은 출발 \\] 괄호 테스트]')
    expect(text).not.toContain(NODE_ID_PROP)
    const g2 = importSgf(text)
    expect(Object.values(g2.nodeComments)).toEqual(Object.values(g.nodeComments))
    const end1 = lineEnd(g.tree, g.tree.rootId)
    const end2 = lineEnd(g2.tree, g2.tree.rootId)
    expect(positionAt(g2.tree, end2).equals(positionAt(g.tree, end1))).toBe(true)
  })

  it('내부 저장용 내보내기는 노드 ID를 유지한다', () => {
    const g = importSgf(SAMPLE)
    const text = exportSgf(g.tree, { keepIds: true })
    const g2 = importSgf(text)
    expect(Object.keys(g2.tree.nodes).sort()).toEqual(Object.keys(g.tree.nodes).sort())
  })

  it('긴 기보(수천 수)도 스택 문제 없이 처리', () => {
    let s = '(;SZ[19]'
    for (let i = 0; i < 5000; i++) s += i % 2 ? ';W[]' : ';B[]'
    s += ')'
    const g = importSgf(s)
    expect(moveNumber(g.tree, lineEnd(g.tree, g.tree.rootId))).toBe(5000)
    expect(stringifySgf(parseSgf(exportSgf(g.tree))).length).toBeGreaterThan(5000)
  })

  it('EUC-KR 기보의 한글이 깨지지 않는다', () => {
    // "(;PB[흑돌])" 을 EUC-KR로 인코딩한 바이트
    const bytes = new Uint8Array([0x28, 0x3b, 0x50, 0x42, 0x5b, 0xc8, 0xe6, 0xb5, 0xb9, 0x5d, 0x29])
    expect(decodeSgfBytes(bytes)).toBe('(;PB[흑돌])')
    const utf8 = new TextEncoder().encode('(;PB[흑돌])')
    expect(decodeSgfBytes(utf8)).toBe('(;PB[흑돌])')
  })
})
