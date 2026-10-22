import { lazy, Suspense } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthProvider'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { HomePage } from './features/home/HomePage'
import { supabaseConfigured } from './lib/supabase'
import s from './App.module.css'

// 화면별로 필요할 때만 불러옴 (폰에서 처음 여는 속도를 위해)
const AssignmentsPage = lazy(() => import('./features/assignments/AssignmentsPage').then((m) => ({ default: m.AssignmentsPage })))
const AttemptPage = lazy(() => import('./features/assignments/AttemptPage').then((m) => ({ default: m.AttemptPage })))
const ProblemEditorPage = lazy(() => import('./features/assignments/ProblemEditorPage').then((m) => ({ default: m.ProblemEditorPage })))
const SetPage = lazy(() => import('./features/assignments/SetPage').then((m) => ({ default: m.SetPage })))
const SolvePage = lazy(() => import('./features/assignments/SolvePage').then((m) => ({ default: m.SolvePage })))
const LibraryPage = lazy(() => import('./features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const MaterialPage = lazy(() => import('./features/library/MaterialPage').then((m) => ({ default: m.MaterialPage })))
const LessonPage = lazy(() => import('./features/lesson/LessonPage').then((m) => ({ default: m.LessonPage })))
const LessonsPage = lazy(() => import('./features/lesson/LessonsPage').then((m) => ({ default: m.LessonsPage })))
const PracticePage = lazy(() => import('./features/practice/PracticePage').then((m) => ({ default: m.PracticePage })))
const StudentsPage = lazy(() => import('./features/students/StudentsPage').then((m) => ({ default: m.StudentsPage })))
const SubmissionPage = lazy(() => import('./features/submissions/SubmissionPage').then((m) => ({ default: m.SubmissionPage })))
const GrowthIndexPage = lazy(() => import('./features/growth/GrowthPage').then((m) => ({ default: m.GrowthIndexPage })))
const GrowthPage = lazy(() => import('./features/growth/GrowthPage').then((m) => ({ default: m.GrowthPage })))
const SubmissionsPage = lazy(() => import('./features/submissions/SubmissionsPage').then((m) => ({ default: m.SubmissionsPage })))

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
          {profile && (
            <NavLink to="/lessons" className={link}>
              수업
            </NavLink>
          )}
          {profile && (
            <NavLink to="/assignments" className={link}>
              과제
            </NavLink>
          )}
          {profile && (
            <NavLink to="/library" className={link}>
              자료실
            </NavLink>
          )}
          {profile && (
            <NavLink to="/submissions" className={link}>
              {teacher ? '기보 제출함' : '내 기보'}
            </NavLink>
          )}
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
          <Suspense fallback={<p className={s.loading}>불러오는 중…</p>}>
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
              path="/lessons"
              element={
                <RequireAuth>
                  <LessonsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/lessons/:id"
              element={
                <RequireAuth>
                  <LessonPage />
                </RequireAuth>
              }
            />
            <Route path="/assignments" element={<RequireAuth><AssignmentsPage /></RequireAuth>} />
            <Route path="/assignments/:id" element={<RequireAuth><SetPage /></RequireAuth>} />
            <Route path="/assignments/:setId/solve/:problemId" element={<RequireAuth><SolvePage /></RequireAuth>} />
            <Route path="/attempts/:id" element={<RequireAuth><AttemptPage /></RequireAuth>} />
            <Route path="/library" element={<RequireAuth><LibraryPage /></RequireAuth>} />
            <Route path="/library/:id" element={<RequireAuth><MaterialPage /></RequireAuth>} />
            <Route path="/submissions" element={<RequireAuth><SubmissionsPage /></RequireAuth>} />
            <Route path="/submissions/:id" element={<RequireAuth><SubmissionPage /></RequireAuth>} />
            <Route path="/growth" element={<RequireAuth><GrowthIndexPage /></RequireAuth>} />
            <Route path="/growth/:id" element={<RequireAuth><GrowthPage /></RequireAuth>} />
            <Route path="/problems/:id" element={<RequireAuth role="teacher"><ProblemEditorPage /></RequireAuth>} />
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
          </Suspense>
        </main>
      </BrowserRouter>
    </AuthProvider>
  )
}
