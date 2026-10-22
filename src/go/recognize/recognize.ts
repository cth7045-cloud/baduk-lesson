import { toSgf } from '../coords'
import { createTree, type GameTree } from '../tree/gameTree'
import type { Color } from '../types'

/*
 * 바둑판 이미지(화면 캡처, 책·문제집 그림)에서 판과 돌을 읽어 냄.
 *
 * 1. 가는 어두운 선(격자선)만 강조하는 필터 → 세로선·가로선 위치별 "선 길이" 그래프
 * 2. 그래프에서 일정한 간격으로 반복되는 봉우리를 찾아 격자선 위치를 구함
 * 3. 교차점마다 원 안쪽 밝기, 십자 선이 보이는지, 테두리 고리가 있는지로 흑/백/빈 점 판정
 * 4. 가장자리 선 밖으로 선이 더 뻗어 있는지 보고 판의 끝(귀·변)인지 판정 → 19줄 판의 어느 쪽인지 배치
 *
 * 반듯한 그림을 대상으로 함 (기울어진 사진은 지원하지 않음).
 */

export interface RGBAImage {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

export interface Edges {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

export interface Recognition {
  /** 이미지에서 찾은 세로선(x)·가로선(y) 위치 (픽셀) */
  xs: number[]
  ys: number[]
  spacing: number
  /** 이미지 속 선이 판의 끝(가장자리)인지 */
  edges: Edges
  /** 찾은 격자 안의 돌 [가로줄 j][세로줄 i] */
  grid: (Color | null)[][]
  /** 추천 판 크기와 격자 왼쪽 위 교차점의 판 좌표 */
  size: number
  offset: { x: number; y: number }
  /** 격자가 얼마나 반듯한가 (0에 가까울수록 반듯: 화면 캡처·스캔. 사진은 원근 때문에 커짐) */
  irregularity: number
}

export interface PlacedStone {
  x: number
  y: number
  color: Color
}

const MAX_LINES = 19

/** 휘도 (0=검정, 1=흰색) */
function luminance(img: RGBAImage): Float32Array {
  const { width, height, data } = img
  const L = new Float32Array(width * height)
  for (let i = 0, p = 0; i < L.length; i++, p += 4) {
    const a = data[p + 3] / 255
    // 투명한 부분은 흰 배경으로 봄
    const r = data[p] * a + 255 * (1 - a)
    const g = data[p + 1] * a + 255 * (1 - a)
    const b = data[p + 2] * a + 255 * (1 - a)
    L[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  return L
}

/** 가는 어두운 선 강조: 양옆(또는 위아래)보다 얼마나 어두운가 */
function thinLineResponse(L: Float32Array, w: number, h: number, vertical: boolean): Float32Array {
  const out = new Float32Array(w * h)
  const step = vertical ? 1 : w
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = vertical ? x : y
      const lim = vertical ? w : h
      const i = y * w + x
      let best = 0
      for (let d = 1; d <= 4; d++) {
        if (pos - d < 0 || pos + d >= lim) break
        const side = Math.min(L[i - d * step], L[i + d * step])
        const v = side - L[i]
        if (v > best) best = v
      }
      out[i] = best
    }
  }
  return out
}

function percentile(values: ArrayLike<number>, q: number): number {
  const arr = Array.from(values).sort((a, b) => a - b)
  if (!arr.length) return 0
  return arr[Math.min(arr.length - 1, Math.max(0, Math.floor(q * (arr.length - 1))))]
}

function median(values: number[]): number {
  return percentile(values, 0.5)
}

/** 선 응답이 기준 이상인 픽셀 수를 줄마다 셈 (= 그 위치의 선 길이) */
function profile(resp: Float32Array, w: number, h: number, tau: number, vertical: boolean): Float32Array {
  const n = vertical ? w : h
  const p = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (resp[y * w + x] > tau) p[vertical ? x : y] += 1
    }
  }
  // 1-2-1 로 살짝 부드럽게 (선이 두 픽셀에 걸친 경우)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) s[i] = (p[i - 1] ?? 0) * 0.5 + p[i] + (p[i + 1] ?? 0) * 0.5
  return s
}

interface Peak {
  pos: number
  value: number
}

