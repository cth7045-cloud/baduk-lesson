import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { PracticePage } from './features/practice/PracticePage'
import s from './App.module.css'

export function App() {
  return (
    <BrowserRouter>
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
            <NavLink to="/practice" className={({ isActive }) => (isActive ? s.active : '')}>
              연습판
            </NavLink>
          </nav>
        </div>
      </header>
      <main className={s.main}>
        <Routes>
          <Route path="/practice" element={<PracticePage />} />
          <Route path="*" element={<Navigate to="/practice" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
