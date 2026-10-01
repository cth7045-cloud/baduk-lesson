/*
 * 성장 기록 계산 (화면과 분리된 순수 함수 → 단위 테스트)
 */

/** 급수 글자 → 그래프용 점수. 1단 = 0, 2단 = 1 … / 1급 = -1, 2급 = -2 … 아니면 null */
export function rankScore(rank: string): number | null {
  const m = /^\s*(\d{1,2})\s*(급|단|kyu|k|dan|d)\s*$/i.exec(rank)
  if (!m) return null
  const n = Number(m[1])
  if (n < 1) return null
  const isDan = /단|dan|d/i.test(m[2])
  return isDan ? n - 1 : -n
}

/** 점수 → 급수 글자 */
export function scoreToRank(score: number): string {
  return score >= 0 ? `${score + 1}단` : `${-score}급`
}

export interface SetInput {
  id: string
  title: string
  /** 그래프 순서에 쓸 날짜 (마감, 없으면 만든 날) */
  date: string
  problemIds: string[]
}

export interface AttemptInput {
  set_id: string
  problem_id: string
  solved: boolean
  first_try_correct: boolean | null
}

export interface SetStat {
  setId: string
  title: string
  date: string
  assigned: number
  solved: number
  firstTry: number
  /** 0–100 */
  rate: number
  firstRate: number
}

export function setStats(sets: SetInput[], attempts: AttemptInput[]): SetStat[] {
  return sets
    .filter((s) => s.problemIds.length > 0)
    .map((s) => {
      const mine = attempts.filter((a) => a.set_id === s.id && s.problemIds.includes(a.problem_id))
      const solved = mine.filter((a) => a.solved).length
      const firstTry = mine.filter((a) => a.first_try_correct).length
      const n = s.problemIds.length
      return {
        setId: s.id,
        title: s.title,
        date: s.date,
        assigned: n,
        solved,
        firstTry,
        rate: Math.round((solved / n) * 100),
        firstRate: Math.round((firstTry / n) * 100),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function overall(stats: SetStat[]) {
  const assigned = stats.reduce((n, s) => n + s.assigned, 0)
  const solved = stats.reduce((n, s) => n + s.solved, 0)
  const firstTry = stats.reduce((n, s) => n + s.firstTry, 0)
  return {
    assigned,
    solved,
    rate: assigned ? Math.round((solved / assigned) * 100) : null,
    firstRate: assigned ? Math.round((firstTry / assigned) * 100) : null,
  }
}

export interface TagStat {
  tagId: string
  name: string
  assigned: number
  solved: number
  rate: number
}

/**
 * 주제별 정답률. 분모 = 그 태그가 붙은 배정 문제 수(묶음마다 따로 셈), 분자 = 맞힌 수.
 * 정답률이 낮은(약한) 주제부터.
 */
export function tagStats(
  sets: SetInput[],
  attempts: AttemptInput[],
  problemTags: Map<string, string[]>,
  tagNames: Map<string, string>,
): TagStat[] {
  const acc = new Map<string, { assigned: number; solved: number }>()
  for (const s of sets) {
    for (const pid of s.problemIds) {
      const solved = attempts.some((a) => a.set_id === s.id && a.problem_id === pid && a.solved)
      for (const t of problemTags.get(pid) ?? []) {
        const cur = acc.get(t) ?? { assigned: 0, solved: 0 }
        cur.assigned++
        if (solved) cur.solved++
        acc.set(t, cur)
      }
    }
  }
  return [...acc]
    .filter(([id]) => tagNames.has(id))
    .map(([tagId, v]) => ({ tagId, name: tagNames.get(tagId)!, ...v, rate: Math.round((v.solved / v.assigned) * 100) }))
    .sort((a, b) => a.rate - b.rate || b.assigned - a.assigned)
}
