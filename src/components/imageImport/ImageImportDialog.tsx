import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import {
  homography,
  hApply,
  placeStones,
  placementOffset,
  positionTree,
  readBoardImage,
  readGridPhoto,
  UNIT,
  type Edges,
  type Quad,
  type RGBAImage,
} from '../../go/recognize'
import type { GameTree } from '../../go/tree/gameTree'
import { BOARD_SIZES, type Color } from '../../go/types'
import s from './ImageImport.module.css'

interface Props {
  onClose: () => void
  /** 읽은 배치로 만든 새 판 */
  onApply: (tree: GameTree, summary: string) => void
  /** 처음부터 열 이미지 (붙여넣기로 열었을 때) */
  initialFile?: Blob | null
  /** "판에 놓기" 버튼 글자 */
  applyLabel?: string
}

type Cell = Color | null

interface Check {
  step: 'check'
  corners: Quad
  cols: number
  rows: number
  grid: Cell[][]
  /** 판 전체가 보이는 그림인지 (아니면 귀·변) */
  full: boolean
  edges: Edges
  size: number
  offset: { x: number; y: number }
  how: 'flat' | 'photo' | 'manual'
}

interface Corners {
  step: 'corners'
  corners: Quad
  n: number
  failed: boolean
}

type View = { step: 'pick' } | { step: 'reading' } | Check | Corners

const MAX_SIDE = 1400
const MIN_SIDE = 600

/** 이미지 → 계산용 픽셀 (너무 크면 줄이고 너무 작으면 키움) */
async function loadImage(file: Blob): Promise<{ canvas: HTMLCanvasElement; img: RGBAImage }> {
  const bmp = await createImageBitmap(file)
  const long = Math.max(bmp.width, bmp.height)
  const sc = long > MAX_SIDE ? MAX_SIDE / long : long < MIN_SIDE ? MIN_SIDE / long : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * sc))
  canvas.height = Math.max(1, Math.round(bmp.height * sc))
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  const data = g.getImageData(0, 0, canvas.width, canvas.height)
  return { canvas, img: { width: data.width, height: data.height, data: data.data } }
}

const CORNER_NAMES = [
  { key: 'tl', label: '왼쪽 위', left: true, top: true },
  { key: 'tr', label: '오른쪽 위', left: false, top: true },
  { key: 'bl', label: '왼쪽 아래', left: true, top: false },
  { key: 'br', label: '오른쪽 아래', left: false, top: false },
] as const

/**
 * 이미지(화면 캡처, 책 그림, 바둑판 사진)에서 돌을 읽어 판에 놓는 대화상자.
 * 자동으로 읽은 결과를 펴서 보여 주고, 틀린 곳은 눌러서 고침 (빈 곳 → 흑 → 백).
 */
