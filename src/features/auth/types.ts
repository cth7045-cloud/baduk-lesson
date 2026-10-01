export type UserRole = 'teacher' | 'student'

export interface Profile {
  id: string
  role: UserRole
  display_name: string
  login_id: string | null
  current_rank: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
