import type { Point } from './types'

const SGF_LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** 화면 좌표 글자: 관례에 따라 I를 건너뜀 */
const DISPLAY_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

/** SGF 좌표("pd") → Point. 빈 문자열이나 19줄 이하에서의 "tt"는 패스(null) */
export function fromSgf(value: string, size: number): Point | null {
  if (value.length < 2) return null
  const x = SGF_LETTERS.indexOf(value[0])
  const y = SGF_LETTERS.indexOf(value[1])
  if (x < 0 || y < 0) return null
  if (x >= size || y >= size) return null // "tt" 패스 표기 포함
  return { x, y }
}

export function toSgf(p: Point): string {
  return SGF_LETTERS[p.x] + SGF_LETTERS[p.y]
}

/** "aa:cc" 같은 압축 좌표 목록을 풀어 줌 */
export function expandSgfPoints(values: string[], size: number): Point[] {
  const out: Point[] = []
  for (const v of values) {
    const [a, b] = v.split(':')
    const p1 = fromSgf(a, size)
    if (!p1) continue
    if (b === undefined) {
      out.push(p1)
      continue
    }
    const p2 = fromSgf(b, size)
    if (!p2) continue
    for (let x = Math.min(p1.x, p2.x); x <= Math.max(p1.x, p2.x); x++)
      for (let y = Math.min(p1.y, p2.y); y <= Math.max(p1.y, p2.y); y++) out.push({ x, y })
  }
  return out
}

/** 화면 표기 좌표(예: "D4"). 숫자는 아래에서 위로 1부터 */
export function toDisplay(p: Point, size: number): string {
  return DISPLAY_LETTERS[p.x] + String(size - p.y)
}

export function fromDisplay(text: string, size: number): Point | null {
  const m = /^([A-HJ-Za-hj-z])(\d{1,2})$/.exec(text.trim())
  if (!m) return null
  const x = DISPLAY_LETTERS.indexOf(m[1].toUpperCase())
  const row = Number(m[2])
  if (x < 0 || x >= size || row < 1 || row > size) return null
  return { x, y: size - row }
}

export function displayColumnLabel(x: number): string {
  return DISPLAY_LETTERS[x]
}

/** 화점 위치 */
export function starPoints(size: number): Point[] {
  const edge = size >= 13 ? 3 : 2
  const far = size - 1 - edge
  const mid = (size - 1) / 2
  const pts: Point[] = [
    { x: edge, y: edge },
    { x: far, y: edge },
    { x: edge, y: far },
    { x: far, y: far },
  ]
  if (size % 2 === 1) {
    pts.push({ x: mid, y: mid })
    if (size >= 19) {
      pts.push({ x: mid, y: edge }, { x: mid, y: far }, { x: edge, y: mid }, { x: far, y: mid })
    }
  }
  return pts
}
