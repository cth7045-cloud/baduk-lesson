import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authErrorMessage, loginToEmail } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import type { Profile } from './types'

interface AuthState {
  /** 처음 로그인 상태를 확인하는 중 */
  loading: boolean
  session: Session | null
  profile: Profile | null
  /** 실패 시 오류 문구, 성공 시 null */
  signIn: (idOrEmail: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return (data as Profile | null) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(!!supabase)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      setProfile(data.session ? await fetchProfile(data.session.user.id) : null)
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) setProfile(null)
      else
        // 콜백 안에서 바로 Supabase를 다시 부르면 멈출 수 있어 다음 차례로 미룸
        setTimeout(() => {
          void fetchProfile(s.user.id).then((p) => alive && setProfile(p))
        }, 0)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (idOrEmail: string, password: string) => {
    if (!supabase) return 'Supabase 연결 정보가 없습니다.'
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginToEmail(idOrEmail), password })
    if (error) return authErrorMessage(error.message)
    const p = await fetchProfile(data.user.id)
    if (!p) {
      await supabase.auth.signOut()
      return '계정 정보를 찾을 수 없습니다. 선생님께 문의하세요.'
    }
    if (!p.is_active) {
      await supabase.auth.signOut()
      return '사용이 정지된 계정입니다. 선생님께 문의하세요.'
    }
    setSession(data.session)
    setProfile(p)
    return null
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session) setProfile(await fetchProfile(session.user.id))
  }, [session])

  const value = useMemo(
    () => ({ loading, session, profile, signIn, signOut, refreshProfile }),
    [loading, session, profile, signIn, signOut, refreshProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
