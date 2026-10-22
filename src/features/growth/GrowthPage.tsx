import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BarChart } from '../../components/charts/BarChart'
import { ChartCard } from '../../components/charts/ChartCard'
import { LineChart } from '../../components/charts/LineChart'
import { formatDateTime } from '../../components/comments/format'
import { Button } from '../../components/ui/Button'
import { listAllAttempts, listSets, type Attempt, type SetDetail } from '../../data/assignments'
import { addRank, deleteNote, deleteRank, listNotes, listRanks, saveNote, type RankEntry, type StudentNote } from '../../data/growth'
import { listLessons, type LessonWithPeople } from '../../data/lessons'
import { listProblems, listTags, type ProblemRow, type Tag } from '../../data/problems'
import { useAuth } from '../auth/AuthProvider'
import type { Profile } from '../auth/types'
import { listStudents } from '../students/api'
import { overall, rankScore, scoreToRank, setStats, tagStats, type SetInput } from './stats'
import s from './Growth.module.css'

/** /growth: 학생은 자기 기록, 선생님은 학생 고르기 */
export function GrowthIndexPage() {
  const { profile } = useAuth()
  const [students, setStudents] = useState<Profile[] | null>(null)
  useEffect(() => {
    if (profile?.role === 'teacher') void listStudents().then(setStudents)
  }, [profile?.role])
  if (!profile) return null
  if (profile.role === 'student') return <Navigate to={`/growth/${profile.id}`} replace />
  return (
    <div className={s.page}>
      <h1 className={s.title}>성장 기록</h1>
      <p className={s.sub}>학생을 고르면 과제 정답률, 주제별 약점, 급수 변화, 수업 횟수를 볼 수 있습니다.</p>
      {!students && <p className={s.muted}>불러오는 중…</p>}
      {students?.length === 0 && <p className={s.muted}>학생이 없습니다.</p>}
      <ul className={s.pickList}>
        {students?.map((st) => (
          <li key={st.id}>
            <Link to={`/growth/${st.id}`}>
              <b>{st.display_name}</b>
              {st.current_rank && <span>{st.current_rank}</span>}
              {!st.is_active && <span>정지됨</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface Loaded {
  student: Profile
  sets: SetDetail[]
  attempts: Attempt[]
  problems: ProblemRow[]
  tags: Tag[]
  lessons: LessonWithPeople[]
  ranks: RankEntry[]
  notes: StudentNote[] | null
}

export function GrowthPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id || !profile) return
    try {
      const student = isTeacher ? (await listStudents()).find((x) => x.id === id) : profile
      if (!student || (!isTeacher && profile.id !== id)) throw new Error('볼 수 없는 기록입니다.')
      const [sets, attempts, problems, tags, lessons, ranks, notes] = await Promise.all([
        listSets(),
        listAllAttempts(),
        listProblems(),
        listTags(),
        listLessons(),
        listRanks(id),
        isTeacher ? listNotes(id) : Promise.resolve(null),
      ])
      setData({ student, sets, attempts, problems, tags, lessons, ranks, notes })
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id, profile, isTeacher])

  useEffect(() => {
    void load()
  }, [load])

  if (error) return <p className={s.message}>{error}</p>
  if (!data) return <p className={s.message}>불러오는 중…</p>
  return <GrowthView data={data} isTeacher={isTeacher} reload={load} />
}

function GrowthView({ data, isTeacher, reload }: { data: Loaded; isTeacher: boolean; reload: () => Promise<void> }) {
  const { student } = data
  // 상담 메모는 학부모에게 보여 줄 인쇄물에서 기본으로 빠짐
  const [printNotes, setPrintNotes] = useState(false)

  // ----- 계산 -----
  const mySets: SetInput[] = useMemo(
    () =>
      data.sets
        .filter((st) => st.targets.some((t) => t.student_id === student.id))
        .map((st) => ({ id: st.id, title: st.title, date: st.due_at ?? st.created_at, problemIds: st.problems.map((p) => p.problem_id) })),
    [data.sets, student.id],
  )
  const myAttempts = useMemo(() => data.attempts.filter((a) => a.student_id === student.id), [data.attempts, student.id])
  const perSet = useMemo(() => setStats(mySets, myAttempts), [mySets, myAttempts])
  const total = overall(perSet)
  const problemTags = useMemo(() => new Map(data.problems.map((p) => [p.id, p.tags.map((t) => t.tag_id)])), [data.problems])
  const tagNames = useMemo(() => new Map(data.tags.map((t) => [t.id, t.name])), [data.tags])
  const byTag = useMemo(() => tagStats(mySets, myAttempts, problemTags, tagNames), [mySets, myAttempts, problemTags, tagNames])
  const lessons = data.lessons.filter((l) => l.status === 'ended' && l.participants.some((p) => p.student_id === student.id))
  const ranks = data.ranks
  const rankPoints = ranks.map((r) => ({ ...r, score: rankScore(r.rank) }))
  const scored = rankPoints.filter((r) => r.score !== null) as (RankEntry & { score: number })[]
  const currentRank = ranks.at(-1)?.rank ?? student.current_rank ?? '-'

  const md = (iso: string) => formatDateTime(iso).slice(5, 10)

  // 급수 그래프 범위: 기록된 범위보다 위아래로 1칸씩
  const rankMin = scored.length ? Math.min(...scored.map((r) => r.score)) - 1 : -10
  const rankMax = scored.length ? Math.max(...scored.map((r) => r.score)) + 1 : 0
  const rankStep = Math.max(1, Math.ceil((rankMax - rankMin) / 5))
  const rankTicks: number[] = []
  for (let v = rankMin; v <= rankMax; v += rankStep) rankTicks.push(v)

  const weakest = byTag.length >= 2 ? byTag[0].tagId : null

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          {isTeacher && (
            <Link to="/growth" className={`${s.back} ${s.noPrint}`}>
              ← 학생 목록
            </Link>
          )}
          <h1 className={s.title}>{student.display_name} 성장 기록</h1>
          <p className={s.sub}>{formatDateTime(new Date().toISOString()).slice(0, 10)} 기준</p>
        </div>
        <Button className={s.noPrint} onClick={() => window.print()}>
          인쇄 / PDF로 저장
        </Button>
      </div>

      <div className={s.kpis}>
        <Kpi label="현재 급수" value={currentRank} />
        <Kpi label="수업 횟수" value={`${lessons.length}회`} note={lessons.length ? `최근 ${md(lessons[0].started_at)}` : undefined} />
        <Kpi label="과제 정답률" value={total.rate === null ? '-' : `${total.rate}%`} note={total.assigned ? `${total.solved} / ${total.assigned} 문제` : '받은 과제 없음'} />
        <Kpi label="첫 시도 정답률" value={total.firstRate === null ? '-' : `${total.firstRate}%`} note="한 번에 맞힌 비율" />
      </div>

      <div className={s.grid}>
        <ChartCard
          title="과제 정답률 추이"
          subtitle="과제 묶음별 (마감일 순)"
          empty={perSet.length ? undefined : '아직 받은 과제가 없습니다.'}
          table={{
            columns: ['과제', '마감', '정답', '정답률', '첫 시도 정답률'],
            rows: perSet.map((p) => [p.title, md(p.date), `${p.solved}/${p.assigned}`, `${p.rate}%`, `${p.firstRate}%`]),
          }}
        >
          <LineChart
            xLabels={perSet.map((p) => md(p.date))}
            xDetail={perSet.map((p) => `${p.title} · ${md(p.date)}`)}
            series={[
              { name: '정답률', color: 'var(--viz-1)', values: perSet.map((p) => p.rate) },
              { name: '첫 시도 정답률', color: 'var(--viz-2)', values: perSet.map((p) => p.firstRate) },
            ]}
            yDomain={[0, 100]}
            yTicks={[0, 25, 50, 75, 100]}
            yFormat={(v) => `${v}%`}
          />
        </ChartCard>

        <ChartCard
          title="주제별 정답률"
          subtitle={weakest ? `가장 약한 주제: ${tagNames.get(weakest)}` : '문제에 붙인 주제 태그 기준'}
          empty={byTag.length ? undefined : '주제 태그가 붙은 과제 문제가 아직 없습니다.'}
          table={{ columns: ['주제', '정답', '정답률'], rows: byTag.map((t) => [t.name, `${t.solved}/${t.assigned}`, `${t.rate}%`]) }}
        >
          <BarChart bars={byTag.map((t) => ({ label: t.name, value: t.rate, detail: `${t.solved} / ${t.assigned} 문제`, emphasis: t.tagId === weakest }))} />
        </ChartCard>

        <ChartCard
          title="급수 변화"
          subtitle="선생님이 기록한 급수"
          empty={scored.length ? undefined : isTeacher ? '아래에서 급수를 기록하면 그래프가 그려집니다.' : '아직 급수 기록이 없습니다.'}
          table={{ columns: ['날짜', '급수', '메모'], rows: ranks.map((r) => [r.recorded_on.replace(/-/g, '.'), r.rank, r.note]) }}
        >
          <LineChart
            step
            xLabels={scored.map((r) => r.recorded_on.slice(5).replace('-', '.'))}
            xDetail={scored.map((r) => `${r.recorded_on.replace(/-/g, '.')}${r.note ? ` · ${r.note}` : ''}`)}
            series={[{ name: '급수', color: 'var(--viz-1)', values: scored.map((r) => r.score) }]}
            yDomain={[rankMin, rankMax]}
            yTicks={rankTicks}
            yFormat={scoreToRank}
          />
        </ChartCard>

        <section className={s.panel}>
          <h2 className={s.panelTitle}>수업 기록</h2>
          {lessons.length === 0 ? (
            <p className={s.muted}>아직 참여한 수업이 없습니다.</p>
          ) : (
            <ul className={s.lessonList}>
              {lessons.slice(0, 12).map((l) => (
                <li key={l.id}>
                  <Link to={`/lessons/${l.id}`}>
                    <span>{formatDateTime(l.started_at).slice(0, 10)}</span>
                    {l.title}
                  </Link>
                </li>
              ))}
              {lessons.length > 12 && <li className={s.muted}>외 {lessons.length - 12}회</li>}
            </ul>
          )}
        </section>
      </div>

      {isTeacher && <RankEditor studentId={student.id} ranks={ranks} reload={reload} />}
      {isTeacher && data.notes && (
        <>
          <label className={`${s.printToggle} ${s.noPrint}`}>
            <input type="checkbox" checked={printNotes} onChange={(e) => setPrintNotes(e.target.checked)} />
            인쇄할 때 지도·상담 메모도 함께 넣기
          </label>
          <div className={printNotes ? '' : s.noPrint}>
            <NotesEditor studentId={student.id} notes={data.notes} reload={reload} />
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={s.kpi}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
      {note && <span className={s.kpiNote}>{note}</span>}
    </div>
  )
}

function RankEditor({ studentId, ranks, reload }: { studentId: string; ranks: RankEntry[]; reload: () => Promise<void> }) {
  const [rank, setRank] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (rankScore(rank) === null) return setError('급수는 "15급", "1단"처럼 숫자와 급/단으로 적어 주세요.')
    const isLatest = ranks.every((r) => r.recorded_on <= date)
    try {
      await addRank(studentId, rank.replace(/\s+/g, ''), date, note.trim(), isLatest)
      setRank('')
      setNote('')
      setError(null)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section className={`${s.panel} ${s.noPrint}`}>
      <h2 className={s.panelTitle}>급수 기록하기</h2>
      <form className={s.rankForm} onSubmit={add}>
        <input className={s.input} value={rank} onChange={(e) => setRank(e.target.value)} placeholder="예: 12급, 1단" aria-label="급수" maxLength={10} />
        <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="날짜" />
        <input className={`${s.input} ${s.grow}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택, 예: 기우회 대회 3승)" aria-label="메모" maxLength={500} />
        <Button type="submit" variant="primary">
          추가
        </Button>
      </form>
      {error && <p className={s.error}>{error}</p>}
      {ranks.length > 0 && (
        <ul className={s.rankList}>
          {[...ranks].reverse().map((r) => (
            <li key={r.id}>
              <span className={s.rankDate}>{r.recorded_on.replace(/-/g, '.')}</span>
              <b>{r.rank}</b>
              <span className={s.muted}>{r.note}</span>
              <button
                type="button"
                className={s.remove}
                onClick={async () => {
                  if (!window.confirm(`${r.recorded_on} ${r.rank} 기록을 지울까요?`)) return
                  await deleteRank(r.id)
                  await reload()
                }}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NotesEditor({ studentId, notes, reload }: { studentId: string; notes: StudentNote[]; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(id: string | null, body: string) {
    if (!body.trim()) return
    try {
      await saveNote(studentId, id, body.trim())
      setDraft('')
      setEditing(null)
      setError(null)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className={`${s.panel} ${s.notes}`}>
      <h2 className={s.panelTitle}>
        지도·상담 메모 <span className={s.private}>선생님만 보임</span>
      </h2>
      <div className={`${s.noteForm} ${s.noPrint}`}>
        <textarea className={s.textarea} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="지도 방향, 학부모 상담 내용 등을 자유롭게 적어 두세요." maxLength={10000} />
        <Button variant="primary" onClick={() => void save(null, draft)} disabled={!draft.trim()}>
          메모 추가
        </Button>
      </div>
      {error && <p className={s.error}>{error}</p>}
      {notes.length === 0 && <p className={s.muted}>아직 메모가 없습니다.</p>}
      <ul className={s.noteList}>
        {notes.map((n) => (
          <li key={n.id}>
            <div className={s.noteMeta}>
              {formatDateTime(n.created_at)}
              {n.updated_at !== n.created_at && ` · 수정 ${formatDateTime(n.updated_at)}`}
              <span className={`${s.noteActions} ${s.noPrint}`}>
                <button type="button" onClick={() => setEditing({ id: n.id, body: n.body })}>
                  수정
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('이 메모를 지울까요?')) return
                    await deleteNote(n.id)
                    await reload()
                  }}
                >
                  삭제
                </button>
              </span>
            </div>
            {editing?.id === n.id ? (
              <div className={s.noteForm}>
                <textarea className={s.textarea} rows={4} value={editing.body} onChange={(e) => setEditing({ id: n.id, body: e.target.value })} />
                <div className={s.noteActions}>
                  <Button size="small" variant="ghost" onClick={() => setEditing(null)}>
                    취소
                  </Button>
                  <Button size="small" variant="primary" onClick={() => void save(n.id, editing.body)}>
                    저장
                  </Button>
                </div>
              </div>
            ) : (
              <p className={s.noteBody}>{n.body}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
