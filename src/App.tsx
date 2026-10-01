import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthProvider'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { HomePage } from './features/home/HomePage'
import { PracticePage } from './features/practice/PracticePage'
import { StudentsPage } from './features/students/StudentsPage'
import { supabaseConfigured } from './lib/supabase'
import s from './App.module.css'

function Header() {
  const { profile, signOut } = useAuth()
  const teacher = profile?.role === 'teacher'
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? s.active : '')
  return (
    <header className={s.header}>
      <div className={s.headerInner}>
        <NavLink to="/" className={s.brand}>
          <span className={s.logo} aria-hidden>
            <span />
            <span />
          </span>
          바둑 수업
        </NavLink>
        <nav className={s.nav}>
          {teacher && (
            <NavLink to="/students" className={link}>
              학생 관리
            </NavLink>
          )}
          {(teacher || !supabaseConfigured) && (
            <NavLink to="/practice" className={link}>
              연습판
            </NavLink>
          )}
        </nav>
        {profile && (
          <div className={s.user}>
            <span className={s.userName}>
              {profile.display_name}
              <span className={s.role}>{teacher ? '선생님' : '학생'}</span>
            </span>
            <button type="button" className={s.logout} onClick={() => void signOut()}>
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <main className={s.main}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                supabaseConfigured ? (
                  <RequireAuth>
                    <HomePage />
                  </RequireAuth>
                ) : (
                  <Navigate to="/practice" replace />
                )
              }
            />
            <Route
              path="/students"
              element={
                <RequireAuth role="teacher">
                  <StudentsPage />
                </RequireAuth>
              }
            />
            {/* 연습판: 서버 연결 전에는 누구나, 연결 후에는 선생님만 */}
            <Route
              path="/practice"
              element={
                supabaseConfigured ? (
                  <RequireAuth role="teacher">
                    <PracticePage />
                  </RequireAuth>
                ) : (
                  <PracticePage />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
  )
}