function findPeaks(p: Float32Array): Peak[] {
  let max = 0
  for (const v of p) max = Math.max(max, v)
  if (max <= 0) return []
  const peaks: Peak[] = []
  for (let i = 1; i < p.length - 1; i++) {
    if (p[i] >= 0.15 * max && p[i] >= p[i - 1] && p[i] > p[i + 1]) {
      // 봉우리 위치를 무게 중심으로 다듬음
      const a = p[i - 1]
      const b = p[i]
      const c = p[i + 1]
      const den = a - 2 * b + c
      const off = den !== 0 ? (0.5 * (a - c)) / den : 0
      peaks.push({ pos: i + Math.max(-0.5, Math.min(0.5, off)), value: b })
    }
  }
  return peaks
}

/** 자기상관으로 반복 간격 추정 */
function estimateSpacing(p: Float32Array, minLag: number, maxLag: number): number[] {
  const n = p.length
  let mean = 0
  for (const v of p) mean += v
  mean /= n
  const c = Array.from(p, (v) => v - mean)
  const ac: number[] = []
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i + lag < n; i++) sum += c[i] * c[i + lag]
    ac.push(sum / (n - lag))
  }
  const cands: { lag: number; v: number }[] = []
  for (let lag = Math.max(2, minLag); lag < maxLag; lag++) {
    if (ac[lag] > 0 && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) cands.push({ lag, v: ac[lag] })
  }
  if (!cands.length) return []
  const best = Math.max(...cands.map((c) => c.v))
  // 간격의 배수도 봉우리가 되므로, 충분히 강한 것 중 가장 짧은 간격을 우선
  return cands
    .filter((c) => c.v >= 0.5 * best)
    .sort((a, b) => a.lag - b.lag)
    .map((c) => c.lag)
}

interface LineFit {
  lines: number[]
  spacing: number
  strengths: number[]
  /** 찾은 선들이 등간격에서 벗어난 정도 (간격 대비, 제곱평균) */
  rms: number
}

/** 봉우리들 중 일정 간격으로 늘어선 가장 긴 줄을 찾음 */
function fitLines(peaks: Peak[], spacingCands: number[], length: number): LineFit | null {
  let bestFit: LineFit | null = null
  let bestScore = 0
  const tried = new Set<number>()
  for (const base of spacingCands.slice(0, 4)) {
    for (let ds = -1; ds <= 1; ds += 0.25) {
      const s = base + ds
      const key = Math.round(s * 4)
      if (s < 4 || tried.has(key)) continue
      tried.add(key)
      const tol = Math.max(1.5, 0.12 * s)
      for (const anchor of peaks) {
        // anchor 를 지나는 간격 s 의 격자 위치마다 가까운 봉우리 찾기
        const kMin = Math.ceil(-anchor.pos / s)
        const kMax = Math.floor((length - 1 - anchor.pos) / s)
        const matched: (Peak | null)[] = []
        for (let k = kMin; k <= kMax; k++) {
          const at = anchor.pos + k * s
          let near: Peak | null = null
          for (const p of peaks) if (Math.abs(p.pos - at) <= tol && (!near || p.value > near.value)) near = p
          matched.push(near)
        }
        // 가장 긴 연속 구간 (한 칸 빈 곳은 허용: 돌로 거의 다 가려진 선)
        const strongest = Math.max(...matched.map((m) => m?.value ?? 0))
        const ok = matched.map((m) => !!m && m.value >= 0.3 * strongest)
        let runStart = -1
        for (let i = 0; i <= ok.length; i++) {
          const inside = i < ok.length && (ok[i] || (i > 0 && i + 1 < ok.length && ok[i - 1] && ok[i + 1]))
          if (inside && runStart < 0) runStart = i
          if (!inside && runStart >= 0) {
            const run = matched.slice(runStart, i)
            const count = run.filter(Boolean).length
            if (count >= 4) {
              const score = run.reduce((sum, m) => sum + (m?.value ?? 0), 0) * (count >= 5 ? 1 : 0.5)
              if (score > bestScore) {
                // 최소제곱으로 간격·시작점 다듬기
                const pts = run.map((m, idx) => (m ? { k: idx, x: m.pos } : null)).filter((v): v is { k: number; x: number } => !!v)
                const n = pts.length
                const mk = pts.reduce((a, p) => a + p.k, 0) / n
                const mx = pts.reduce((a, p) => a + p.x, 0) / n
                let num = 0
                let den = 0
                for (const p of pts) {
                  num += (p.k - mk) * (p.x - mx)
                  den += (p.k - mk) ** 2
                }
                const fs = den > 0 ? num / den : s
                const f0 = mx - fs * mk
                const rms = Math.sqrt(pts.reduce((a, p) => a + (p.x - (f0 + p.k * fs)) ** 2, 0) / n) / fs
                bestScore = score
                bestFit = {
                  spacing: fs,
                  lines: run.map((_, idx) => f0 + idx * fs),
                  strengths: run.map((m) => m?.value ?? 0),
                  rms,
                }
              }
            }
            runStart = -1
          }
        }
      }
    }
  }
  if (!bestFit) return null
  // 19줄보다 많으면 약한 쪽 끝부터 잘라 냄
  while (bestFit.lines.length > MAX_LINES) {
    const first = bestFit.strengths[0]
    const last = bestFit.strengths[bestFit.strengths.length - 1]
    if (first < last) {
      bestFit.lines.shift()
      bestFit.strengths.shift()
    } else {
      bestFit.lines.pop()
      bestFit.strengths.pop()
    }
  }
  return bestFit
}