export function ImageImportDialog({ onClose, onApply, initialFile, applyLabel = '판에 놓기' }: Props) {
  const [view, setView] = useState<View>({ step: 'pick' })
  const [toPlay, setToPlay] = useState<Color>('B')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const source = useRef<{ canvas: HTMLCanvasElement; img: RGBAImage } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const layout = useRef<{ m: number; step: number; k: number } | null>(null)
  const drag = useRef<{ idx: number; from: [number, number, number, number] } | null>(null)
  const [dragIdx, setDragIdx] = useState(-1)

  const open = useCallback(async (file: Blob) => {
    setError(null)
    setView({ step: 'reading' })
    try {
      source.current = await loadImage(file)
    } catch {
      setView({ step: 'pick' })
      setError('이미지를 열 수 없습니다. PNG·JPG 같은 그림 파일인지 확인해 주세요.')
      return
    }
    // 화면에 "읽는 중"이 먼저 그려지도록 한 박자 쉼
    await new Promise((r) => setTimeout(r, 30))
    const img = source.current.img
    const r = readBoardImage(img)
    if (r.mode === 'flat') {
      const { rec } = r
      const full = rec.edges.left && rec.edges.right && rec.edges.top && rec.edges.bottom
      setView({
        step: 'check',
        corners: [
          [rec.xs[0], rec.ys[0]],
          [rec.xs[rec.xs.length - 1], rec.ys[0]],
          [rec.xs[rec.xs.length - 1], rec.ys[rec.ys.length - 1]],
          [rec.xs[0], rec.ys[rec.ys.length - 1]],
        ],
        cols: rec.xs.length,
        rows: rec.ys.length,
        grid: rec.grid,
        full,
        edges: rec.edges,
        size: rec.size,
        offset: rec.offset,
        how: 'flat',
      })
    } else if (r.mode === 'photo') {
      setView({
        step: 'check',
        corners: r.corners,
        cols: r.n,
        rows: r.n,
        grid: r.grid,
        full: true,
        edges: { left: true, right: true, top: true, bottom: true },
        size: r.n,
        offset: { x: 0, y: 0 },
        how: 'photo',
      })
    } else {
      setView({ step: 'corners', corners: r.corners, n: r.n, failed: true })
    }
  }, [])

  useEffect(() => {
    if (initialFile) void open(initialFile)
  }, [initialFile, open])

  // 대화상자가 열려 있는 동안 Ctrl+V 로 캡처 붙여넣기
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromClipboard(e)
      if (!file) return
      e.preventDefault()
      void open(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open])

  // ---------- 그리기 ----------
  const draw = useCallback(() => {
    const cv = canvasRef.current
    const src = source.current
    if (!cv || !src || (view.step !== 'check' && view.step !== 'corners')) return
    const dpr = window.devicePixelRatio || 1
    const wMax = Math.min(560, stageRef.current?.clientWidth || 560)
    const hMax = window.innerHeight * 0.58
    let w: number
    let h: number
    if (view.step === 'check') {
      const ratio = view.cols / view.rows
      w = Math.min(wMax, hMax * ratio)
      h = w / ratio
    } else {
      const ratio = src.canvas.width / src.canvas.height
      w = Math.min(wMax, hMax * ratio)
      h = w / ratio
    }
    cv.style.width = `${w}px`
    cv.style.height = `${h}px`
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    const g = cv.getContext('2d')!
    g.clearRect(0, 0, cv.width, cv.height)
    if (view.step === 'check') drawCheck(g, cv, src.img, view, layout)
    else drawCorners(g, cv, src.canvas, view, dragIdx)
  }, [view, dragIdx])

  useEffect(() => {
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [draw])

  // ---------- 누르기: 돌 고치기 / 귀 옮기기 ----------
  function pointIn(e: ReactPointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const [fx, fy] = pointIn(e)
    const src = source.current
    if (!src) return
    if (view.step === 'check' && layout.current) {
      const { m, step } = layout.current
      const cv = e.currentTarget
      const i = Math.round((fx * cv.width - m) / step)
      const j = Math.round((fy * cv.height - m) / step)
      if (i < 0 || j < 0 || i >= view.cols || j >= view.rows) return
      const grid = view.grid.map((row) => row.slice())
      const c = grid[j][i]
      grid[j][i] = c === null ? 'B' : c === 'B' ? 'W' : null
      setView({ ...view, grid })
      return
    }
    if (view.step === 'corners') {
      const x = fx * src.canvas.width
      const y = fy * src.canvas.height
      let best = 0
      view.corners.forEach(([cx, cy], k) => {
        const [bx, by] = view.corners[best]
        if (Math.hypot(cx - x, cy - y) < Math.hypot(bx - x, by - y)) best = k
      })
      drag.current = { idx: best, from: [x, y, view.corners[best][0], view.corners[best][1]] }
      setDragIdx(best)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    const src = source.current
    if (!d || !src || view.step !== 'corners') return
    const [fx, fy] = pointIn(e)
    const W = src.canvas.width
    const H = src.canvas.height
    const [x0, y0, cx, cy] = d.from
    const corners = view.corners.map((p) => [...p]) as Quad
    corners[d.idx] = [Math.max(0, Math.min(W, cx + fx * W - x0)), Math.max(0, Math.min(H, cy + fy * H - y0))]
    setView({ ...view, corners })
  }

  function onPointerUp() {
    if (drag.current) {
      drag.current = null
      setDragIdx(-1)
    }
  }

  // ---------- 단계 이동 ----------
  function readCorners() {
    const src = source.current
    if (!src || view.step !== 'corners') return
    const grid = readGridPhoto(src.img, view.corners, view.n, view.n)
    setView({
      step: 'check',
      corners: view.corners,
      cols: view.n,
      rows: view.n,
      grid,
      full: true,
      edges: { left: true, right: true, top: true, bottom: true },
      size: view.n,
      offset: { x: 0, y: 0 },
      how: 'manual',
    })
  }

  function backToCorners() {
    if (view.step !== 'check') return
    const n = view.full && (BOARD_SIZES as readonly number[]).includes(view.cols) && view.cols === view.rows ? view.cols : 19
    setView({ step: 'corners', corners: view.corners, n, failed: false })
  }

  function apply() {
    if (view.step !== 'check') return
    const size = view.full ? view.cols : view.size
    const offset = view.full ? { x: 0, y: 0 } : view.offset
    const stones = placeStones(view.grid, size, offset)
    const b = stones.filter((st) => st.color === 'B').length
    onApply(positionTree(size, stones, toPlay), `이미지에서 흑 ${b} · 백 ${stones.length - b}개를 놓았습니다.`)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
    if (file) void open(file)
  }

  // ---------- 화면 ----------
  const counts = view.step === 'check' ? countStones(view.grid) : null
  let note: string
  if (view.step === 'pick') note = '바둑판 그림을 고르세요. 화면 캡처, 책·문제집 그림, 바둑판 사진 모두 됩니다.'
  else if (view.step === 'reading') note = '그림을 읽는 중…'
  else if (view.step === 'corners')
    note =
      (view.failed ? '바둑판을 자동으로 찾지 못했습니다. ' : '') +
      '네 개의 동그라미를 바둑판 맨 바깥 줄의 네 귀 교차점에 끌어다 놓으세요. 파란 격자가 판의 줄과 겹치면 됩니다.'
  else
    note =
      `${view.full ? `${view.cols}줄 바둑판` : `판의 일부(가로 ${view.cols}줄 × 세로 ${view.rows}줄)`}에서 흑 ${counts![0]} · 백 ${counts![1]}개를 읽었습니다. ` +
      '네모 = 읽은 돌(테두리 파랑 흑, 빨강 백). 틀린 곳을 누르면 빈 곳 → 흑 → 백으로 바뀝니다.'

  const check = view.step === 'check' ? view : null
  const partial = check && !check.full

  return (
    <Dialog
      title="이미지로 배치 불러오기"
      onClose={onClose}
      xl
      actions={
        <>
          {(view.step === 'check' || view.step === 'corners') && (
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              다른 이미지
            </Button>
          )}
          {check && (
            <Button variant="ghost" onClick={backToCorners}>
              모서리 다시
            </Button>
          )}
          <Button onClick={onClose}>취소</Button>
          {view.step === 'corners' && (
            <Button variant="primary" onClick={readCorners}>
              인식
            </Button>
          )}
          {check && (
            <Button variant="primary" onClick={apply}>
              {applyLabel}
            </Button>
          )}
        </>
      }
    >
      <p className={s.note} role="status">
        {note}
      </p>
      {error && <p className={s.error}>{error}</p>}

      {(view.step === 'pick' || view.step === 'reading') && (
        <div
          className={`${s.drop} ${dragOver ? s.dropOver : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {view.step === 'reading' ? (
            <span className={s.reading}>읽는 중…</span>
          ) : (
            <>
              <Button variant="primary" onClick={() => fileRef.current?.click()}>
                이미지 고르기
              </Button>
              <span className={s.dropHint}>
                또는 그림을 여기로 끌어다 놓기 · PC에서 캡처한 뒤 <kbd>Ctrl</kbd>+<kbd>V</kbd>
              </span>
            </>
          )}
        </div>
      )}

      {(view.step === 'check' || view.step === 'corners') && (
        <div className={s.body}>
          <div className={s.stage} ref={stageRef}>
            <canvas
              ref={canvasRef}
              className={s.canvas}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label={view.step === 'check' ? '읽은 배치 (눌러서 고치기)' : '네 귀 맞추기'}
            />
          </div>
          <div className={s.controls}>
            {view.step === 'corners' && (
              <label className={s.field}>
                바둑판 크기
                <div className={s.segment}>
                  {BOARD_SIZES.map((n) => (
                    <button key={n} type="button" className={view.n === n ? s.on : ''} onClick={() => setView({ ...view, n })}>
                      {n}줄
                    </button>
                  ))}
                </div>
              </label>
            )}
            {partial && check && (
              <>
                <div className={s.field}>
                  바둑판 크기
                  <div className={s.segment}>
                    {BOARD_SIZES.filter((n) => n >= Math.max(check.cols, check.rows)).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={check.size === n ? s.on : ''}
                        onClick={() => setView({ ...check, size: n, offset: placementOffset(n, check.cols, check.rows, check.edges) })}
                      >
                        {n}줄
                      </button>
                    ))}
                  </div>
                </div>
                <div className={s.field}>
                  그림이 판의 어느 쪽인가요?
                  <div className={s.corners}>
                    {CORNER_NAMES.map((c) => {
                      const off = {
                        x: c.left ? 0 : check.size - check.cols,
                        y: c.top ? 0 : check.size - check.rows,
                      }
                      const on = off.x === check.offset.x && off.y === check.offset.y
                      return (
                        <button key={c.key} type="button" className={on ? s.on : ''} onClick={() => setView({ ...check, offset: off })}>
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                  <MiniMap size={check.size} cols={check.cols} rows={check.rows} offset={check.offset} />
                </div>
              </>
            )}
            {check && (
              <div className={s.field}>
                다음 차례
                <div className={s.segment}>
                  <button type="button" className={toPlay === 'B' ? s.on : ''} onClick={() => setToPlay('B')}>
                    흑
                  </button>
                  <button type="button" className={toPlay === 'W' ? s.on : ''} onClick={() => setToPlay('W')}>
                    백
                  </button>
                </div>
              </div>
            )}
            {check?.how === 'photo' && <p className={s.small}>사진으로 보고 원근을 바로잡아 읽었습니다. 격자가 어긋났으면 "모서리 다시"를 누르세요.</p>}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void open(f)
        }}
      />
    </Dialog>
  )
}

/** 붙여넣기 내용 중 이미지 파일 */
export function imageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const it of items) if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile()
  return null
}

function countStones(grid: Cell[][]): [number, number] {
  let b = 0
  let w = 0
  for (const row of grid) for (const c of row) if (c === 'B') b++
    else if (c === 'W') w++
  return [b, w]
}

/** 그림이 판의 어디쯤인지 작은 판에 표시 */
function MiniMap({ size, cols, rows, offset }: { size: number; cols: number; rows: number; offset: { x: number; y: number } }) {
  const u = 60 / (size - 1)
  return (
    <svg className={s.mini} viewBox="-4 -4 68 68" aria-hidden>
      <rect x={-4} y={-4} width={68} height={68} fill="#dcb35c" rx={2} />
      <rect x={0} y={0} width={60} height={60} fill="none" stroke="#3a2a1a" strokeWidth={0.8} />
      <rect
        x={offset.x * u}
        y={offset.y * u}
        width={(cols - 1) * u}
        height={(rows - 1) * u}
        fill="rgba(42, 98, 168, 0.35)"
        stroke="#2a62a8"
        strokeWidth={1.2}
      />
    </svg>
  )
}

/** 읽은 격자 부분을 펴서 그리고, 읽은 돌을 네모로 표시 */
function drawCheck(
  g: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  img: RGBAImage,
  view: Check,
  layout: { current: { m: number; step: number; k: number } | null },
) {
  const { cols, rows } = view
  const Wc = cv.width
  const Hc = cv.height
  const step = Math.min(Wc / (cols + 0.8), Hc / (rows + 0.8))
  const m = step * 0.9
  const gw = step * (cols - 1)
  const gh = step * (rows - 1)
  const h = homography(UNIT, view.corners)
  if (!h) return
  const out = g.createImageData(Wc, Hc)
  const { width: W, height: H, data: d } = img
  for (let py = 0; py < Hc; py++)
    for (let px = 0; px < Wc; px++) {
      const [x, y] = hApply(h, (px - m) / gw, (py - m) / gh)
      const xi = Math.round(x)
      const yi = Math.round(y)
      const o = (py * Wc + px) * 4
      out.data[o + 3] = 255
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue
      const k = (yi * W + xi) * 4
      out.data[o] = d[k]
      out.data[o + 1] = d[k + 1]
      out.data[o + 2] = d[k + 2]
    }
  g.putImageData(out, 0, 0)
  const sq = step * 0.36
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const v = view.grid[j][i]
      if (!v) continue
      const x = m + i * step
      const y = m + j * step
      g.fillStyle = v === 'B' ? '#111318' : '#fff'
      g.strokeStyle = v === 'B' ? '#16c7e6' : '#e0484d'
      g.lineWidth = Math.max(1.5, step / 12)
      g.fillRect(x - sq / 2, y - sq / 2, sq, sq)
      g.strokeRect(x - sq / 2, y - sq / 2, sq, sq)
    }
  layout.current = { m, step, k: 1 }
}

/** 원본 그림 위에 네 귀와 그 사이의 격자 */
function drawCorners(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, src: HTMLCanvasElement, view: Corners, dragIdx: number) {
  const k = cv.width / src.width
  g.drawImage(src, 0, 0, cv.width, cv.height)
  const n = view.n
  const h = homography(UNIT, view.corners)
  if (h) {
    g.strokeStyle = 'rgba(22, 199, 230, .85)'
    g.lineWidth = Math.max(1, cv.width / 500)
    g.beginPath()
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const a = hApply(h, t, 0)
      const b = hApply(h, t, 1)
      const c = hApply(h, 0, t)
      const d = hApply(h, 1, t)
      g.moveTo(a[0] * k, a[1] * k)
      g.lineTo(b[0] * k, b[1] * k)
      g.moveTo(c[0] * k, c[1] * k)
      g.lineTo(d[0] * k, d[1] * k)
    }
    g.stroke()
  }
  const R = 11 * (window.devicePixelRatio || 1)
  view.corners.forEach(([x, y], i) => {
    g.fillStyle = i === dragIdx ? 'rgba(255, 196, 0, .45)' : 'rgba(22, 199, 230, .3)'
    g.strokeStyle = i === dragIdx ? '#ffc400' : '#16c7e6'
    g.lineWidth = 2.5
    g.beginPath()
    g.arc(x * k, y * k, R, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  })
  if (dragIdx >= 0) {
    // 돋보기: 손가락이 옮기는 귀를 가리므로
    const [x, y] = view.corners[dragIdx]
    const L = Math.min(cv.width, cv.height) * 0.22
    const z = 3
    const cx = x * k < cv.width / 2 ? cv.width - L - 8 : L + 8
    const cy = L + 8
    g.save()
    g.beginPath()
    g.arc(cx, cy, L, 0, Math.PI * 2)
    g.clip()
    g.drawImage(src, x - L / k / z, y - L / k / z, (2 * L) / k / z, (2 * L) / k / z, cx - L, cy - L, 2 * L, 2 * L)
    g.strokeStyle = '#ffc400'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(cx - 12, cy)
    g.lineTo(cx + 12, cy)
    g.moveTo(cx, cy - 12)
    g.lineTo(cx, cy + 12)
    g.stroke()
    g.restore()
    g.strokeStyle = '#fff'
    g.lineWidth = 2
    g.beginPath()
    g.arc(cx, cy, L, 0, Math.PI * 2)
    g.stroke()
  }
}
