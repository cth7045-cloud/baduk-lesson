import type { ImportedGame } from '../go/sgf/convert'
import { BOARD_MEMO } from '../components/comments/types'
import { requireSupabase } from '../lib/supabase'
import { treeToStoredSgf } from './boards'

export interface Submission {
  id: string
  student_id: string
  board_id: string
  title: string
  student_note: string
  played_on: string | null
  status: 'submitted' | 'reviewed'
  reviewed_at: string | null
  created_at: string
  updated_at: string
  profiles: { display_name: string } | null
}

const SELECT = '*, profiles(display_name)'

export async function listSubmissions(): Promise<Submission[]> {
  const { data, error } = await requireSupabase().from('game_submissions').select(SELECT).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as unknown as Submission[]
}

export async function getSubmission(id: string): Promise<Submission> {
  const { data, error } = await requireSupabase().from('game_submissions').select(SELECT).eq('id', id).single()
  if (error) throw new Error(error.message)
  return data as unknown as Submission
}

/** 학생: 실전 기보 제출. 기보 안에 있던 메모는 읽기 전용 "원본 메모"로 보존 */
export async function createSubmission(
  info: { title: string; playedOn: string | null; note: string },
  game: ImportedGame,
): Promise<string> {
  const notes = Object.entries(game.nodeComments).map(([node_id, body]) => ({ node_id, body }))
  if (game.gameComment) notes.push({ node_id: null as unknown as string, body: game.gameComment })
  const { data, error } = await requireSupabase().rpc('create_submission', {
    p_title: info.title,
    p_size: game.tree.size,
    p_sgf: treeToStoredSgf(game.tree),
    p_played_on: info.playedOn,
    p_note: info.note,
    p_notes: notes,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function setSubmissionStatus(id: string, status: 'submitted' | 'reviewed') {
  const { error } = await requireSupabase()
    .from('game_submissions')
    .update({ status, reviewed_at: status === 'reviewed' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** 원본 기보 메모 (노드 ID → 글, 판 전체는 BOARD_MEMO) */
export async function listSourceNotes(boardId: string): Promise<Record<string, string>> {
  const { data, error } = await requireSupabase().from('board_source_notes').select('node_id, body').eq('board_id', boardId)
  if (error) throw new Error(error.message)
  const out: Record<string, string> = {}
  for (const r of data as { node_id: string | null; body: string }[]) out[r.node_id ?? BOARD_MEMO] = r.body
  return out
}
