import { describe, expect, it } from 'vitest'
import { BoardState } from '../rules/board'
import { fromDisplay, toDisplay } from '../coords'

function setup(size: number, rows: string[]): BoardState {
  // rows: '.', 'X'(흑), 'O'(백)
  const changes = []
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x]
      if (ch === 'X') changes.push({ p: { x, y }, cell: 1 as const })
      if (ch === 'O') changes.push({ p: { x, y }, cell: 2 as const })
    }
  return BoardState.empty(size).setStones(changes)
}

describe('좌표', () => {
  it('화면 좌표는 I를 건너뛰고 아래에서 위로 센다', () => {
    expect(toDisplay({ x: 3, y: 15 }, 19)).toBe('D4')
    expect(toDisplay({ x: 8, y: 0 }, 19)).toBe('J19')
    expect(fromDisplay('Q16', 19)).toEqual({ x: 15, y: 3 })
    expect(fromDisplay('I5', 19)).toBeNull()
    expect(fromDisplay('K10', 9)).toBeNull()
  })
})

describe('규칙', () => {
  it('활로가 없어진 돌을 따낸다', () => {
    const b = setup(5, ['.X...', 'XO...', '.X...', '.....', '.....'])
    const r = b.play({ x: 2, y: 1 }, 'B')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.captured).toEqual([{ x: 1, y: 1 }])
    expect(r.board.get({ x: 1, y: 1 })).toBe(0)
    expect(r.board.captures.B).toBe(1)
  })

  it('여러 점 무리를 한꺼번에 따낸다', () => {
    const b = setup(5, ['OOX..', '.X...', '.....', '.....', '.....'])
    const r = b.play({ x: 0, y: 1 }, 'B')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.captured).toHaveLength(2)
    expect(r.board.captures.B).toBe(2)
  })

  it('자충수는 금지', () => {
    const b = setup(5, ['.X...', 'X....', '.....', '.....', '.....'])
    const r = b.play({ x: 0, y: 0 }, 'W')
    expect(r).toEqual({ ok: false, error: 'suicide' })
  })

  it('따내는 수는 자충이 아니다', () => {
    const b = setup(5, ['.XO..', 'XO...', 'O....', '.....', '.....'])
    const r = b.play({ x: 0, y: 0 }, 'W')
    expect(r.ok).toBe(true)
  })

  it('이미 돌이 있으면 금지', () => {
    const b = setup(5, ['X....', '.....', '.....', '.....', '.....'])
    expect(b.play({ x: 0, y: 0 }, 'W')).toEqual({ ok: false, error: 'occupied' })
  })

  it('패는 바로 되따낼 수 없다', () => {
    const before = setup(5, ['.XO..', 'XO.O.', '.XO..', '.....', '.....'])
    // 흑이 (2,1)에 두어 백 (1,1)을 따냄
    const r1 = before.play({ x: 2, y: 1 }, 'B')
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.captured).toEqual([{ x: 1, y: 1 }])
    // 백이 곧바로 (1,1)에 되따내면 원래 판과 같아짐 → 패 금지
    const r2 = r1.board.play({ x: 1, y: 1 }, 'W', before)
    expect(r2).toEqual({ ok: false, error: 'ko' })
    // 비교 대상이 없으면(다른 곳에 한 수 두고 온 상황) 가능
    const r3 = r1.board.play({ x: 1, y: 1 }, 'W', null)
    expect(r3.ok).toBe(true)
  })
})
