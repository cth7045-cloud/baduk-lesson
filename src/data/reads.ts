import { requireSupabase } from '../lib/supabase'

/** 이 판을 지금 열어 봤다고 기록 ("새 코멘트 있음" 표시 해제) */
export async function markBoardRead(userId: string, boardId: string) {
  await requireSupabase()
    .from('board_reads')
    .upsert({ user_id: userId, board_id: boardId, last_seen_at: new Date().toISOString() })
}

/**
 * 여러 판 중 "마지막으로 본 뒤 코멘트가 새로 생기거나 바뀐" 판 ID 목록.
 * 한 번도 안 본 판은 코멘트가 하나라도 있으면 새 코멘트로 봄.
 */
export async function boardsWithNewComments(userId: string, boardIds: string[]): Promise<Set<string>> {
  const ids = boardIds.filter(Boolean)
  if (!ids.length) return new Set()
  const sb = requireSupabase()
  const [comments, reads] = await Promise.all([
    sb.from('board_comments').select('board_id, updated_at').in('board_id', ids),
    sb.from('board_reads').select('board_id, last_seen_at').eq('user_id', userId).in('board_id', ids),
  ])
  if (comments.error || reads.error) return new Set()
  const seen = new Map((reads.data as { board_id: string; last_seen_at: string }[]).map((r) => [r.board_id, r.last_seen_at]))
  const out = new Set<string>()
  for (const c of comments.data as { board_id: string; updated_at: string }[]) {
    const last = seen.get(c.board_id)
    if (!last || c.updated_at > last) out.add(c.board_id)
  }
  return out
}

/** 판별 코멘트 개수 */
export async function commentCounts(boardIds: string[]): Promise<Map<string, number>> {
  const ids = boardIds.filter(Boolean)
  const out = new Map<string, number>()
  if (!ids.length) return out
  const { data } = await requireSupabase().from('board_comments').select('board_id').in('board_id', ids)
  for (const r of (data ?? []) as { board_id: string }[]) out.set(r.board_id, (out.get(r.board_id) ?? 0) + 1)
  return out
}
