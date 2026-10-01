import { exportSgf } from '../go/sgf/convert'
import type { GameTree } from '../go/tree/gameTree'
import { requireSupabase } from '../lib/supabase'

export interface AssignmentSet {
  id: string
  title: string
  description: string
  due_at: string | null
  created_at: string
  updated_at: string
}

export interface SetDetail extends AssignmentSet {
  problems: { problem_id: string; position: number; problems: { id: string; title: string; to_play: 'B' | 'W'; board_id: string } | null }[]
  targets: { student_id: string; profiles: { display_name: string; is_active: boolean } | null }[]
}

export interface Attempt {
  id: string
  set_id: string
  problem_id: string
  student_id: string
  board_id: string | null
  tries: number
  solved: boolean
  first_try_correct: boolean | null
  solved_at: string | null
  created_at: string
  updated_at: string
}

const SET_SELECT =
  '*, problems:assignment_set_problems(problem_id, position, problems(id, title, to_play, board_id)), targets:assignment_targets(student_id, profiles(display_name, is_active))'

function sortProblems(s: SetDetail): SetDetail {
  return { ...s, problems: [...s.problems].sort((a, b) => a.position - b.position) }
}

export async function listSets(): Promise<SetDetail[]> {
  const { data, error } = await requireSupabase()
    .from('assignment_sets')
    .select(SET_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as unknown as SetDetail[]).map(sortProblems)
}

export async function getSet(id: string): Promise<SetDetail> {
  const { data, error } = await requireSupabase().from('assignment_sets').select(SET_SELECT).eq('id', id).single()
  if (error) throw new Error(error.message)
  return sortProblems(data as unknown as SetDetail)
}

/** 과제 묶음 저장 (새로 만들거나 고침) — 문제 순서와 받는 학생까지 */
export async function saveSet(
  id: string | null,
  fields: { title: string; description: string; due_at: string | null },
  problemIds: string[],
  studentIds: string[],
): Promise<string> {
  const sb = requireSupabase()
  let setId = id
  if (setId) {
    const r = await sb.from('assignment_sets').update(fields).eq('id', setId)
    if (r.error) throw new Error(r.error.message)
  } else {
    const r = await sb.from('assignment_sets').insert(fields).select('id').single()
    if (r.error) throw new Error(r.error.message)
    setId = (r.data as { id: string }).id
  }
  // 문제 목록: 빠진 문제만 지우고 나머지는 순서 갱신 (학생 풀이 기록은 문제를 빼도 남음)
  const del = await sb.from('assignment_set_problems').delete().eq('set_id', setId)
  if (del.error) throw new Error(del.error.message)
  if (problemIds.length) {
    const ins = await sb
      .from('assignment_set_problems')
      .insert(problemIds.map((problem_id, position) => ({ set_id: setId, problem_id, position })))
    if (ins.error) throw new Error(ins.error.message)
  }
  // 받는 학생: 빠진 학생 삭제, 새 학생 추가 (기존 학생의 배정 시각 유지)
  const cur = await sb.from('assignment_targets').select('student_id').eq('set_id', setId)
  if (cur.error) throw new Error(cur.error.message)
  const existing = new Set((cur.data as { student_id: string }[]).map((r) => r.student_id))
  const removed = [...existing].filter((s) => !studentIds.includes(s))
  const added = studentIds.filter((s) => !existing.has(s))
  if (removed.length) {
    const r = await sb.from('assignment_targets').delete().eq('set_id', setId).in('student_id', removed)
    if (r.error) throw new Error(r.error.message)
  }
  if (added.length) {
    const r = await sb.from('assignment_targets').insert(added.map((student_id) => ({ set_id: setId, student_id })))
    if (r.error) throw new Error(r.error.message)
  }
  return setId!
}

export async function listAttempts(setId: string): Promise<Attempt[]> {
  const { data, error } = await requireSupabase().from('problem_attempts').select('*').eq('set_id', setId)
  if (error) throw new Error(error.message)
  return data as Attempt[]
}

export async function getAttempt(id: string): Promise<Attempt> {
  const { data, error } = await requireSupabase().from('problem_attempts').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data as Attempt
}

/**
 * 학생 풀이 기록 저장. 처음이면 풀이 기록 판(attempt)과 기록 행을 만들고, 이후에는 고침.
 * tree = 지금까지의 모든 시도를 변화도로 담은 판
 */
export async function recordAttempt(
  existing: Attempt | null,
  info: { setId: string; problemId: string; studentId: string; title: string },
  tree: GameTree,
  result: { tries: number; solved: boolean; firstTryCorrect: boolean | null },
): Promise<Attempt> {
  const sb = requireSupabase()
  const sgf = exportSgf(tree, { keepIds: true })
  let boardId = existing?.board_id ?? null
  if (boardId) {
    const r = await sb.from('boards').update({ sgf }).eq('id', boardId)
    if (r.error) throw new Error(r.error.message)
  } else {
    const r = await sb
      .from('boards')
      .insert({ kind: 'attempt', title: info.title, size: tree.size, sgf, created_by: info.studentId })
      .select('id')
      .single()
    if (r.error) throw new Error(r.error.message)
    boardId = (r.data as { id: string }).id
  }
  const fields = {
    board_id: boardId,
    tries: result.tries,
    solved: result.solved,
    first_try_correct: result.firstTryCorrect,
    solved_at: result.solved ? (existing?.solved_at ?? new Date().toISOString()) : null,
  }
  const r = existing
    ? await sb.from('problem_attempts').update(fields).eq('id', existing.id).select('*').single()
    : await sb
        .from('problem_attempts')
        .insert({ ...fields, set_id: info.setId, problem_id: info.problemId, student_id: info.studentId })
        .select('*')
        .single()
  if (r.error) throw new Error(r.error.message)
  return r.data as Attempt
}

/** 모든 풀이 기록 (선생님: 전체, 학생: RLS로 자기 것만) */
export async function listAllAttempts(): Promise<Attempt[]> {
  const { data, error } = await requireSupabase().from('problem_attempts').select('*')
  if (error) throw new Error(error.message)
  return data as Attempt[]
}
