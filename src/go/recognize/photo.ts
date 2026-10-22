import type { Color } from '../types'
import type { RGBAImage } from './recognize'

/*
 * 사진(실제 바둑판, 모니터를 찍은 사진, 기울어진 책 그림)에서 바둑판 읽기.
 * 카타고 클라우드의 "사진으로 배치 입력"과 같은 방식:
 *  1. 나무색 영역을 찾아 대략의 네 귀 → 정사각형으로 펴서(원근 보정) 가는 선의 가로·세로 그래프
 *  2. 19·13·9줄 중 선이 가장 뚜렷하게 맞는 크기와 간격을 찾음 → 그 격자의 네 귀로 다시 펴서 두 번 더 다듬음
 *  3. 교차점마다 작은 원의 평균 밝기·노란 정도를 주변 칸 가운데(판 바탕)와 비교해 흑/백/빈 곳 판정
 * 자동으로 못 찾으면 화면에서 네 귀를 손으로 맞추고 3번만 함.
 */

export type Pt = [number, number]
/** 네 귀: 왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래 */
export type Quad = [Pt, Pt, Pt, Pt]
export type Homography = number[]

export const UNIT: Quad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

/** 네 점 from 을 네 점 to 로 옮기는 3×3 변환 (h33 = 1) */
export function homography(from: Quad, to: Quad): Homography | null {
  const A: number[][] = []
  const b: number[] = []
  for (let k = 0; k < 4; k++) {
    const [x, y] = from[k]
    const [X, Y] = to[k]
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X])
    b.push(X)
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y])
    b.push(Y)
  }
  for (let c = 0; c < 8; c++) {
    let piv = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    ;[A[c], A[piv]] = [A[piv], A[c]]
    ;[b[c], b[piv]] = [b[piv], b[c]]
    if (Math.abs(A[c][c]) < 1e-12) return null
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      if (!f) continue
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]
      b[r] -= f * b[c]
    }
  }
  const h = b.map((v, k) => v / A[k][k])
  h.push(1)
  return h
}

export function hApply(h: Homography, x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + h[8]
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}

function gray(img: RGBAImage): Float32Array {
  const { width: W, height: H, data: d } = img
  const g = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  return g
}

/** 나무색 덩어리의 가장 바깥 네 점 (+ 나무색 전체를 감싸는 상자) */
function boardQuads(img: RGBAImage): Quad[] {
  const { width: W, height: H, data: d } = img
  const st = Math.max(1, Math.round(Math.max(W, H) / 350))
  const w = Math.floor(W / st)
  const h = Math.floor(H / st)
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = (y * st * W + x * st) * 4
      const r = d[k]
      const g = d[k + 1]
      const b = d[k + 2]
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      if (mx < 90 || mx - mn < mx * 0.15) continue
      let hue = mx === r ? 60 * ((g - b) / (mx - mn)) : mx === g ? 60 * (2 + (b - r) / (mx - mn)) : 60 * (4 + (r - g) / (mx - mn))
      if (hue < 0) hue += 360
      if (hue >= 18 && hue <= 58) mask[y * w + x] = 1
    }
  const lab = new Int32Array(w * h).fill(-1)
  let best: number[] | null = null
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i] >= 0) continue
    const q = [i]
    lab[i] = i
    for (let k = 0; k < q.length; k++) {
      const p = q[k]
      const x = p % w
      const y = (p / w) | 0
      for (const j of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1])
        if (j >= 0 && mask[j] && lab[j] < 0) {
          lab[j] = i
          q.push(j)
        }
    }
    if (!best || q.length > best.length) best = q
  }
  const all: number[] = []
  for (let i = 0; i < w * h; i++) if (mask[i]) all.push(i)
  const toImg = (x: number, y: number): Pt => [x * st + st / 2, y * st + st / 2]
  const box = (ps: number[]): Quad => {
    let x0 = w
    let y0 = h
    let x1 = 0
    let y1 = 0
    for (const p of ps) {
      const x = p % w
      const y = (p / w) | 0
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    return [toImg(x0, y0), toImg(x1, y0), toImg(x1, y1), toImg(x0, y1)]
  }
  if (!best || best.length < w * h * 0.05) return all.length > w * h * 0.05 ? [box(all)] : []
  const ext: [number, Pt][] = [
    [Infinity, [0, 0]],
    [-Infinity, [0, 0]],
    [-Infinity, [0, 0]],
    [-Infinity, [0, 0]],
  ]
  for (const p of best) {
    const x = p % w
    const y = (p / w) | 0
    const v = [x + y, x - y, x + y, y - x]
    if (v[0] < ext[0][0]) ext[0] = [v[0], [x, y]]
    for (let k = 1; k < 4; k++) if (v[k] > ext[k][0]) ext[k] = [v[k], [x, y]]
  }
  return [ext.map(([, [x, y]]) => toImg(x, y)) as Quad, box(all)]
}

