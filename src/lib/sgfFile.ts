import { BOARD_MEMO, type CommentMap } from '../components/comments/types'
import { decodeSgfBytes } from '../go/sgf/encoding'
import { exportSgf, importSgf, type ImportedGame } from '../go/sgf/convert'
import type { GameTree } from '../go/tree/gameTree'
import { downloadText, safeFileName, todayStamp } from './download'

/** 파일 선택 창에서 고른 SGF 파일 읽기 (EUC-KR 자동 판별) */
export async function readSgfFile(file: File): Promise<ImportedGame> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return importSgf(decodeSgfBytes(bytes))
}

/** 불러온 기보의 코멘트 → 코멘트 목록 */
export function commentsFromImport(nodeComments: Record<string, string>, gameComment: string): CommentMap {
  const now = new Date().toISOString()
  const map: CommentMap = {}
  for (const [key, body] of Object.entries(nodeComments)) map[key] = { key, body, createdAt: now, updatedAt: now }
  if (gameComment) map[BOARD_MEMO] = { key: BOARD_MEMO, body: gameComment, createdAt: now, updatedAt: now }
  return map
}

/** 기보 정보(GN, 대국자)로 제목 만들기 */
export function titleFromTree(tree: GameTree, fallback: string): string {
  const root = tree.nodes[tree.rootId].props
  const gn = root.GN?.[0]?.trim()
  if (gn) return gn
  const pb = root.PB?.[0]?.trim()
  const pw = root.PW?.[0]?.trim()
  if (pb || pw) return `${pb || '흑'} vs ${pw || '백'}`
  return fallback
}

/** 코멘트를 C·GC에 넣어 SGF 파일로 내려받기 */
export function downloadSgfWithComments(tree: GameTree, comments: CommentMap, title: string) {
  const nodeComments: Record<string, string> = {}
  for (const [k, v] of Object.entries(comments)) if (k !== BOARD_MEMO) nodeComments[k] = v.body
  const text = exportSgf(tree, { nodeComments, gameComment: comments[BOARD_MEMO]?.body })
  downloadText(`${safeFileName(title)}_${todayStamp()}.sgf`, text)
}
