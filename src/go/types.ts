export type Color = 'B' | 'W'

/** 판 위의 한 점. x는 왼쪽→오른쪽, y는 위→아래, 0부터 시작 */
export interface Point {
  x: number
  y: number
}

export const BOARD_SIZES = [19, 13, 9] as const
export type BoardSize = (typeof BOARD_SIZES)[number]

export function otherColor(c: Color): Color {
  return c === 'B' ? 'W' : 'B'
}

export function samePoint(a: Point | null | undefined, b: Point | null | undefined): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y
}