/** 사각형(네 귀가 m..R-m 에 오도록)을 R×R 회색 그림으로 폄 */
function warpGray(g: Float32Array, W: number, H: number, quad: Quad, R: number, m: number) {
  const h = homography(
    [
      [m, m],
      [R - m, m],
      [R - m, R - m],
      [m, R - m],
    ],
    quad,
  )
  const out = new Float32Array(R * R)
  if (!h) return { img: out, back: null }
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      const [u, v] = hApply(h, x, y)
      const x0 = Math.floor(u)
      const y0 = Math.floor(v)
      if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) {
        out[y * R + x] = 128
        continue
      }
      const fx = u - x0
      const fy = v - y0
      const k = y0 * W + x0
      out[y * R + x] = (g[k] * (1 - fx) + g[k + 1] * fx) * (1 - fy) + (g[k + W] * (1 - fx) + g[k + W + 1] * fx) * fy
    }
  return { img: out, back: h }
}

function lineProfiles(img: Float32Array, R: number, k: number): [Float32Array, Float32Array] {
  const rows = new Float32Array(R)
  const cols = new Float32Array(R)
  for (let y = k; y < R - k; y++)
    for (let x = k; x < R - k; x++) {
      const c = img[y * R + x]
      const h = Math.min(img[(y - k) * R + x], img[(y + k) * R + x]) - c
      const v = Math.min(img[y * R + x - k], img[y * R + x + k]) - c
      if (h > 10) rows[y] += Math.min(h, 60)
      if (v > 10) cols[x] += Math.min(v, 60)
    }
  const sm = (a: Float32Array) => a.map((_, i) => ((a[i - 1] || 0) + 2 * a[i] + (a[i + 1] || 0)) / 4)
  return [sm(rows), sm(cols)]
}

interface Fit {
  o: number
  s: number
  score: number
  on: number
}

function fitN(prof: Float32Array, n: number, sLo: number, sHi: number, oLo: number, oHi: number): Fit {
  const at = (t: number) => {
    const i = Math.floor(t)
    const f = t - i
    return i < 0 || i >= prof.length - 1 ? 0 : prof[i] * (1 - f) + prof[i + 1] * f
  }
  const pk = (t: number) => Math.max(at(t - 1), at(t), at(t + 1))
  let best: Fit = { o: 0, s: 0, score: -Infinity, on: 0 }
  for (let s = sLo; s <= sHi; s += 0.25)
    for (let o = Math.max(1, oLo); o <= oHi && o + (n - 1) * s < prof.length - 1; o += 0.5) {
      let on = 0
      let off = 0
      for (let i = 0; i < n; i++) {
        on += pk(o + i * s)
        if (i < n - 1) off += at(o + (i + 0.5) * s)
      }
      const slack = Math.max(2, s * 0.15)
      const near = (t: number) => {
        let v = 0
        for (let d = -slack; d <= slack; d++) v = Math.max(v, at(t + d))
        return v
      }
      // 더 큰 격자의 일부라면 양쪽 끝 밖에도 선이 있음 (판 테두리 선은 한쪽에만)
      const out = Math.min(near(o - s), near(o + n * s))
      const score = on / n - off / (n - 1) - 0.8 * out
      if (score > best.score) best = { o, s, score, on: on / n }
    }
  return best
}

