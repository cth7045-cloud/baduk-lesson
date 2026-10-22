import { memo, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { displayColumnLabel, starPoints } from '../../go/coords'
import type { NodeMarkup } from '../../go/markup'
import type { BoardState } from '../../go/rules/board'
import type { Color, Point } from '../../go/types'
import s from './GoBoard.module.css'
import { woodTextureUrl } from './woodTexture'

/** 격자 한 칸 크기 (SVG 내부 단위) */
const S = 40

export interface GoBoardProps {
  board: BoardState
  markup?: NodeMarkup
  lastMove?: Point | null
  /** 점 인덱스(y*size+x) → 수 번호. 주면 돌 위에 번호 표시 */
  numbers?: Map<number, number> | null
  /** 코멘트가 달린 수의 점 인덱스 */
  commented?: Set<number>
  /** 현재 수에서 갈라지는 다음 수 후보 */
  variationHints?: { p: Point; color: Color }[]
  /** 터치에서 "한 번 더 탭하면 착수" 대기 중인 돌 */
  pending?: { p: Point; color: Color } | null
  /** 코멘트의 좌표를 눌렀을 때 강조할 점 */
  highlights?: Point[]
  highlightKey?: number
  /** 화살표 도구: 시작점 */
  arrowFrom?: Point | null
  showCoords?: boolean
  /** 마우스를 올렸을 때 미리 보여 줄 돌 색 (null이면 표시 안 함) */
  hoverColor?: Color | null
  onPointClick?: (p: Point, pointerType: string) => void
  /**
   * 수 이동 제스처 (카타고 클라우드와 같음): 마우스 휠·터치패드 두 손가락 위아래, 터치 두 손가락 위아래 = 앞뒤 수,
   * 오른쪽 클릭(터치패드 두 손가락 탭)·터치 세 손가락 탭 = 한 수 뒤로. delta: -1 이전 / +1 다음
   */
  onStep?: (delta: number) => void
}

/** 터치 제스처 기준값 (카타고 클라우드와 같음) */
const LONG_PRESS_MS = 200
const TAP_MOVE = 24
const TWO_FINGER_STEP = 28

function cellIndex(p: Point, size: number) {
  return p.y * size + p.x
}

export const GoBoard = memo(function GoBoard({
  board,
  markup,
  lastMove,
  numbers,
  commented,
  variationHints,
  pending,
  highlights,
  highlightKey,
  arrowFrom,
  showCoords = true,
  hoverColor,
  onPointClick,
  onStep,
}: GoBoardProps) {
  const size = board.size
  const uid = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const down = useRef<{ x: number; y: number; type: string } | null>(null)
  const [hover, setHover] = useState<Point | null>(null)

  // 좌표 글자가 가장자리 돌에 가리지 않을 만큼만 여백을 둠
  const pad = showCoords ? S * 1.0 : S * 0.56
  const label = S * 0.3
  const full = (size - 1) * S + pad * 2
  const pos = (i: number) => pad + i * S
  const interactive = !!onPointClick

  const stars = useMemo(() => starPoints(size), [size])

  function toPoint(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    const x = Math.round((pt.x - pad) / S)
    const y = Math.round((pt.y - pad) / S)
    if (x < 0 || y < 0 || x >= size || y >= size) return null
    return { x, y }
  }

  // ---------- 마우스·펜: 버튼을 뗄 때 착수 (터치패드의 가벼운 탭도 확실히) ----------
  const lastPointer = useRef('mouse')
  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    lastPointer.current = e.pointerType
    if (e.pointerType === 'touch') return // 터치는 아래의 터치 제스처에서 처리
    if (!interactive) return
    if (e.button !== 0) return
    down.current = { x: e.clientX, y: e.clientY, type: e.pointerType }
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType === 'touch') return
    const d = down.current
    down.current = null
    if (!d || !onPointClick) return
    const p = toPoint(e.clientX, e.clientY)
    if (p) onPointClick(p, d.type)
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType !== 'mouse' || !interactive) return
    const p = toPoint(e.clientX, e.clientY)
    setHover((h) => (h?.x === p?.x && h?.y === p?.y ? h : p))
  }

  /** 오른쪽 클릭 = 한 수 뒤로 (터치의 길게 누르기로 열리는 메뉴는 막기만 함) */
  function onContextMenu(e: MouseEvent) {
    e.preventDefault()
    if (lastPointer.current === 'mouse') onStep?.(-1)
  }

  // ---------- 휠·터치 제스처 (passive: false 가 필요해 직접 등록) ----------
  const wrapRef = useRef<HTMLDivElement>(null)
  const live = useRef({ onPointClick, onStep, hoverColor, toPoint })
  live.current = { onPointClick, onStep, hoverColor, toPoint }
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let wheelAcc = 0
    let wheelAt = 0
    const onWheel = (ev: WheelEvent) => {
      const step = live.current.onStep
      if (!step || ev.ctrlKey) return
      ev.preventDefault()
      const dy = ev.deltaMode === 1 ? ev.deltaY * 40 : ev.deltaY
      const now = performance.now()
      // 마우스 휠 한 칸(크게 한 번) = 한 수
      if (Math.abs(dy) >= 50 && now - wheelAt > 300) {
        step(Math.sign(dy))
        return
      }
      // 터치패드: 작은 움직임을 모음. 손가락을 아래로 = 다음 수 (휴대폰의 두 손가락과 같은 방향)
      if (now - wheelAt > 300) wheelAcc = 0
      wheelAt = now
      wheelAcc -= dy
      while (Math.abs(wheelAcc) >= 60) {
        step(Math.sign(wheelAcc))
        wheelAcc -= 60 * Math.sign(wheelAcc)
      }
    }

    type Gesture = {
      n: number
      x0: number
      y0: number
      lastY: number
      t0: number
      moved: boolean
      aim: boolean
      acc: number
      timer: number
      last: { x: number; y: number }
    }
    let tg: Gesture | null = null
    const mid = (ts: TouchList) => {
      let x = 0
      let y = 0
      for (const t of Array.from(ts)) {
        x += t.clientX
        y += t.clientY
      }
      return { x: x / ts.length, y: y / ts.length }
    }
    const aimAt = (pt: { x: number; y: number }) => {
      const p = live.current.toPoint(pt.x, pt.y)
      setHover((h) => (h?.x === p?.x && h?.y === p?.y ? h : p))
    }
    const onStart = (ev: TouchEvent) => {
      if (tg?.timer) window.clearTimeout(tg.timer)
      const n = ev.touches.length
      const m = mid(ev.touches)
      const g: Gesture = { n, x0: m.x, y0: m.y, lastY: m.y, t0: performance.now(), moved: false, aim: false, acc: 0, timer: 0, last: m }
      tg = g
      // 한 손가락을 0.2초 누르고 있으면 조준: 손가락을 따라 미리 보기 돌이 움직이고, 떼면 그 자리에 남음 (착수는 안 함)
      if (n === 1 && live.current.onPointClick && live.current.hoverColor) {
        g.timer = window.setTimeout(() => {
          g.timer = 0
          g.aim = true
          aimAt(g.last)
        }, LONG_PRESS_MS)
      }
      if (n >= 2) ev.preventDefault() // 두 손가락 이상: 확대·화면 스크롤 대신 제스처
    }
    const onMove = (ev: TouchEvent) => {
      const g = tg
      if (!g) return
      const m = mid(ev.touches)
      g.last = m
      if (Math.hypot(m.x - g.x0, m.y - g.y0) > TAP_MOVE) {
        g.moved = true
        // 길게 누르기 전에 움직였으면 화면 스크롤
        if (g.timer) {
          window.clearTimeout(g.timer)
          g.timer = 0
        }
      }
      if (g.n === 1 && g.aim) {
        ev.preventDefault()
        aimAt(m)
        return
      }
      if (g.n === 2 && ev.touches.length === 2) {
        ev.preventDefault()
        const step = live.current.onStep
        g.acc += m.y - g.lastY // 손가락을 아래로 = 다음 수
        g.lastY = m.y
        while (step && Math.abs(g.acc) >= TWO_FINGER_STEP) {
          step(Math.sign(g.acc))
          g.acc -= TWO_FINGER_STEP * Math.sign(g.acc)
        }
      }
    }
    const onEnd = (ev: TouchEvent) => {
      const g = tg
      if (!g) return
      if (g.timer) {
        window.clearTimeout(g.timer)
        g.timer = 0
      }
      if (g.n === 1 && ev.touches.length === 0) {
        if (!g.aim && !g.moved) {
          // 짧게 톡 = 착수
          ev.preventDefault()
          const p = live.current.toPoint(g.last.x, g.last.y)
          if (p) live.current.onPointClick?.(p, 'touch')
        } else if (g.aim) ev.preventDefault()
      }
      // 세 손가락으로 빠르게 톡 = 한 수 뒤로
      if (g.n === 3 && !g.moved && ev.touches.length === 0 && performance.now() - g.t0 < 400) live.current.onStep?.(-1)
      if (ev.touches.length === 0) tg = null
    }
    const onCancel = () => {
      if (tg?.timer) window.clearTimeout(tg.timer)
      tg = null
    }
    // 조준해 둔 미리 보기 돌은 화면 어디든 다음에 누르면 사라짐
    const clearAim = () => setHover(null)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: false })
    el.addEventListener('touchcancel', onCancel)
    document.addEventListener('touchstart', clearAim, { capture: true, passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
      document.removeEventListener('touchstart', clearAim, { capture: true })
      if (tg?.timer) window.clearTimeout(tg.timer)
    }
  }, [])

  // 표시 색: 돌 위에서는 반대색, 빈 점에서는 진한 색
  const markColor = (p: Point) => {
    const c = board.get(p)
    return c === 1 ? '#fff' : c === 2 ? '#111' : '#1d1a15'
  }

  const stones: { p: Point; c: 1 | 2 }[] = []
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = board.cells[y * size + x]
      if (c) stones.push({ p: { x, y }, c: c as 1 | 2 })
    }

  const markedPoints = new Set<number>()
  markup?.shapes.forEach((m) => markedPoints.add(cellIndex(m.p, size)))
  markup?.labels.forEach((m) => markedPoints.add(cellIndex(m.p, size)))

  const showHover = hover && hoverColor && !pending && board.get(hover) === 0
  const lastIdx = lastMove ? cellIndex(lastMove, size) : -1
  const r = S * 0.485

  return (
    <div ref={wrapRef} className={s.wrap} style={{ backgroundImage: `url(${woodTextureUrl()})` }}>
      <svg
        ref={svgRef}
        className={`${s.svg} ${interactive ? s.interactive : ''}`}
        viewBox={`0 0 ${full} ${full}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (down.current = null)}
        onPointerMove={onPointerMove}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        onContextMenu={onContextMenu}
        role="img"
        aria-label={`${size}줄 바둑판`}
      >
        <defs>
          <radialGradient id={`b${uid}`} cx="35%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#5d5d5d" />
            <stop offset="35%" stopColor="#262626" />
            <stop offset="100%" stopColor="#050505" />
          </radialGradient>
          <radialGradient id={`w${uid}`} cx="38%" cy="33%" r="72%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f1f0eb" />
            <stop offset="100%" stopColor="#c9c7bd" />
          </radialGradient>
          <marker
            id={`ah${uid}`}
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#b8321c" />
          </marker>
        </defs>

        {/* 격자 */}
        <g stroke="#2a2216" strokeWidth={S * 0.028} strokeLinecap="square">
          {Array.from({ length: size }, (_, i) => (
            <line key={`h${i}`} x1={pos(0)} y1={pos(i)} x2={pos(size - 1)} y2={pos(i)} />
          ))}
          {Array.from({ length: size }, (_, i) => (
            <line key={`v${i}`} x1={pos(i)} y1={pos(0)} x2={pos(i)} y2={pos(size - 1)} />
          ))}
          <rect
            x={pos(0)}
            y={pos(0)}
            width={(size - 1) * S}
            height={(size - 1) * S}
            fill="none"
            strokeWidth={S * 0.05}
          />
        </g>
        <g fill="#2a2216">
          {stars.map((p) => (
            <circle key={`s${p.x}-${p.y}`} cx={pos(p.x)} cy={pos(p.y)} r={S * 0.1} />
          ))}
        </g>

        {/* 좌표 */}
        {showCoords && (
          <g className={s.coords} fontSize={S * 0.31} fill="#4a3a22" textAnchor="middle">
            {Array.from({ length: size }, (_, i) => (
              <g key={`c${i}`}>
                <text x={pos(i)} y={label} dominantBaseline="central">
                  {displayColumnLabel(i)}
                </text>
                <text x={pos(i)} y={full - label} dominantBaseline="central">
                  {displayColumnLabel(i)}
                </text>
                <text x={label} y={pos(i)} dominantBaseline="central">
                  {size - i}
                </text>
                <text x={full - label} y={pos(i)} dominantBaseline="central">
                  {size - i}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* 다음 수 후보(변화도) */}
        {variationHints?.map((v) =>
          board.get(v.p) === 0 ? (
            <circle
              key={`v${v.p.x}-${v.p.y}-${v.color}`}
              cx={pos(v.p.x)}
              cy={pos(v.p.y)}
              r={S * 0.15}
              fill={v.color === 'B' ? '#111' : '#fff'}
              stroke={v.color === 'W' ? '#555' : 'none'}
              strokeWidth={S * 0.02}
              opacity={0.55}
            />
          ) : null,
        )}

        {/* 돌 */}
        <g>
          {stones.map(({ p, c }) => (
            <g key={`st${p.x}-${p.y}`}>
              <circle cx={pos(p.x) + S * 0.035} cy={pos(p.y) + S * 0.06} r={r} fill="rgba(40,25,5,0.28)" />
              <circle
                cx={pos(p.x)}
                cy={pos(p.y)}
                r={r}
                fill={`url(#${c === 1 ? 'b' : 'w'}${uid})`}
                stroke={c === 2 ? '#9a978c' : 'none'}
                strokeWidth={S * 0.015}
              />
            </g>
          ))}
        </g>

        {/* 수 번호 */}
        {numbers && (
          <g fontWeight={600} textAnchor="middle">
            {[...numbers].map(([idx, n]) => {
              const p = { x: idx % size, y: Math.floor(idx / size) }
              if (markedPoints.has(idx)) return null
              const c = board.cells[idx]
              const fill = idx === lastIdx ? '#d8432a' : c === 1 ? '#fff' : '#111'
              const fs = n >= 100 ? S * 0.36 : S * 0.44
              return (
                <text
                  key={`n${idx}`}
                  x={pos(p.x)}
                  y={pos(p.y)}
                  dy="0.35em"
                  fontSize={fs}
                  fill={fill}
                  letterSpacing={n >= 100 ? -1 : 0}
                >
                  {n}
                </text>
              )
            })}
          </g>
        )}

        {/* 마지막 수 표시 (번호 표시 중이 아니고 다른 표시가 없을 때) */}
        {lastMove && !numbers && !markedPoints.has(lastIdx) && board.get(lastMove) !== 0 && (
          <circle
            cx={pos(lastMove.x)}
            cy={pos(lastMove.y)}
            r={S * 0.2}
            fill="none"
            stroke={board.get(lastMove) === 1 ? '#fff' : '#111'}
            strokeWidth={S * 0.065}
          />
        )}

        {/* 도형 표시 */}
        <g fill="none" strokeWidth={S * 0.07} strokeLinejoin="round">
          {markup?.shapes.map(({ p, kind }) => {
            const cx = pos(p.x)
            const cy = pos(p.y)
            const col = markColor(p)
            const k = `${kind}${p.x}-${p.y}`
            if (kind === 'CR') return <circle key={k} cx={cx} cy={cy} r={S * 0.24} stroke={col} />
            if (kind === 'SQ') {
              const h = S * 0.21
              return <rect key={k} x={cx - h} y={cy - h} width={h * 2} height={h * 2} stroke={col} />
            }
            if (kind === 'TR') {
              const h = S * 0.27
              return (
                <path
                  key={k}
                  d={`M${cx},${cy - h} L${cx + h * 0.92},${cy + h * 0.55} L${cx - h * 0.92},${cy + h * 0.55} Z`}
                  stroke={col}
                />
              )
            }
            const h = S * 0.18
            return (
              <path key={k} d={`M${cx - h},${cy - h} L${cx + h},${cy + h} M${cx + h},${cy - h} L${cx - h},${cy + h}`} stroke={col} />
            )
          })}
        </g>

        {/* 글자 표시 */}
        <g textAnchor="middle" fontWeight={700}>
          {markup?.labels.map(({ p, text }) => {
            const empty = board.get(p) === 0
            return (
              <g key={`lb${p.x}-${p.y}`}>
                {empty && <circle cx={pos(p.x)} cy={pos(p.y)} r={S * 0.34} fill="#dfb873" />}
                <text
                  x={pos(p.x)}
                  y={pos(p.y)}
                  dy="0.36em"
                  fontSize={text.length > 2 ? S * 0.34 : S * 0.5}
                  fill={markColor(p)}
                >
                  {text}
                </text>
              </g>
            )
          })}
        </g>

        {/* 코멘트가 달린 수 */}
        {commented && (
          <g>
            {[...commented].map((idx) => {
              const x = pos(idx % size) + S * 0.33
              const y = pos(Math.floor(idx / size)) - S * 0.33
              return (
                <circle key={`cm${idx}`} cx={x} cy={y} r={S * 0.12} fill="var(--comment)" stroke="#fff" strokeWidth={S * 0.035} />
              )
            })}
          </g>
        )}

        {/* 화살표 */}
        <g stroke="#b8321c" strokeWidth={S * 0.085} strokeLinecap="round" opacity={0.92}>
          {markup?.arrows.map(({ from, to }) => {
            const x1 = pos(from.x)
            const y1 = pos(from.y)
            const x2 = pos(to.x)
            const y2 = pos(to.y)
            const len = Math.hypot(x2 - x1, y2 - y1) || 1
            const shorten = S * 0.18
            return (
              <line
                key={`ar${from.x}-${from.y}-${to.x}-${to.y}`}
                x1={x1}
                y1={y1}
                x2={x2 - ((x2 - x1) / len) * shorten}
                y2={y2 - ((y2 - y1) / len) * shorten}
                markerEnd={`url(#ah${uid})`}
              />
            )
          })}
        </g>
        {arrowFrom && <circle cx={pos(arrowFrom.x)} cy={pos(arrowFrom.y)} r={S * 0.16} fill="#b8321c" opacity={0.85} />}

        {/* 좌표 강조 (코멘트에서 누른 좌표) */}
        {highlights?.map((p) => (
          <circle
            key={`hl${highlightKey}-${p.x}-${p.y}`}
            className={s.highlight}
            cx={pos(p.x)}
            cy={pos(p.y)}
            r={S * 0.56}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={S * 0.09}
          />
        ))}

        {/* 마우스 미리보기 돌 */}
        {showHover && (
          <circle
            cx={pos(hover.x)}
            cy={pos(hover.y)}
            r={r}
            fill={hoverColor === 'B' ? '#111' : '#fff'}
            opacity={hoverColor === 'B' ? 0.4 : 0.6}
            pointerEvents="none"
          />
        )}

        {/* 터치: 확정 대기 돌 */}
        {pending && (
          <g pointerEvents="none">
            <circle
              cx={pos(pending.p.x)}
              cy={pos(pending.p.y)}
              r={r}
              fill={pending.color === 'B' ? '#111' : '#fff'}
              opacity={0.6}
            />
            <circle
              cx={pos(pending.p.x)}
              cy={pos(pending.p.y)}
              r={r + S * 0.06}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={S * 0.06}
              strokeDasharray={`${S * 0.16} ${S * 0.1}`}
            />
          </g>
        )}
      </svg>
    </div>
  )
})
