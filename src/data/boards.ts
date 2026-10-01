import { exportSgf, importSgf } from '../go/sgf/convert'
import type { GameTree } from '../go/tree/gameTree'
import { requireSupabase } from '../lib/supabase'

export type BoardKind = 'lesson' | 'problem' | 'material' | 'submission' | 'attempt' | 'practice'

export interface BoardRow {
  id: string
  kind: BoardKind
  title: string
  size: number
  sgf: string
  created_by: string | null
  created_at: string
  updated_at: string
}

/** 수순 트리 → DB 저장용 SGF (노드 ID 포함, 코멘트 제외) */
export function treeToStoredSgf(tree: GameTree): string {
  return exportSgf(tree, { keepIds: true })
}

export async function loadBoard(id: string): Promise<{ row: BoardRow; tree: GameTree }> {
  const { data, error } = await requireSupabase().from('boards').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  const row = data as BoardRow
  return { row, tree: importSgf(row.sgf).tree }
}

export async function saveBoardTree(id: string, tree: GameTree): Promise<void> {
  const { error } = await requireSupabase()
    .from('boards')
    .update({ sgf: treeToStoredSgf(tree), size: tree.size })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