export interface PhotoAuto {
  corners: Quad
  n: number
  ok: boolean
}

/** 사진에서 격자의 네 귀와 판 크기를 자동으로 찾음 */
export function photoAuto(img: RGBAImage): PhotoAuto | null {
  const { width: W, height: H } = img
  const g = gray(img)
  const R = 640
  const k = 3
  type Here = { n: number; a: Fit; b: Fit; back: number[]; score: number; clear: number }
  let best: Here | null = null
  const areas: [Quad, number][] = boardQuads(img).map((q) => [q, 0.7])
  areas.push([
    [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ],
    0.25,
  ])
  for (const [quad, fill] of areas) {
    const wq = warpGray(g, W, H, quad, R, 0)
    if (!wq.back) continue
    const [rows, cols] = lineProfiles(wq.img, R, k)
    let here: Here | null = null
    for (const n of [19, 13, 9]) {
      const sLo = (R * fill) / (n - 1)
      const sHi = R / (n - 1) - 0.5
      const a = fitN(rows, n, sLo, sHi, 0, R * (1 - fill))
      const b = fitN(cols, n, sLo, sHi, 0, R * (1 - fill))
      if (!here || a.score + b.score > here.score) here = { n, a, b, back: wq.back, score: a.score + b.score, clear: 0 }
    }
    if (!here) continue
    const { n, a, b } = here
    const c = (
      [
        [b.o, a.o],
        [b.o + (n - 1) * b.s, a.o],
        [b.o + (n - 1) * b.s, a.o + (n - 1) * a.s],
        [b.o, a.o + (n - 1) * a.s],
      ] as Pt[]
    ).map(([x, y]) => hApply(wq.back, x, y))
    const len = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1])
    const aspect = (len(c[0], c[1]) + len(c[3], c[2])) / (len(c[0], c[3]) + len(c[1], c[2]))
    here.clear = (a.score / a.on + b.score / b.on) / 2 - 1.5 * Math.abs(Math.log(aspect)) - (fill < 0.5 ? 0.1 : 0)
    if (!best || here.clear > best.clear) best = here
  }
  if (!best) return null
  const n = best.n
  let back = best.back
  let corners = (
    [
      [best.b.o, best.a.o],
      [best.b.o + (n - 1) * best.b.s, best.a.o],
      [best.b.o + (n - 1) * best.b.s, best.a.o + (n - 1) * best.a.s],
      [best.b.o, best.a.o + (n - 1) * best.a.s],
    ] as Pt[]
  ).map(([x, y]) => hApply(back, x, y)) as Quad
  const m = (R / (n + 1)) * 1.4
  const s0 = (R - 2 * m) / (n - 1)
  let fit: { a: Fit; b: Fit } | null = null
  for (let pass = 0; pass < 2; pass++) {
    const w = warpGray(g, W, H, corners, R, m)
    if (!w.back) break
    back = w.back
    const [rows, cols] = lineProfiles(w.img, R, k)
    const a = fitN(rows, n, s0 * 0.94, s0 * 1.06, m - s0 * 0.6, m + s0 * 0.6)
    const b = fitN(cols, n, s0 * 0.94, s0 * 1.06, m - s0 * 0.6, m + s0 * 0.6)
    corners = (
      [
        [b.o, a.o],
        [b.o + (n - 1) * b.s, a.o],
        [b.o + (n - 1) * b.s, a.o + (n - 1) * a.s],
        [b.o, a.o + (n - 1) * a.s],
      ] as Pt[]
    ).map(([x, y]) => hApply(back, x, y)) as Quad
    fit = { a, b }
  }
  if (!fit) return null
  const ok = fit.a.score > fit.a.on * 0.35 && fit.b.score > fit.b.on * 0.35
  return { corners, n, ok }
}

