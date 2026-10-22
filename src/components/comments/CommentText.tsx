import { Fragment, useMemo } from 'react'
import type { Point } from '../../go/types'
import s from './Comments.module.css'
import { parseCommentText } from './format'

interface Props {
  body: string
  boardSize: number
  onCoordClick?: (p: Point) => void
}

/** 코멘트 본문 표시: 줄바꿈, 굵게, 누를 수 있는 좌표 */
export function CommentText({ body, boardSize, onCoordClick }: Props) {
  const segs = useMemo(() => parseCommentText(body, boardSize), [body, boardSize])
  return (
    <div className={s.text}>
      {segs.map((seg, i) => {
        if (seg.kind === 'break') return <br key={i} />
        if (seg.kind === 'coord') {
          const btn = (
            <button type="button" className={s.coord} onClick={() => onCoordClick?.(seg.point)}>
              {seg.text}
            </button>
          )
          return <Fragment key={i}>{seg.bold ? <strong>{btn}</strong> : btn}</Fragment>
        }
        return seg.bold ? <strong key={i}>{seg.text}</strong> : <Fragment key={i}>{seg.text}</Fragment>
      })}
    </div>
  )
}
