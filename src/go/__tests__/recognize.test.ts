import { describe, expect, it } from 'vitest'
import { homography, hApply, readBoardImage, type Quad } from '../recognize'
import { placeStones, recognizeBoard, type RGBAImage } from '../recognize/recognize'
import type { Color } from '../types'

/*
 * 합성 바둑판 그림으로 인식 엔진 시험.
 * 판 바탕·선·돌을 부드러운 가장자리로 그려서 실제 화면 캡처와 비슷하게 만듦.
 */
interface Style {
  bg: [number, number, number]
  line: [number, number, number]
  lineWidth: number
  black: [number, number, number]
  white: [number, number, number]
  /** 흰 돌 테두리 (책 그림처럼) */
  whiteOutline: boolean
  edgeWidth?: number
}

const WOOD: Style = { bg: [220, 179, 92], line: [40, 30, 20], lineWidth: 1.2, black: [25, 25, 25], white: [245, 245, 240], whiteOutline: false, edgeWidth: 2 }
const BOOK: Style = { bg: [255, 255, 255], line: [0, 0, 0], lineWidth: 1, black: [0, 0, 0], white: [255, 255, 255], whiteOutline: true, edgeWidth: 2.5 }

interface Scene {
  size: number
  /** 보여 줄 범위 (판 좌표, 포함) */
  view: { x0: number; y0: number; x1: number; y1: number }
  spacing: number
  margin: number
  stones: { x: number; y: number; color: Color }[]
  style: Style
  noise?: number
}

function render(sc: Scene): RGBAImage {
  const { view, spacing: s, margin, style, size } = sc
  const cols = view.x1 - view.x0
  const rows = view.y1 - view.y0
  const w = Math.round(cols * s + margin * 2)
  const h = Math.round(rows * s + margin * 2)
  const data = new Uint8ClampedArray(w * h * 4)
  const px = (bx: number) => margin + (bx - view.x0) * s
  const py = (by: number) => margin + (by - view.y0) * s
  // 판 끝까지만 선을 그림 (보여 주는 범위 밖으로는 반 칸 더 뻗음)
  const lineX0 = view.x0 === 0 ? px(0) : 0
  const lineX1 = view.x1 === size - 1 ? px(size - 1) : w
  const lineY0 = view.y0 === 0 ? py(0) : 0
  const lineY1 = view.y1 === size - 1 ? py(size - 1) : h
  const stoneR = s * 0.48
  const stones = sc.stones.map((st) => ({ cx: px(st.x), cy: py(st.y), color: st.color }))
  const hoshi = size === 19 ? [3, 9, 15] : size === 13 ? [3, 6, 9] : [2, 4, 6]
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: [number, number, number] = [...style.bg]
      const mix = (col: [number, number, number], a: number) => {
        a = Math.max(0, Math.min(1, a))
        c = [c[0] * (1 - a) + col[0] * a, c[1] * (1 - a) + col[1] * a, c[2] * (1 - a) + col[2] * a]
      }
      // 선
      for (let bx = view.x0; bx <= view.x1; bx++) {
        if (y < lineY0 - 0.5 || y > lineY1 + 0.5) continue
        const lw = (bx === 0 || bx === size - 1) && style.edgeWidth ? style.edgeWidth : style.lineWidth
        mix(style.line, lw / 2 + 0.5 - Math.abs(x - px(bx)))
      }
      for (let by = view.y0; by <= view.y1; by++) {
        if (x < lineX0 - 0.5 || x > lineX1 + 0.5) continue
        const lw = (by === 0 || by === size - 1) && style.edgeWidth ? style.edgeWidth : style.lineWidth
        mix(style.line, lw / 2 + 0.5 - Math.abs(y - py(by)))
      }
      for (const hx of hoshi) for (const hy of hoshi) mix(style.line, s * 0.09 + 0.5 - Math.hypot(x - px(hx), y - py(hy)))
      // 돌
      for (const st of stones) {
        const d = Math.hypot(x - st.cx, y - st.cy)
        if (d > stoneR + 1) continue
        const a = stoneR + 0.5 - d
        if (st.color === 'B') mix(style.black, a)
        else {
          if (style.whiteOutline) {
            mix(style.line, a)
            mix(style.white, stoneR - 1 + 0.5 - d)
          } else {
            // 입체감: 가장자리 쪽이 조금 어두움
            const shade = 1 - 0.12 * (d / stoneR) ** 2
            mix([style.white[0] * shade, style.white[1] * shade, style.white[2] * shade], a)
          }
        }
      }
      if (sc.noise) {
        const n = (rand() - 0.5) * sc.noise
        c = [c[0] + n, c[1] + n, c[2] + n]
      }
      const i = (y * w + x) * 4
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
    }
  }
  return { width: w, height: h, data }
}

const key = (st: { x: number; y: number; color: Color }) => `${st.color}${st.x},${st.y}`
const sortKeys = (list: { x: number; y: number; color: Color }[]) => list.map(key).sort()

function stonesFrom(spec: string): { x: number; y: number; color: Color }[] {
  // "B:pd,dp W:dd" (SGF 좌표)
  const out: { x: number; y: number; color: Color }[] = []
  for (const part of spec.split(' ')) {
    const [c, list] = part.split(':')
    for (const xy of list.split(',')) out.push({ color: c as Color, x: xy.charCodeAt(0) - 97, y: xy.charCodeAt(1) - 97 })
  }
  return out
}