class Sampler {
  constructor(
    private L: Float32Array,
    private w: number,
    private h: number,
  ) {}
  at(x: number, y: number): number {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return NaN
    return this.L[yi * this.w + xi]
  }
  /** 좁은 범위의 최소값 (선이 1픽셀 어긋나도 잡도록) */
  minAround(x: number, y: number, rx: number, ry: number): number {
    let m = Infinity
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
      const v = this.at(x + dx, y + dy)
      if (!Number.isNaN(v) && v < m) m = v
    }
    return m === Infinity ? NaN : m
  }
  meanAround(x: number, y: number, r: number): number {
    let sum = 0
    let n = 0
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const v = this.at(x + dx, y + dy)
      if (!Number.isNaN(v)) {
        sum += v
        n++
      }
    }
    return n ? sum / n : NaN
  }
}

interface PointFeatures {
  darkFrac: number
  meanIn: number
  armDark: number
  ringDark: number
}

function pointFeatures(
  S: Sampler,
  cx: number,
  cy: number,
  s: number,
  tDark: number,
  arms: { left: boolean; right: boolean; up: boolean; down: boolean },
): PointFeatures {
  // 안쪽 원
  const rIn = 0.32 * s
  let dark = 0
  let total = 0
  let sum = 0
  const step = Math.max(1, rIn / 6)
  for (let dy = -rIn; dy <= rIn; dy += step) {
    for (let dx = -rIn; dx <= rIn; dx += step) {
      if (dx * dx + dy * dy > rIn * rIn) continue
      const v = S.at(cx + dx, cy + dy)
      if (Number.isNaN(v)) continue
      total++
      sum += v
      if (v < tDark) dark++
    }
  }
  // 십자 선: 중심에서 조금 떨어진 곳(화점 점은 피함)부터 돌 반지름 안쪽까지
  let armHit = 0
  let armTotal = 0
  const dirs: [boolean, number, number][] = [
    [arms.left, -1, 0],
    [arms.right, 1, 0],
    [arms.up, 0, -1],
    [arms.down, 0, 1],
  ]
  for (const [on, ux, uy] of dirs) {
    if (!on) continue
    for (let t = 0.2; t <= 0.4; t += 0.04) {
      const x = cx + ux * t * s
      const y = cy + uy * t * s
      const v = S.minAround(x, y, uy ? 1 : 0, ux ? 1 : 0)
      if (Number.isNaN(v)) continue
      armTotal++
      if (v < tDark) armHit++
    }
  }
  // 돌 테두리 고리 (격자선 방향은 피함)
  let ringHit = 0
  let ringTotal = 0
  for (let a = 0; a < 360; a += 7.5) {
    const m = a % 90
    if (m < 15 || m > 75) continue
    const rad = (a * Math.PI) / 180
    let darkest = Infinity
    for (let r = 0.4; r <= 0.5; r += 0.025) {
      const v = S.at(cx + Math.cos(rad) * r * s, cy + Math.sin(rad) * r * s)
      if (!Number.isNaN(v) && v < darkest) darkest = v
    }
    if (darkest === Infinity) continue
    ringTotal++
    if (darkest < tDark) ringHit++
  }
  return {
    darkFrac: total ? dark / total : 0,
    meanIn: total ? sum / total : 1,
    armDark: armTotal ? armHit / armTotal : 0,
    ringDark: ringTotal ? ringHit / ringTotal : 0,
  }
}

