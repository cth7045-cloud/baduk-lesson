import { guessCorners, photoAuto, readGridPhoto, type Quad } from './photo'
import { recognizeBoard, type Recognition, type RGBAImage } from './recognize'
import type { Color } from '../types'

export * from './recognize'
export * from './photo'

export type ReadResult =
  /** 반듯한 그림 (화면 캡처, 스캔한 책 그림): 판 일부만 보여도 됨 */
  | { mode: 'flat'; rec: Recognition }
  /** 사진: 원근을 보정해 판 전체를 읽음 */
  | { mode: 'photo'; corners: Quad; n: number; grid: (Color | null)[][] }
  /** 자동으로 못 찾음: 네 귀를 손으로 맞춰야 함 */
  | { mode: 'manual'; corners: Quad; n: number }

/** 반듯한 격자로 보는 기준 (선 위치가 등간격에서 벗어난 정도) */
const FLAT_LIMIT = 0.06

export function readBoardImage(img: RGBAImage): ReadResult {
  let rec: Recognition | null = null
  try {
    rec = recognizeBoard(img)
  } catch {
    rec = null
  }
  if (rec && rec.irregularity < FLAT_LIMIT && rec.xs.length >= 5 && rec.ys.length >= 5) return { mode: 'flat', rec }
  let auto = null
  try {
    auto = photoAuto(img)
  } catch {
    auto = null
  }
  if (auto?.ok) return { mode: 'photo', corners: auto.corners, n: auto.n, grid: readGridPhoto(img, auto.corners, auto.n, auto.n) }
  // 반듯한 그림으로 찾은 것이 있으면 사진 방식보다 낫다
  if (rec) return { mode: 'flat', rec }
  return { mode: 'manual', corners: auto?.corners ?? guessCorners(img), n: auto?.n ?? 19 }
}
