import type { RealtimeChannel } from '@supabase/supabase-js'
import { BOARD_MEMO, type BoardComment, type CommentMap } from '../components/comments/types'
import { requireSupabase } from '../lib/supabase'

/*
 * 코멘트 저장소 (Supabase board_comments 테이블).
 * 학생은 RLS 때문에 읽기만 가능 — 쓰기 요청은 DB가 거부함.
 */

interface CommentRow {
  id: string
  board_id: string
  node_id: string | null
  body: string
  created_at: string
  updated_at: string
}

function toComment(r: CommentRow): BoardComment {
  return { key: r.node_id ?? BOARD_MEMO, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at }
}

const nodeIdOf = (key: string) => (key === BOARD_MEMO ? null : key)

export async function listComments(boardId: string): Promise<CommentMap> {
  const { data, error } = await requireSupabase().from('board_comments').select('*').eq('board_id', boardId)
  if (error) throw new Error(error.message)
  const map: CommentMap = {}
  for (const r of data as CommentRow[]) map[r.node_id ?? BOARD_MEMO] = toComment(r)
  return map
}

/** 코멘트 저장 (있으면 고치고 없으면 새로) */
export async function saveComment(boardId: string, key: string, body: string): Promise<BoardComment> {
  const sb = requireSupabase()
  const nodeId = nodeIdOf(key)
  let q = sb.from('board_comments').select('id').eq('board_id', boardId)
  q = nodeId === null ? q.is('node_id', null) : q.eq('node_id', nodeId)
  const { data: existing, error: findErr } = await q.maybeSingle()
  if (findErr) throw new Error(findErr.message)
  const res = existing
    ? await sb.from('board_comments').update({ body }).eq('id', existing.id).select('*').single()
    : await sb.from('board_comments').insert({ board_id: boardId, node_id: nodeId, body }).select('*').single()
  if (res.error) throw new Error(res.error.message)
  return toComment(res.data as CommentRow)
}

export async function deleteComment(boardId: string, key: string): Promise<void> {
  const nodeId = nodeIdOf(key)
  let q = requireSupabase().from('board_comments').delete().eq('board_id', boardId)
  q = nodeId === null ? q.is('node_id', null) : q.eq('node_id', nodeId)
  const { error } = await q
  if (error) throw new Error(error.message)
}

/**
 * 코멘트 변경을 실시간으로 받음. 삭제 알림에는 행 ID만 오므로 ID → 키 표를 따로 관리.
 * 돌려주는 함수를 부르면 구독 해제.
 */
export function subscribeComments(
  boardId: string,
  handlers: { upsert: (c: BoardComment) => void; remove: (key: string) => void },
): () => void {
  const sb = requireSupabase()
  const idToKey = new Map<string, string>()
  const channel: RealtimeChannel = sb
    .channel(`comments:${boardId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'board_comments', filter: `board_id=eq.${boardId}` }, (p) => {
      if (p.eventType === 'DELETE') {
        const key = idToKey.get((p.old as { id: string }).id)
        if (key) handlers.remove(key)
        return
      }
      const row = p.new as CommentRow
      idToKey.set(row.id, row.node_id ?? BOARD_MEMO)
      handlers.upsert(toComment(row))
    })
    // 필터는 삭제 알림에 적용되지 않으므로 삭제는 따로 받아서 ID로 걸러냄
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'board_comments' }, (p) => {
      const key = idToKey.get((p.old as { id: string }).id)
      if (key) handlers.remove(key)
    })
    .subscribe()

  // 처음 목록의 ID도 기억해 둠 (삭제 알림 대응)
  void sb
    .from('board_comments')
    .select('id, node_id')
    .eq('board_id', boardId)
    .then(({ data }) => {
      for (const r of (data ?? []) as { id: string; node_id: string | null }[]) idToKey.set(r.id, r.node_id ?? BOARD_MEMO)
    })

  return () => {
    void sb.removeChannel(channel)
  }
}

/** 판의 코멘트를 통째로 바꿈 (SGF 불러오기 때). 선생님만 가능 */
export async function replaceAllComments(boardId: string, comments: Record<string, string>, memo: string) {
  const sb = requireSupabase()
  const del = await sb.from('board_comments').delete().eq('board_id', boardId)
  if (del.error) throw new Error(del.error.message)
  const rows = Object.entries(comments).map(([node_id, body]) => ({ board_id: boardId, node_id, body }))
  if (memo.trim()) rows.push({ board_id: boardId, node_id: null as unknown as string, body: memo.trim() })
  if (!rows.length) return
  const ins = await sb.from('board_comments').insert(rows)
  if (ins.error) throw new Error(ins.error.message)
}