/** 나무색 영역의 상자를 조금 안쪽으로 (자동 인식이 아예 실패했을 때 손으로 맞출 출발점) */
export function guessCorners(img: RGBAImage): Quad {
  const { width: W, height: H, data: d } = img
  let x0 = W
  let y0 = H
  let x1 = 0
  let y1 = 0
  let n = 0
  for (let y = 0; y < H; y += 4)
    for (let x = 0; x < W; x += 4) {
      const i = (y * W + x) * 4
      const r = d[i]
      const g = d[i + 1]
      const bl = d[i + 2]
      const mx = Math.max(r, g, bl)
      const mn = Math.min(r, g, bl)
      if (mx > 90 && (mx - mn) / mx > 0.22 && r >= g && g > bl) {
        n++
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
    }
  if (n < 200 || x1 - x0 < W * 0.2 || y1 - y0 < H * 0.2) {
    x0 = W * 0.1
    x1 = W * 0.9
    y0 = H * 0.1
    y1 = H * 0.9
  }
  const ix = (x1 - x0) * 0.035
  const iy = (y1 - y0) * 0.035
  return [
    [x0 + ix, y0 + iy],
    [x1 - ix, y0 + iy],
    [x1 - ix, y1 - iy],
    [x0 + ix, y1 - iy],
  ]
}

/** 네 귀가 정해진 cols×rows 격자의 교차점마다 흑/백/빈 곳 판정 (사진용: 밝기·노란 정도) */
export function readGridPhoto(img: RGBAImage, corners: Quad, cols: number, rows: number): (Color | null)[][] {
  const h = homography(UNIT, corners)
  if (!h) return []
  const { width: W, height: H, data: d } = img
  const P = (u: number, v: number) => hApply(h, u / (cols - 1), v / (rows - 1))
  const disc = (u: number, v: number, frac: number): [number, number] => {
    const [x, y] = P(u, v)
    const nx = P(u + 1, v)
    const cell = Math.hypot(nx[0] - x, nx[1] - y)
    const r = Math.max(1, cell * frac)
    const r2 = r * r
    let R = 0
    let G = 0
    let B = 0
    let c = 0
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++)
      for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue
        const k = (yy * W + xx) * 4
        R += d[k]
        G += d[k + 1]
        B += d[k + 2]
        c++
      }
    if (!c) return [128, 0]
    R /= c
    G /= c
    B /= c
    return [0.299 * R + 0.587 * G + 0.114 * B, (R + G) / 2 - B]
  }
  // 판 바탕: 칸마다 가운데 (돌도 선도 닿지 않는 곳)
  const bg: [number, number][] = []
  for (let v = 0; v < rows - 1; v++) for (let u = 0; u < cols - 1; u++) bg.push(disc(u + 0.5, v + 0.5, 0.12))
  const bgAt = (u: number, v: number): [number, number] => {
    const near: [number, number][] = []
    for (const [a, b] of [
      [u - 1, v - 1],
      [u, v - 1],
      [u - 1, v],
      [u, v],
    ])
      if (a >= 0 && b >= 0 && a < cols - 1 && b < rows - 1) near.push(bg[b * (cols - 1) + a])
    const med = (k: 0 | 1) => {
      const xs = near.map((f) => f[k]).sort((p, q) => p - q)
      return xs[Math.floor((xs.length - 1) / 2)]
    }
    return [med(0), med(1)]
  }
  const greyBoard = bg.reduce((t, f) => t + f[1], 0) / bg.length < 18
  const grid: (Color | null)[][] = []
  for (let v = 0; v < rows; v++) {
    const row: (Color | null)[] = []
    for (let u = 0; u < cols; u++) {
      const [L, S] = disc(u, v, 0.3)
      const [bL, bS] = bgAt(u, v)
      row.push(
        L < bL * 0.58 ? 'B' : greyBoard ? (L > bL + 18 ? 'W' : null) : S < bS * 0.5 && S < bS - 15 && L > bL * 0.72 ? 'W' : null,
      )
    }
    grid.push(row)
  }
  return grid
}
