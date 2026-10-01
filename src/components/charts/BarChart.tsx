import { useState } from 'react'
import s from './charts.module.css'
import { useWidth } from './useWidth'

export interface Bar {
  label: string
  value: number
  /** 툴팁에 함께 보일 설명 (예: "2 / 4 문제") */
  detail?: string
  /** 강조할 막대 (나머지는 회색) */
  emphasis?: boolean
}

/** 가로 막대 (0–100%). 강조한 막대만 색, 나머지는 회색. 값은 막대 끝에 */
export function BarChart({ bars, format = (v) => `${v}%` }: { bars: Bar[]; format?: (v: number) => string }) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const labelW = 76
  const valueW = 48
  const rowH = 34
  const barH = 18
  const w = Math.max(240, width)
  const plotW = w - labelW - valueW
  const height = bars.length * rowH + 6

  return (
    <div ref={ref} className={s.chart}>
      <svg width={w} height={height} className={s.svg} role="img" aria-label="주제별 정답률">
        <line x1={labelW} x2={labelW} y1={0} y2={height} className={s.axis} />
        {bars.map((b, i) => {
          const top = i * rowH + (rowH - barH) / 2
          const bw = Math.max(2, (b.value / 100) * plotW)
          const r = Math.min(4, bw / 2)
          // 바깥쪽 끝만 둥글게, 기준선 쪽은 각지게
          const d = `M${labelW},${top} H${labelW + bw - r} Q${labelW + bw},${top} ${labelW + bw},${top + r} V${top + barH - r} Q${labelW + bw},${top + barH} ${labelW + bw - r},${top + barH} H${labelW} Z`
          return (
            <g
              key={b.label}
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              tabIndex={0}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <rect x={0} y={i * rowH} width={w} height={rowH} fill="transparent" />
              <text x={labelW - 10} y={top + barH / 2} dy="0.32em" textAnchor="end" className={s.barLabel}>
                {b.label}
              </text>
              <path d={d} fill={b.emphasis ? 'var(--viz-accent)' : 'var(--viz-muted)'} opacity={hover === null || hover === i ? 1 : 0.7} />
              <text x={labelW + bw + 6} y={top + barH / 2} dy="0.32em" className={s.endLabel}>
                {format(b.value)}
              </text>
            </g>
          )
        })}
      </svg>
      {hover !== null && bars[hover] && (
        <div className={s.tooltip} style={{ left: Math.min(labelW + (bars[hover].value / 100) * plotW, w - 80), top: hover * rowH + rowH + 4 }}>
          <div className={s.tipRow}>
            <b>{format(bars[hover].value)}</b>
            <span>{bars[hover].label}</span>
          </div>
          {bars[hover].detail && <div className={s.tipTitle}>{bars[hover].detail}</div>}
        </div>
      )}
    </div>
  )
}
