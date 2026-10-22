import { useState, type ReactNode } from 'react'
import s from './charts.module.css'

export interface TableView {
  columns: string[]
  rows: (string | number)[][]
}

/** 그래프 카드: 제목·설명 + "표로 보기" 전환 (색을 구분하기 어려운 경우·인쇄용) */
export function ChartCard({ title, subtitle, table, children, empty }: { title: string; subtitle?: string; table?: TableView; children: ReactNode; empty?: string }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <div>
          <h2 className={s.cardTitle}>{title}</h2>
          {subtitle && <p className={s.cardSub}>{subtitle}</p>}
        </div>
        {table && !empty && (
          <button type="button" className={s.toggle} onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
            {asTable ? '그래프로 보기' : '표로 보기'}
          </button>
        )}
      </header>
      {empty ? (
        <p className={s.empty}>{empty}</p>
      ) : asTable && table ? (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {/* 인쇄할 때는 표도 함께 (그래프만으로는 값이 안 보일 수 있음) */}
      {table && !empty && !asTable && (
        <div className={`${s.tableWrap} ${s.printOnly}`}>
          <table className={s.table}>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
