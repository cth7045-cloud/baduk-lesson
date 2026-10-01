import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import type { UserRole } from './types'
import s from './Auth.module.css'

/** 로그인(및 역할)이 필요한 화면을 감쌈 */
export function RequireAuth({ role, children }: { role?: UserRole; children: ReactNode }) {
  const { loading, session, profile, signOut } = useAuth()
  const location = useLocation()
  if (loading) return <p className={s.loading}>불러오는 중…</p>
  if (session && !profile)
    return (
      <p className={s.loading}>
        계정 정보를 불러오는 중… 오래 걸리면{' '}
        <button type="button" className={s.linkBtn} onClick={() => void signOut()}>
          로그아웃
        </button>
        후 다시 로그인해 주세요.
      </p>
    )
  if (!session || !profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (role && profile.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}
