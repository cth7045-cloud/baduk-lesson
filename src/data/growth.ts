import { requireSupabase } from '../lib/supabase'

export interface RankEntry {
  id: string
  student_id: string
  rank: string
  recorded_on: string
  note: string
}

export interface StudentNote {
  id: string
  student_id: string
  body: string
  created_at: string
  updated_at: string
}

export async function listRanks(studentId: string): Promise<RankEntry[]> {
  const { data, error } = await requireSupabase()
    .from('rank_history')
    .select('*')
    .eq('student_id', studentId)
    .order('recorded_on', { ascending: true })
  if (error) throw new Error(error.message)
  return data as RankEntry[]
}

/** 급수 기록 추가. 가장 최근 기록이면 학생의 "현재 급수"도 함께 바꿈 */
export async function addRank(studentId: string, rank: string, recordedOn: string, note: string, isLatest: boolean) {
  const sb = requireSupabase()
  const r = await sb.from('rank_history').insert({ student_id: studentId, rank, recorded_on: recordedOn, note })
  if (r.error) throw new Error(r.error.message)
  if (isLatest) {
    const p = await sb.from('profiles').update({ current_rank: rank }).eq('id', studentId)
    if (p.error) throw new Error(p.error.message)
  }
}

export async function deleteRank(id: string) {
  const { error } = await requireSupabase().from('rank_history').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** 상담 메모 (선생님만. 학생은 RLS로 아예 못 읽음) */
export async function listNotes(studentId: string): Promise<StudentNote[]> {
  const { data, error } = await requireSupabase()
    .from('student_notes')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as StudentNote[]
}

export async function saveNote(studentId: string, id: string | null, body: string): Promise<void> {
  const sb = requireSupabase()
  const r = id
    ? await sb.from('student_notes').update({ body }).eq('id', id)
    : await sb.from('student_notes').insert({ student_id: studentId, body })
  if (r.error) throw new Error(r.error.message)
}

export async function deleteNote(id: string) {
  const { error } = await requireSupabase().from('student_notes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
