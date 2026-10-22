import type { Color, Point } from '../types'

/** 0 = 빈 점, 1 = 흑, 2 = 백 */
export type Cell = 0 | 1 | 2

export type PlayError = 'occupied' | 'suicide' | 'ko' | 'outside'

export const PLAY_ERROR_MESSAGE: Record<PlayError, string> = {
  occupied: '이미 돌이 있는 자리입니다.',
  suicide: '착수 금지: 자충수(스스로 단수가 아닌 상태로 따내지는 수)입니다.',
  ko: '착수 금지: 패는 바로 다시 따낼 수 없습니다. 다른 곳에 한 수 두고 오세요.',
  outside: '판 밖입니다.',
}

export function colorToCell(c: Color): Cell {
  return c === 'B' ? 1 : 2
}

export function cellToColor(c: Cell): Color | null {
  return c === 1 ? 'B' : c === 2 ? 'W' : null
}

/**
 * 한 시점의 판 상태. 불변(immutable) 객체로 다룸.
 * captures.B = 흑이 따낸 백돌 수, captures.W = 백이 따낸 흑돌 수
 */
export class BoardState {
  readonly size: number
  readonly cells: Uint8Array
  readonly captures: { B: number; W: number }

  constructor(size: number, cells?: Uint8Array, captures?: { B: number; W: number }) {
    this.size = size
    this.cells = cells ?? new Uint8Array(size * size)
    this.captures = captures ?? { B: 0, W: 0 }
  }

  static empty(size: number): BoardState {
    return new BoardState(size)
  }

  inside(p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.size && p.y < this.size
  }

  get(p: Point): Cell {
    return this.cells[p.y * this.size + p.x] as Cell
  }

  equals(other: BoardState): boolean {
    if (other.size !== this.size) return false
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] !== other.cells[i]) return false
    return true
  }

  private neighbors(i: number): number[] {
    const s = this.size
    const x = i % s
    const y = (i - x) / s
    const out: number[] = []
    if (x > 0) out.push(i - 1)
    if (x < s - 1) out.push(i + 1)
    if (y > 0) out.push(i - s)
    if (y < s - 1) out.push(i + s)
    return out
  }

  /** i를 포함한 같은 색 돌 무리와 그 무리의 활로 수 */
  private groupAt(cells: Uint8Array, i: number): { stones: number[]; liberties: number } {
    const color = cells[i]
    const stones: number[] = []
    const seen = new Set<number>([i])
    const libs = new Set<number>()
    const stack = [i]
    while (stack.length) {
      const cur = stack.pop()!
      stones.push(cur)
      for (const n of this.neighbors(cur)) {
        if (cells[n] === 0) libs.add(n)
        else if (cells[n] === color && !seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    return { stones, liberties: libs.size }
  }

  /**
   * 착수. 성공하면 새 판 상태와 따낸 돌 위치를 돌려줌.
   * koBoard: 패 판정을 위해 비교할 "직전 상대 착수 이전의 판" (같아지면 패로 금지)
   */
  play(
    p: Point,
    color: Color,
    koBoard?: BoardState | null,
  ): { ok: true; board: BoardState; captured: Point[] } | { ok: false; error: PlayError } {
    if (!this.inside(p)) return { ok: false, error: 'outside' }
    const i = p.y * this.size + p.x
    if (this.cells[i] !== 0) return { ok: false, error: 'occupied' }

    const me = colorToCell(color)
    const opp = me === 1 ? 2 : 1
    const cells = this.cells.slice()
    cells[i] = me

    const captured: number[] = []
    for (const n of this.neighbors(i)) {
      if (cells[n] !== opp) continue
      const g = this.groupAt(cells, n)
      if (g.liberties === 0) {
        for (const s of g.stones) {
          cells[s] = 0
          captured.push(s)
        }
      }
    }

    if (captured.length === 0 && this.groupAt(cells, i).liberties === 0) {
      return { ok: false, error: 'suicide' }
    }

    const captures = { ...this.captures }
    captures[color] += captured.length
    const next = new BoardState(this.size, cells, captures)

    if (koBoard && captured.length > 0 && next.equals(koBoard)) {
      return { ok: false, error: 'ko' }
    }

    return {
      ok: true,
      board: next,
      captured: captured.map((c) => ({ x: c % this.size, y: Math.floor(c / this.size) })),
    }
  }

  /** 규칙 검사 없이 돌을 놓거나 지움 (배치 도구, SGF의 AB/AW/AE) */
  setStones(changes: { p: Point; cell: Cell }[]): BoardState {
    const cells = this.cells.slice()
    for (const { p, cell } of changes) {
      if (this.inside(p)) cells[p.y * this.size + p.x] = cell
    }
    return new BoardState(this.size, cells, { ...this.captures })
  }
}