function classify(f: PointFeatures, bg: number): Color | null {
  if (f.darkFrac >= 0.5) return 'B'
  if (f.armDark >= 0.55) return null
  if (f.ringDark >= 0.45 || f.meanIn > bg + 0.06) return 'W'
  return null
}

/** 가장자리 판정: 바깥쪽으로 수직선이 더 뻗어 있지 않으면 판의 끝 */
function isEdge(
  resp: Float32Array,
  w: number,
  h: number,
  tau: number,
  line: number,
  across: number[],
  outward: -1 | 1,
  s: number,
  vertical: boolean,
  empties: boolean[],
  strengthRatio: number,
): boolean {
  let hit = 0
  let total = 0
  let outside = false
  across.forEach((c, idx) => {
    if (!empties[idx]) return
    for (let t = 0.2; t <= 0.45; t += 0.05) {
      const pos = line + outward * t * s
      const x = vertical ? pos : c
      const y = vertical ? c : pos
      const xi = Math.round(x)
      const yi = Math.round(y)
      if (xi < 1 || yi < 1 || xi >= w - 1 || yi >= h - 1) {
        outside = true
        continue
      }
      total++
      // 선 방향에 수직으로 1픽셀 여유
      let v = 0
      for (let d = -1; d <= 1; d++) {
        const ii = vertical ? (yi + d) * w + xi : yi * w + xi + d
        v = Math.max(v, resp[ii] ?? 0)
      }
      if (v > tau) hit++
    }
  })
  if (total < 4) {
    // 이미지가 바로 그 선에서 끝나면 가장자리. 그 줄이 돌로 가득하면 선 굵기로 판단(가장자리 선이 보통 더 굵음)
    return outside || strengthRatio >= 1.25
  }
  return hit / total < 0.3
}

