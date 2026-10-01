import { memo, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
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
}

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
}: GoBoardProps) {
  const size = board.size
  const uid = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const down = useRef<{ x: number; y: number; type: string } | null>(null)
  const [hover, setHover] = useState<Point | null>(null)

  const pad = showCoords ? S * 1.1 : S * 0.62
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

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!interactive) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    down.current = { x: e.clientX, y: e.clientY, type: e.pointerType }
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const d = down.current
    down.current = null
    if (!d || !onPointClick) return
    // 손가락이 많이 움직였으면 화면 스크롤로 보고 무시
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return
    const p = toPoint(e.clientX, e.clientY)
    if (p) onPointClick(p, d.type)
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType !== 'mouse' || !interactive) return
    const p = toPoint(e.clientX, e.clientY)
    setHover((h) => (h?.x === p?.x && h?.y === p?.y ? h : p))
  }

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
    <div className={s.wrap} style={{ backgroundImage: `url(${woodTextureUrl()})` }}>
      <svg
        ref={svgRef}
        className={`${s.svg} ${interactive ? s.interactive : ''}`}
        viewBox={`0 0 ${full} ${full}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (down.current = null)}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
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
          <g className={s.coords} fontSize={S * 0.36} fill="#4a3a22" textAnchor="middle">
            {Array.from({ length: size }, (_, i) => (
              <g key={`c${i}`}>
                <text x={pos(i)} y={pad * 0.42} dominantBaseline="central">
                  {displayColumnLabel(i)}
                </text>
                <text x={pos(i)} y={full - pad * 0.42} dominantBaseline="central">
                  {displayColumnLabel(i)}
                </text>
                <text x={pad * 0.42} y={pos(i)} dominantBaseline="central">
                  {size - i}
                </text>
                <text x={full - pad * 0.42} y={pos(i)} dominantBaseline="central">
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
