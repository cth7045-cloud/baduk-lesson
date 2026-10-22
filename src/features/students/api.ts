import { FunctionsHttpError } from '@supabase/supabase-js'
import { requireSupabase } from '../../lib/supabase'
import type { Profile } from '../auth/types'

export async function listStudents(): Promise<Profile[]> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .eq('role', 'student')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data as Profile[]
}

export async function updateStudent(id: string, patch: { display_name?: string; current_rank?: string | null }) {
  const { error } = await requireSupabase().from('profiles').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Edge Function(manage-students) 호출. 실패하면 한국어 오류 문구로 예외 */
async function manage(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await requireSupabase().functions.invoke('manage-students', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => null)
      throw new Error(detail?.error ?? '요청을 처리하지 못했습니다.')
    }
    throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.')
  }
  return data as Record<string, unknown>
}

export function createStudent(loginId: string, displayName: string, password: string) {
  return manage({ action: 'create', loginId, displayName, password })
}

export function resetStudentPassword(userId: string, password: string) {
  return manage({ action: 'reset_password', userId, password })
}

export function setStudentActive(userId: string, active: boolean) {
  return manage({ action: 'set_active', userId, active })
}
