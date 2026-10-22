import { newGame } from '../go/sgf/convert'
import { requireSupabase } from '../lib/supabase'
import { treeToStoredSgf } from './boards'

export type LessonStatus = 'live' | 'ended'
export type ControlMode = 'teacher' | 'everyone'

export interface LessonRow {
  id: string
  title: string
  board_id: string
  status: LessonStatus
  control_mode: ControlMode
  started_at: string
  ended_at: string | null
  updated_at: string
}

export interface LessonWithPeople extends LessonRow {
  participants: { student_id: string; profiles: { display_name: string } | null }[]
}

export async function listLessons(): Promise<LessonWithPeople[]> {
  const { data, error } = await requireSupabase()
    .from('lesson_rooms')
    .select('*, participants:lesson_participants(student_id, profiles(display_name))')
    .order('started_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return data as unknown as LessonWithPeople[]
}

export async function getLesson(id: string): Promise<LessonWithPeople> {
  const { data, error } = await requireSupabase()
    .from('lesson_rooms')
    .select('*, participants:lesson_participants(student_id, profiles(display_name))')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as LessonWithPeople
}

export async function createLesson(title: string, size: number, studentIds: string[]): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_lesson', {
    p_title: title,
    p_size: size,
    p_sgf: treeToStoredSgf(newGame(size)),
    p_student_ids: studentIds,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateLesson(id: string, patch: Partial<Pick<LessonRow, 'title' | 'control_mode' | 'status' | 'ended_at'>>) {
  const { error } = await requireSupabase().from('lesson_rooms').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** 수업 상태(조작 권한, 종료) 변경을 실시간으로 받음 */
export function subscribeLesson(id: string, onChange: (row: LessonRow) => void): () => void {
  const sb = requireSupabase()
  const channel = sb
    .channel(`lesson-row:${id}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lesson_rooms', filter: `id=eq.${id}` }, (p) =>
      onChange(p.new as LessonRow),
    )
    .subscribe()
  return () => {
    void sb.removeChannel(channel)
  }
}
