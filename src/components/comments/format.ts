import { fromDisplay } from '../../go/coords'
import type { Point } from '../../go/types'

/*
 * 코멘트 간단 서식
 *  - 줄바꿈은 그대로
 *  - **굵게**
 *  - 좌표(D4, Q16 등)는 눌러서 판 위 위치를 강조할 수 있는 링크
 */
export type Segment =
  | { kind: 'text'; text: string; bold: boolean }
  | { kind: 'coord'; text: string; point: Point; bold: boolean }
  | { kind: 'break' }

// 영문/숫자에 붙어 있지 않은 대문자 좌표만 인식 (예: "D4에" O, "AD4" X, "D45" X)
const COORD_RE = /(?<![A-Za-z0-9])([A-HJ-Z])(1[0-9]|2[0-5]|[1-9])(?![0-9])/g

function splitCoords(text: string, bold: boolean, size: number, out: Segment[]) {
  let last = 0
  for (const m of text.matchAll(COORD_RE)) {
    const point = fromDisplay(m[0], size)
    if (!point) continue
    const start = m.index ?? 0
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start), bold })
    out.push({ kind: 'coord', text: m[0], point, bold })
    last = start + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last), bold })
}

export function parseCommentText(body: string, size: number): Segment[] {
  const out: Segment[] = []
  const lines = body.split('\n')
  lines.forEach((line, li) => {
    if (li > 0) out.push({ kind: 'break' })
    const parts = line.split('**')
    parts.forEach((part, pi) => {
      // 짝이 맞는 ** 사이만 굵게 (마지막에 닫히지 않은 **는 글자 그대로)
      const unclosed = pi === parts.length - 1 && parts.length % 2 === 0
      const bold = pi % 2 === 1 && !unclosed
      const text = unclosed ? '**' + part : part
      if (text) splitCoords(text, bold, size, out)
    })
  })
  return out
}

/** 글 안의 모든 좌표 */
export function coordsInText(body: string, size: number): Point[] {
  return parseCommentText(body, size).flatMap((s) => (s.kind === 'coord' ? [s.point] : []))
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