/** 이미지에서 바둑판을 읽음. 격자를 찾지 못하면 null */
export function recognizeBoard(img: RGBAImage): Recognition | null {
  const { width: w, height: h } = img
  if (w < 40 || h < 40) return null
  const L = luminance(img)
  const vResp = thinLineResponse(L, w, h, true)
  const hResp = thinLineResponse(L, w, h, false)
  const contrast = Math.max(percentile(vResp, 0.995), percentile(hResp, 0.995))
  if (contrast < 0.08) return null
  const tau = Math.max(0.05, 0.3 * contrast)

  const pc = profile(vResp, w, h, tau, true)
  const pr = profile(hResp, w, h, tau, false)
  const maxLag = Math.floor(Math.max(w, h) / 3)
  const sc = estimateSpacing(pc, 6, Math.min(maxLag, Math.floor(w / 3)))
  const sr = estimateSpacing(pr, 6, Math.min(maxLag, Math.floor(h / 3)))
  // 칸은 정사각형이므로 두 방향 후보를 함께 씀
  const cands = [...new Set([...sc, ...sr])].sort((a, b) => a - b)
  if (!cands.length) return null
  const fx = fitLines(findPeaks(pc), sc.length ? [...sc, ...sr] : sr, w)
  const fy = fitLines(findPeaks(pr), sr.length ? [...sr, ...sc] : sc, h)
  if (!fx || !fy) return null
  if (Math.abs(fx.spacing - fy.spacing) > 0.15 * Math.max(fx.spacing, fy.spacing)) {
    // 간격이 크게 다르면 신뢰할 수 없음
    return null
  }
  const s = (fx.spacing + fy.spacing) / 2
  const xs = fx.lines
  const ys = fy.lines
  const S = new Sampler(L, w, h)

  // 판 바탕 밝기: 칸 가운데들의 중앙값
  const cellVals: number[] = []
  for (let j = 0; j + 1 < ys.length; j++)
    for (let i = 0; i + 1 < xs.length; i++) {
      const v = S.meanAround((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2, 1)
      if (!Number.isNaN(v)) cellVals.push(v)
    }
  const bg = median(cellVals)
  // 선 밝기: 선분 가운데의 가장 어두운 값들의 중앙값
  const lineVals: number[] = []
  for (let j = 0; j + 1 < ys.length; j++)
    for (const x of xs) lineVals.push(S.minAround(x, (ys[j] + ys[j + 1]) / 2, 1, 0))
  for (let i = 0; i + 1 < xs.length; i++)
    for (const y of ys) lineVals.push(S.minAround((xs[i] + xs[i + 1]) / 2, y, 0, 1))
  const lineL = median(lineVals.filter((v) => !Number.isNaN(v)))
  const tDark = Math.min(bg - 0.08, (bg + lineL) / 2 + 0.04)

  const grid: (Color | null)[][] = ys.map((y, j) =>
    xs.map((x, i) => {
      const f = pointFeatures(S, x, y, s, tDark, {
        left: i > 0,
        right: i < xs.length - 1,
        up: j > 0,
        down: j < ys.length - 1,
      })
      return classify(f, bg)
    }),
  )

  const colStrength = median(fx.strengths)
  const rowStrength = median(fy.strengths)
  const emptyCol = (i: number) => ys.map((_, j) => grid[j][i] === null)
  const emptyRow = (j: number) => xs.map((_, i) => grid[j][i] === null)
  const edges: Edges = {
    left: isEdge(hResp, w, h, tau, xs[0], ys, -1, s, true, emptyCol(0), fx.strengths[0] / colStrength),
    right: isEdge(hResp, w, h, tau, xs[xs.length - 1], ys, 1, s, true, emptyCol(xs.length - 1), fx.strengths[fx.strengths.length - 1] / colStrength),
    top: isEdge(vResp, w, h, tau, ys[0], xs, -1, s, false, emptyRow(0), fy.strengths[0] / rowStrength),
    bottom: isEdge(vResp, w, h, tau, ys[ys.length - 1], xs, 1, s, false, emptyRow(ys.length - 1), fy.strengths[fy.strengths.length - 1] / rowStrength),
  }

  const { size, offset } = guessPlacement(xs.length, ys.length, edges)
  return { xs, ys, spacing: s, edges, grid, size, offset, irregularity: Math.max(fx.rms, fy.rms) }
}

/** 찾은 격자가 판의 어디에 해당하는지 추정 */
export function guessPlacement(cols: number, rows: number, edges: Edges): { size: number; offset: { x: number; y: number } } {
  const full = edges.left && edges.right && edges.top && edges.bottom
  // 네 변이 모두 판 끝이면 전체 판, 아니면 19줄 판의 일부(귀·변)로 봄
  const size = full ? Math.max(cols, rows) : 19
  return { size, offset: placementOffset(size, cols, rows, edges) }
}

export function placementOffset(size: number, cols: number, rows: number, edges: Edges): { x: number; y: number } {
  const x = edges.left || !edges.right ? 0 : Math.max(0, size - cols)
  const y = edges.top || !edges.bottom ? 0 : Math.max(0, size - rows)
  return { x, y }
}

/** 인식한 격자를 판 좌표의 돌 목록으로 (판 밖으로 나가는 돌은 버림) */
export function placeStones(grid: (Color | null)[][], size: number, offset: { x: number; y: number }): PlacedStone[] {
  const out: PlacedStone[] = []
  grid.forEach((row, j) =>
    row.forEach((c, i) => {
      const x = i + offset.x
      const y = j + offset.y
      if (c && x >= 0 && y >= 0 && x < size && y < size) out.push({ x, y, color: c })
    }),
  )
  return out
}

/** 돌 배치로 새 판 만들기 (루트에 AB/AW, 둘 차례 PL) */
export function positionTree(size: number, stones: PlacedStone[], toPlay: Color): GameTree {
  const ab = stones.filter((s) => s.color === 'B').map((s) => toSgf(s))
  const aw = stones.filter((s) => s.color === 'W').map((s) => toSgf(s))
  const props: Record<string, string[]> = { GM: ['1'], FF: ['4'], SZ: [String(size)], PL: [toPlay] }
  if (ab.length) props.AB = ab
  if (aw.length) props.AW = aw
  return createTree(size, props)
}
