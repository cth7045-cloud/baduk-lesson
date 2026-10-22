import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { supabaseConfigured } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import s from './Auth.module.css'

export function LoginPage() {
  const { session, profile, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (session && profile) return <Navigate to={from} replace />

  if (!supabaseConfigured) {
    return (
      <div className={s.wrap}>
        <div className={s.card}>
          <h1 className={s.title}>로그인 준비 중</h1>
          <div className={s.setup}>
            아직 서버(Supabase) 연결 정보가 없습니다. 프로그램 폴더의 <b>.env</b> 파일이 있는지 확인해 주세요.
            <br />그동안 <Link to="/practice">연습판</Link>은 로그인 없이 쓸 수 있습니다.
          </div>
        </div>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!id.trim() || !pw) {
      setError('아이디와 비밀번호를 입력해 주세요.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await signIn(id, pw)
    setBusy(false)
    if (err) setError(err)
    else navigate(from, { replace: true })
  }

  return (
    <div className={s.wrap}>
      <div className={s.card}>
        <h1 className={s.title}>로그인</h1>
        <p className={s.sub}>선생님께 받은 아이디와 비밀번호를 입력하세요.</p>
        <form className={s.form} onSubmit={onSubmit} noValidate>
          <label className={s.field}>
            아이디
            <input
              className={s.input}
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
            />
          </label>
          <label className={s.field}>
            비밀번호
            <input
              className={s.input}
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className={s.error}>{error}</p>}
          <Button type="submit" variant="primary" className={s.submit} disabled={busy}>
            {busy ? '확인 중…' : '로그인'}
          </Button>
        </form>
        <p className={s.note}>선생님은 이메일 주소로 로그인합니다.</p>
      </div>
    </div>
  )
}
