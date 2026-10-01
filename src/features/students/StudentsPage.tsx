import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { LOGIN_ID_RE } from '../../lib/auth'
import type { Profile } from '../auth/types'
import { createStudent, listStudents, resetStudentPassword, setStudentActive, updateStudent } from './api'
import s from './StudentsPage.module.css'

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; student: Profile }
  | { kind: 'password'; student: Profile }
  | null

/** 선생님: 학생 계정 만들기·이름/급수 수정·비밀번호 변경·정지 */
export function StudentsPage() {
  const [students, setStudents] = useState<Profile[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const toast = useToast()

  const reload = useCallback(async () => {
    try {
      setStudents(await listStudents())
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function toggleActive(st: Profile) {
    const next = !st.is_active
    const msg = next
      ? `${st.display_name} 학생의 계정을 다시 사용하게 할까요?`
      : `${st.display_name} 학생의 계정을 정지할까요?\n정지하면 로그인할 수 없습니다. (기록은 지워지지 않으며 언제든 다시 풀 수 있습니다)`
    if (!window.confirm(msg)) return
    try {
      await setStudentActive(st.id, next)
      toast.show(next ? '계정을 다시 사용할 수 있습니다.' : '계정을 정지했습니다.')
      await reload()
    } catch (e) {
      toast.show((e as Error).message)
    }
  }

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>학생 관리</h1>
          <p className={s.sub}>학생 계정을 만들고 아이디·비밀번호를 학생에게 알려 주세요.</p>
        </div>
        <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
          학생 추가
        </Button>
      </div>

      {loadError && <p className={s.error}>목록을 불러오지 못했습니다: {loadError}</p>}
      {!students && !loadError && <p className={s.muted}>불러오는 중…</p>}
      {students && students.length === 0 && (
        <p className={s.empty}>아직 학생이 없습니다. 오른쪽 위 "학생 추가"를 눌러 계정을 만들어 주세요.</p>
      )}

      {students && students.length > 0 && (
        <ul className={s.list}>
          {students.map((st) => (
            <li key={st.id} className={`${s.row} ${st.is_active ? '' : s.inactive}`}>
              <div className={s.who}>
                <span className={s.name}>{st.display_name}</span>
                {st.current_rank && <span className={s.rank}>{st.current_rank}</span>}
                {!st.is_active && <span className={s.badge}>정지됨</span>}
              </div>
              <div className={s.loginId}>
                아이디 <code>{st.login_id ?? '-'}</code>
              </div>
              <div className={s.actions}>
                <Button size="small" variant="ghost" onClick={() => setDialog({ kind: 'edit', student: st })}>
                  이름·급수
                </Button>
                <Button size="small" variant="ghost" onClick={() => setDialog({ kind: 'password', student: st })}>
                  비밀번호 변경
                </Button>
                <Button size="small" variant="ghost" danger={st.is_active} onClick={() => void toggleActive(st)}>
                  {st.is_active ? '정지' : '정지 풀기'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'create' && (
        <CreateDialog
          onClose={() => setDialog(null)}
          onDone={async (name, loginId, pw) => {
            setDialog(null)
            await reload()
            window.alert(`${name} 학생 계정을 만들었습니다.\n\n아이디: ${loginId}\n비밀번호: ${pw}\n\n학생에게 알려 주세요.`)
          }}
        />
      )}
      {dialog?.kind === 'edit' && (
        <EditDialog
          student={dialog.student}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null)
            toast.show('저장했습니다.')
            await reload()
          }}
        />
      )}
      {dialog?.kind === 'password' && (
        <PasswordDialog
          student={dialog.student}
          onClose={() => setDialog(null)}
          onDone={(pw) => {
            setDialog(null)
            window.alert(`${dialog.student.display_name} 학생의 새 비밀번호: ${pw}\n\n학생에게 알려 주세요.`)
          }}
        />
      )}
      {toast.node}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function CreateDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (name: string, loginId: string, pw: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [loginId, setLoginId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const id = loginId.trim().toLowerCase()
    if (!name.trim()) return setError('학생 이름을 입력해 주세요.')
    if (!LOGIN_ID_RE.test(id)) return setError('아이디는 영문 소문자·숫자로 3~20자여야 합니다. (_ . - 사용 가능)')
    if (pw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    setBusy(true)
    setError(null)
    try {
      await createStudent(id, name.trim(), pw)
      await onDone(name.trim(), id, pw)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="학생 추가"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? '만드는 중…' : '계정 만들기'}
          </Button>
        </>
      }
    >
      <form className={s.form} onSubmit={submit}>
        <Field label="이름" hint="화면에 보이는 이름 (예: 김민준)">
          <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
        </Field>
        <Field label="아이디" hint="로그인할 때 쓰는 이름. 영문 소문자·숫자 3~20자 (예: minjun)">
          <input
            className={s.input}
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
          />
        </Field>
        <Field label="비밀번호" hint="6자 이상. 학생에게 알려 줄 비밀번호입니다.">
          <input className={s.input} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
        </Field>
        {error && <p className={s.error}>{error}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function EditDialog({ student, onClose, onDone }: { student: Profile; onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState(student.display_name)
  const [rank, setRank] = useState(student.current_rank ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!name.trim()) return setError('이름을 입력해 주세요.')
    setBusy(true)
    try {
      await updateStudent(student.id, { display_name: name.trim(), current_rank: rank.trim() || null })
      await onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="이름·급수 수정"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            저장
          </Button>
        </>
      }
    >
      <form className={s.form} onSubmit={submit}>
        <Field label="이름">
          <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
        </Field>
        <Field label="현재 급수" hint="예: 15급, 5급, 1단 (급수 변화 기록은 6단계 성장 기록에서)">
          <input className={s.input} value={rank} onChange={(e) => setRank(e.target.value)} maxLength={20} />
        </Field>
        {error && <p className={s.error}>{error}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function PasswordDialog({ student, onClose, onDone }: { student: Profile; onClose: () => void; onDone: (pw: string) => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (pw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    setBusy(true)
    try {
      await resetStudentPassword(student.id, pw)
      onDone(pw)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={`${student.display_name} 비밀번호 변경`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            변경
          </Button>
        </>
      }
    >
      <form className={s.form} onSubmit={submit}>
        <Field label="새 비밀번호" hint="6자 이상">
          <input className={s.input} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        {error && <p className={s.error}>{error}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
