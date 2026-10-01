import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { saveSet, type SetDetail } from '../../data/assignments'
import { listProblems, type ProblemRow } from '../../data/problems'
import type { Profile } from '../auth/types'
import { listStudents } from '../students/api'
import { toPlayLabel } from './common'
import s from './Assignments.module.css'

/** <input type="datetime-local"> 값 ↔ ISO 시각 */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultDue(): string {
  // 기본 마감: 일주일 뒤 밤 10시
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(22, 0, 0, 0)
  return toLocalInput(d.toISOString())
}

/** 과제 묶음 만들기·고치기: 이름, 설명, 마감, 문제(순서), 받는 학생 */
export function SetDialog({ set, onClose, onSaved }: { set: SetDetail | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [title, setTitle] = useState(set?.title ?? '')
  const [description, setDescription] = useState(set?.description ?? '')
  const [due, setDue] = useState(set ? toLocalInput(set.due_at) : defaultDue())
  const [problems, setProblems] = useState<ProblemRow[] | null>(null)
  const [students, setStudents] = useState<Profile[] | null>(null)
  const [order, setOrder] = useState<string[]>(set?.problems.map((p) => p.problem_id) ?? [])
  const [targets, setTargets] = useState<Set<string>>(new Set(set?.targets.map((t) => t.student_id) ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([listProblems(), listStudents()]).then(([p, st]) => {
      setProblems(p)
      const active = st.filter((x) => x.is_active || targets.has(x.id))
      setStudents(active)
      if (!set) setTargets(new Set(active.filter((x) => x.is_active).map((x) => x.id)))
    })
    // 처음 한 번만
  }, [])

  const byId = new Map((problems ?? []).map((p) => [p.id, p]))
  const available = (problems ?? []).filter((p) => !order.includes(p.id))

  function move(id: string, dir: -1 | 1) {
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }

  async function save() {
    if (!title.trim()) return setError('과제 이름을 입력해 주세요.')
    if (!order.length) return setError('문제를 하나 이상 넣어 주세요.')
    setBusy(true)
    setError(null)
    try {
      const id = await saveSet(
        set?.id ?? null,
        { title: title.trim(), description: description.trim(), due_at: due ? new Date(due).toISOString() : null },
        order,
        [...targets],
      )
      onSaved(id)
    } catch (e) {
      setError(`저장하지 못했습니다: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={set ? '과제 묶음 고치기' : '과제 묶음 만들기'}
      wide
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? '저장 중…' : set ? '저장' : '만들고 배정하기'}
          </Button>
        </>
      }
    >
      <div className={s.form}>
        <label className={s.field}>
          과제 이름
          <input className={s.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="예: 10월 1주 사활 숙제" />
        </label>
        <label className={s.field}>
          설명 (선택)
          <textarea className={s.textarea} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} />
        </label>
        <label className={s.field}>
          마감
          <input className={s.input} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>

        <div className={s.field}>
          넣을 문제 ({order.length}개, 위에서부터 순서대로)
          {order.length > 0 && (
            <ol className={s.pickList}>
              {order.map((id, i) => {
                const p = byId.get(id)
                return (
                  <li key={id}>
                    <span className={s.pickNo}>{i + 1}</span>
                    <span className={s.pickTitle}>{p ? `${p.title} · ${toPlayLabel(p.to_play)}` : '(불러오는 중)'}</span>
                    <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label="위로">
                      ↑
                    </button>
                    <button type="button" onClick={() => move(id, 1)} disabled={i === order.length - 1} aria-label="아래로">
                      ↓
                    </button>
                    <button type="button" onClick={() => setOrder(order.filter((x) => x !== id))} aria-label="빼기">
                      ✕
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          {!problems && <span className={s.muted}>문제를 불러오는 중…</span>}
          {problems?.length === 0 && <span className={s.muted}>문제 은행에 문제가 없습니다. 먼저 문제를 만들어 주세요.</span>}
          {available.length > 0 && (
            <div className={s.addList}>
              {available.map((p) => (
                <button key={p.id} type="button" onClick={() => setOrder([...order, p.id])}>
                  + {p.title || '(제목 없음)'} <small>{toPlayLabel(p.to_play)}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={s.field}>
          받을 학생
          {students?.length === 0 && <span className={s.muted}>학생이 없습니다.</span>}
          <div className={s.checks}>
            {students?.map((st) => (
              <label key={st.id} className={s.check}>
                <input
                  type="checkbox"
                  checked={targets.has(st.id)}
                  onChange={(e) => {
                    const next = new Set(targets)
                    if (e.target.checked) next.add(st.id)
                    else next.delete(st.id)
                    setTargets(next)
                  }}
                />
                {st.display_name}
              </label>
            ))}
          </div>
        </div>
        {error && <p className={s.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
