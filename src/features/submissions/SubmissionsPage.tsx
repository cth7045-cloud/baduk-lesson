import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDateTime } from '../../components/comments/format'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import type { ImportedGame } from '../../go/sgf/convert'
import { boardsWithNewComments } from '../../data/reads'
import { createSubmission, listSubmissions, type Submission } from '../../data/submissions'
import { readSgfFile, titleFromTree } from '../../lib/sgfFile'
import { useAuth } from '../auth/AuthProvider'
import s from '../library/Library.module.css'

/** 기보 제출함: 학생 = 내 기보 올리기·코멘트 확인, 선생님 = 받은 기보 검토 */
export function SubmissionsPage() {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const [items, setItems] = useState<Submission[] | null>(null)
  const [unread, setUnread] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'submitted' | 'reviewed'>('all')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!profile) return
    void (async () => {
      try {
        const list = await listSubmissions()
        setItems(list)
        if (!isTeacher) setUnread(await boardsWithNewComments(profile.id, list.map((x) => x.board_id)))
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [profile, isTeacher])

  const shown = items?.filter((x) => filter === 'all' || x.status === filter)
  const waiting = items?.filter((x) => x.status === 'submitted').length ?? 0

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>{isTeacher ? '기보 제출함' : '내 기보'}</h1>
          <p className={s.sub}>
            {isTeacher
              ? `학생들이 올린 실전 기보입니다. 검토 대기 ${waiting}개.`
              : '내가 둔 실전 대국 기보(SGF)를 올리면 선생님이 코멘트를 달아 줍니다.'}
          </p>
        </div>
        {!isTeacher && (
          <Button variant="primary" onClick={() => setUploading(true)}>
            기보 올리기
          </Button>
        )}
      </div>

      {isTeacher && (
        <div className={s.segment} role="group" aria-label="상태">
          {(
            [
              ['all', '전체'],
              ['submitted', '검토 대기'],
              ['reviewed', '코멘트 완료'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? s.on : ''} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <p className={s.error}>불러오지 못했습니다: {error}</p>}
      {!items && !error && <p className={s.muted}>불러오는 중…</p>}
      {shown?.length === 0 && <p className={s.empty}>{isTeacher ? '해당하는 기보가 없습니다.' : '아직 올린 기보가 없습니다.'}</p>}
      {shown && shown.length > 0 && (
        <ul className={s.rows}>
          {shown.map((x) => (
            <li key={x.id}>
              <Link to={`/submissions/${x.id}`} className={s.row}>
                <span className={`${s.type} ${x.status === 'reviewed' ? s.sgf : s.waiting}`}>
                  {x.status === 'reviewed' ? '코멘트 완료' : '검토 대기'}
                </span>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>
                    {x.title}
                    {unread.has(x.board_id) && <span className={s.newBadge}>새 코멘트</span>}
                  </span>
                  <span className={s.rowSub}>
                    {isTeacher && `${x.profiles?.display_name ?? '학생'} · `}
                    {x.played_on ? `${x.played_on.replace(/-/g, '.')} 대국` : '대국 날짜 없음'}
                  </span>
                </span>
                <span />
                <span className={s.date}>{formatDateTime(x.created_at).slice(0, 10)} 제출</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </div>
  )
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [game, setGame] = useState<ImportedGame | null>(null)
  const [title, setTitle] = useState('')
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPick(f: File | undefined) {
    if (!f) return
    setError(null)
    try {
      const g = await readSgfFile(f)
      setFile(f)
      setGame(g)
      const dt = g.tree.nodes[g.tree.rootId].props.DT?.[0]
      if (dt && /^\d{4}-\d{2}-\d{2}/.test(dt)) setPlayedOn(dt.slice(0, 10))
      if (!title) setTitle(titleFromTree(g.tree, f.name.replace(/\.sgf$/i, '')))
    } catch {
      setError('SGF 기보 파일을 읽지 못했습니다. 바둑 앱에서 "SGF로 저장/내보내기"한 파일인지 확인해 주세요.')
    }
  }

  async function submit() {
    if (!game) return setError('기보 파일을 골라 주세요.')
    if (!title.trim()) return setError('기보 이름을 입력해 주세요.')
    setBusy(true)
    try {
      const id = await createSubmission({ title: title.trim(), playedOn: playedOn || null, note: note.trim() }, game)
      navigate(`/submissions/${id}`)
    } catch (e) {
      setError(`올리지 못했습니다: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="기보 올리기"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? '올리는 중…' : '선생님께 보내기'}
          </Button>
        </>
      }
    >
      <div className={s.form}>
        <div className={s.field}>
          기보 파일 (SGF)
          <button type="button" className={s.drop} onClick={() => fileRef.current?.click()}>
            {file ? (
              <>
                <b>{file.name}</b> — 다른 파일 고르기
              </>
            ) : (
              '눌러서 SGF 파일 고르기'
            )}
          </button>
          <input ref={fileRef} type="file" accept=".sgf,application/x-go-sgf,text/plain" hidden onChange={(e) => void onPick(e.target.files?.[0])} />
        </div>
        <label className={s.field}>
          기보 이름
          <input className={s.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className={s.field}>
          대국 날짜
          <input className={s.input} type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
        </label>
        <label className={s.field}>
          선생님께 한마디 (선택)
          <textarea className={s.textarea} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="예: 중반에 대마가 잡혔어요. 어디서 잘못됐는지 궁금해요." />
        </label>
        {error && <p className={s.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