describe('바둑판 이미지 인식', { timeout: 30000 }, () => {
  it('19줄 전체 판 (나무판, 입체 흰 돌)', () => {
    const stones = stonesFrom('B:pd,dp,qq,cc,jj,ss W:dd,pp,qc,aa,ja,sa')
    const img = render({ size: 19, view: { x0: 0, y0: 0, x1: 18, y1: 18 }, spacing: 32, margin: 24, stones, style: WOOD, noise: 6 })
    const r = recognizeBoard(img)!
    expect(r).not.toBeNull()
    expect(r.xs.length).toBe(19)
    expect(r.ys.length).toBe(19)
    expect(r.size).toBe(19)
    expect(r.offset).toEqual({ x: 0, y: 0 })
    expect(sortKeys(placeStones(r.grid, r.size, r.offset))).toEqual(sortKeys(stones))
  })

  it('9줄·13줄 전체 판', () => {
    for (const size of [9, 13]) {
      const stones = stonesFrom('B:cc,ee,ab W:gc,ce,ba')
      const img = render({ size, view: { x0: 0, y0: 0, x1: size - 1, y1: size - 1 }, spacing: 40, margin: 30, stones, style: WOOD })
      const r = recognizeBoard(img)!
      expect(r.size).toBe(size)
      expect(sortKeys(placeStones(r.grid, r.size, r.offset))).toEqual(sortKeys(stones))
    }
  })

  it('책 그림: 흰 바탕, 테두리 있는 흰 돌, 오른쪽 위 귀만 보임', () => {
    const stones = stonesFrom('B:pc,qd,od,pe W:qc,rd,re,pd')
    const img = render({ size: 19, view: { x0: 10, y0: 0, x1: 18, y1: 8 }, spacing: 28, margin: 14, stones, style: BOOK })
    const r = recognizeBoard(img)!
    expect(r.xs.length).toBe(9)
    expect(r.ys.length).toBe(9)
    expect(r.edges).toEqual({ left: false, right: true, top: true, bottom: false })
    expect(r.size).toBe(19)
    expect(r.offset).toEqual({ x: 10, y: 0 })
    expect(sortKeys(placeStones(r.grid, r.size, r.offset))).toEqual(sortKeys(stones))
  })

  it('왼쪽 아래 귀 (작은 그림)', () => {
    const stones = stonesFrom('B:cp,dq,cr W:bq,cq,br')
    const img = render({ size: 19, view: { x0: 0, y0: 12, x1: 6, y1: 18 }, spacing: 22, margin: 11, stones, style: WOOD })
    const r = recognizeBoard(img)!
    expect(r.edges.left && r.edges.bottom).toBe(true)
    expect(r.edges.right || r.edges.top).toBe(false)
    expect(sortKeys(placeStones(r.grid, r.size, r.offset))).toEqual(sortKeys(stones))
  })

  it('돌이 많은 판에서도 격자를 찾음', () => {
    const stones: { x: number; y: number; color: Color }[] = []
    for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) if ((x * 7 + y * 3) % 5 < 3) stones.push({ x, y, color: (x + y) % 2 ? 'B' : 'W' })
    const img = render({ size: 19, view: { x0: 0, y0: 0, x1: 18, y1: 18 }, spacing: 30, margin: 20, stones, style: WOOD, noise: 4 })
    const r = recognizeBoard(img)!
    expect(r.xs.length).toBe(19)
    const got = new Set(sortKeys(placeStones(r.grid, r.size, r.offset)))
    const want = sortKeys(stones)
    const wrong = want.filter((k) => !got.has(k)).length + [...got].filter((k) => !want.includes(k)).length
    expect(wrong).toBeLessThanOrEqual(2)
  })

  it('바둑판이 없는 그림은 null', () => {
    const w = 200
    const h = 150
    const data = new Uint8ClampedArray(w * h * 4).fill(200)
    expect(recognizeBoard({ width: w, height: h, data })).toBeNull()
  })

  it('비스듬히 찍은 사진: 원근 보정으로 전체 판을 읽음', () => {
    const stones = stonesFrom('B:pd,dp,jj,cc W:dd,pp,qc,kk')
    const flat = render({ size: 19, view: { x0: 0, y0: 0, x1: 18, y1: 18 }, spacing: 30, margin: 30, stones, style: WOOD, noise: 8 })
    // 사다리꼴로 기울여 탁자(회색) 위에 놓인 것처럼
    const W = 900
    const H = 760
    const dst: Quad = [
      [150, 90],
      [760, 60],
      [840, 690],
      [70, 640],
    ]
    const src: Quad = [
      [0, 0],
      [flat.width, 0],
      [flat.width, flat.height],
      [0, flat.height],
    ]
    const back = homography(dst, src)!
    const data = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [u, v] = hApply(back, x, y)
        const i = (y * W + x) * 4
        const ui = Math.round(u)
        const vi = Math.round(v)
        if (ui >= 0 && vi >= 0 && ui < flat.width && vi < flat.height) {
          const k = (vi * flat.width + ui) * 4
          data[i] = flat.data[k]
          data[i + 1] = flat.data[k + 1]
          data[i + 2] = flat.data[k + 2]
        } else {
          data[i] = 90
          data[i + 1] = 92
          data[i + 2] = 96
        }
        data[i + 3] = 255
      }
    const r = readBoardImage({ width: W, height: H, data })
    expect(r.mode).toBe('photo')
    if (r.mode !== 'photo') return
    expect(r.n).toBe(19)
    expect(sortKeys(placeStones(r.grid, 19, { x: 0, y: 0 }))).toEqual(sortKeys(stones))
  })

  it('반듯한 그림은 flat 방식으로 읽음', () => {
    const img = render({ size: 19, view: { x0: 0, y0: 0, x1: 8, y1: 8 }, spacing: 26, margin: 13, stones: stonesFrom('B:cc W:dc'), style: BOOK })
    expect(readBoardImage(img).mode).toBe('flat')
  })
})
