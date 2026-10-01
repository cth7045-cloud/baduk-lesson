import { createTree } from '../go/tree/gameTree'
import { requireSupabase } from '../lib/supabase'
import { treeToStoredSgf } from './boards'

export interface Tag {
  id: string
  name: string
  sort_order: number
}

export interface ProblemRow {
  id: string
  board_id: string
  title: string
  to_play: 'B' | 'W'
  difficulty: number | null
  created_at: string
  updated_at: string
  tags: { tag_id: string }[]
}

export async function listTags(): Promise<Tag[]> {
  const { data, error } = await requireSupabase().from('tags').select('*').order('sort_order').order('name')
  if (error) throw new Error(error.message)
  return data as Tag[]
}

export async function createTag(name: string): Promise<Tag> {
  const { data, error } = await requireSupabase()
    .from('tags')
    .insert({ name: name.trim(), sort_order: 100 })
    .select('*')
    .single()
  if (error) throw new Error(error.code === '23505' ? '이미 있는 태그입니다.' : error.message)
  return data as Tag
}

export async function listProblems(): Promise<ProblemRow[]> {
  const { data, error } = await requireSupabase()
    .from('problems')
    .select('*, tags:problem_tags(tag_id)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as unknown as ProblemRow[]
}

export async function getProblem(id: string): Promise<ProblemRow> {
  const { data, error } = await requireSupabase()
    .from('problems')
    .select('*, tags:problem_tags(tag_id)')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ProblemRow
}

/** 새 문제: 빈 판(둘 차례만 정해 둠)으로 시작 */
export async function createProblem(title: string, size: number, toPlay: 'B' | 'W', tagIds: string[]): Promise<string> {
  const tree = createTree(size, { GM: ['1'], FF: ['4'], SZ: [String(size)], PL: [toPlay] })
  const { data, error } = await requireSupabase().rpc('create_problem', {
    p_title: title,
    p_size: size,
    p_sgf: treeToStoredSgf(tree),
    p_to_play: toPlay,
    p_tag_ids: tagIds,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateProblem(
  id: string,
  boardId: string,
  patch: { title: string; to_play: 'B' | 'W'; difficulty: number | null },
  tagIds: string[],
) {
  const sb = requireSupabase()
  const r1 = await sb.from('problems').update(patch).eq('id', id)
  if (r1.error) throw new Error(r1.error.message)
  const r2 = await sb.from('boards').update({ title: patch.title }).eq('id', boardId)
  if (r2.error) throw new Error(r2.error.message)
  const r3 = await sb.from('problem_tags').delete().eq('problem_id', id)
  if (r3.error) throw new Error(r3.error.message)
  if (tagIds.length) {
    const r4 = await sb.from('problem_tags').insert(tagIds.map((tag_id) => ({ problem_id: id, tag_id })))
    if (r4.error) throw new Error(r4.error.message)
  }
}
