import { useState, type PointerEvent } from 'react'
import s from './charts.module.css'
import { useWidth } from './useWidth'

export interface LineSeries {
  name: string
  /** CSS 색 (변수 가능) */
  color: string
  values: (number | null)[]
}

interface Props {
  xLabels: string[]
  series: LineSeries[]
  yDomain: [number, number]
  yTicks: number[]
  yFormat: (v: number) => string
  /** 계단형 (급수처럼 변할 때까지 유지되는 값) */
  step?: boolean
  height?: number
  /** 툴팁의 x 설명 (생략하면 xLabels) */
  xDetail?: string[]
}

const PAD = { top: 16, right: 64, bottom: 30, left: 44 }

/**
 * 선 그래프. 2px 선, 끝점 표시, 끝에 값 표시, 세로 안내선 + 모든 선의 값 툴팁.
 * 선이 2개 이상이면 범례를 위에 둠.
 */
export function LineChart({ xLabels, series, yDomain, yTicks, yFormat, step, height = 220, xDetail }: Props) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = xLabels.length
  const w = Math.max(240, width)
  const plotW = w - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH

  function path(values: (number | null)[]) {
    let d = ''
    let prev: { x: number; y: number } | null = null
    values.forEach((v, i) => {
      if (v === null) {
        prev = null
        return
      }
      const px = x(i)
      const py = y(v)
      if (!prev) d += `M${px},${py}`
      else if (step) d += `H${px}V${py}`
      else d += `L${px},${py}`
      prev = { x: px, y: py }
    })
    return d
  }

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left
    if (n <= 1) return setHover(0)
    const i = Math.round(((px - PAD.left) / plotW) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  // x축 글자는 겹치지 않을 만큼만
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 72))))

  return (
    <div ref={ref} className={s.chart}>
      {series.length > 1 && (
        <div className={s.legend}>
          {series.map((sr) => (
            <span key={sr.name} className={s.legendItem}>
              <i className={s.lineKey} style={{ background: sr.color }} />
              {sr.name}
            </span>
          ))}
        </div>
      )}
      <svg
        width={w}
        height={height}
        className={s.svg}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${series.map((sr) => sr.name).join(', ')} 그래프`}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className={s.grid} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className={s.tick}>
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className={s.tick}>
              {l}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className={s.crosshair} />}
        {series.map((sr) => (
          <g key={sr.name}>
            <path d={path(sr.values)} fill="none" stroke={sr.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {sr.values.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5.5 : 4} fill={sr.color} stroke="var(--surface)" strokeWidth={2} />
              ),
            )}
          </g>
        ))}
        {/* 끝 값 표시 (마지막 값만) */}
        {series.map((sr) => {
          let last = -1
          sr.values.forEach((v, i) => v !== null && (last = i))
          if (last < 0) return null
          return (
            <text key={sr.name} x={x(last) + 9} y={y(sr.values[last]!)} dy="0.32em" className={s.endLabel}>
              {yFormat(sr.values[last]!)}
            </text>
          )
        })}
      </svg>
      {hover !== null && (
        <div className={s.tooltip} style={{ left: Math.min(Math.max(x(hover), 70), w - 70) }}>
          <div className={s.tipTitle}>{xDetail?.[hover] ?? xLabels[hover]}</div>
          {series.map((sr) =>
            sr.values[hover] === null ? null : (
              <div key={sr.name} className={s.tipRow}>
                <i className={s.lineKey} style={{ background: sr.color }} />
                <b>{yFormat(sr.values[hover]!)}</b>
                <span>{sr.name}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
