import { describe, expect, it } from 'vitest'
import { coordsInText, parseCommentText } from '../format'

describe('코멘트 서식', () => {
  it('좌표를 찾아낸다 (한글이 바로 붙어도)', () => {
    expect(coordsInText('D4에 두면 Q16이 약해진다', 19)).toEqual([
      { x: 3, y: 15 },
      { x: 15, y: 3 },
    ])
  })
  it('좌표가 아닌 것은 무시한다', () => {
    expect(coordsInText('AD4, D45, I5, T20, d4', 19)).toEqual([])
    expect(coordsInText('K10', 9)).toEqual([])
  })
  it('굵게와 줄바꿈', () => {
    const segs = parseCommentText('**좋은 수**\n다음', 19)
    expect(segs).toEqual([
      { kind: 'text', text: '좋은 수', bold: true },
      { kind: 'break' },
      { kind: 'text', text: '다음', bold: false },
    ])
  })
  it('닫히지 않은 **는 글자 그대로', () => {
    const segs = parseCommentText('a **b', 19)
    expect(segs.map((s) => (s.kind === 'text' ? s.text : '')).join('')).toBe('a **b')
  })
})
