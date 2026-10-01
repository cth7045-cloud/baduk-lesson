import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/*
 * Supabase 연결. 주소와 공개 키는 .env 파일에서 읽음 (코드에 직접 쓰지 않음).
 * 공개 키(anon / publishable)는 브라우저에 노출되어도 되는 키이며, 실제 보호는 DB의 RLS가 맡음.
 * 관리자 키(service_role)는 절대 여기에 넣지 않음 — Edge Function 안에서만 사용.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = !!url && !!key && !url.includes('your-project-ref')

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null

/** Supabase가 꼭 필요한 곳에서 사용. 설정이 없으면 오류 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase 연결 정보(.env)가 없습니다.')
  return supabase
}
