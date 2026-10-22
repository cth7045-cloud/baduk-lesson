import { describe, expect, it } from 'vitest'
import { overall, rankScore, scoreToRank, setStats, tagStats } from '../stats'

describe('급수 점수', () => {
  it('급은 음수, 단은 0부터', () => {
    expect(rankScore('15급')).toBe(-15)
    expect(rankScore('1급')).toBe(-1)
    expect(rankScore('1단')).toBe(0)
    expect(rankScore(' 3 단 ')).toBe(2)
    expect(rankScore('5k')).toBe(-5)
    expect(rankScore('아마 초단')).toBeNull()
    expect(scoreToRank(-15)).toBe('15급')
    expect(scoreToRank(0)).toBe('1단')
  })
})

describe('과제 정답률', () => {
  const sets = [
    { id: 's2', title: '둘째 주', date: '2026-10-08', problemIds: ['p1', 'p2', 'p3', 'p4'] },
    { id: 's1', title: '첫째 주', date: '2026-10-01', problemIds: ['p1', 'p2'] },
    { id: 's3', title: '빈 묶음', date: '2026-10-02', problemIds: [] },
  ]
  const attempts = [
    { set_id: 's1', problem_id: 'p1', solved: true, first_try_correct: true },
    { set_id: 's1', problem_id: 'p2', solved: false, first_try_correct: false },
    { set_id: 's2', problem_id: 'p1', solved: true, first_try_correct: false },
    { set_id: 's2', problem_id: 'p3', solved: true, first_try_correct: true },
    { set_id: 's2', problem_id: 'p4', solved: true, first_try_correct: true },
  ]
  it('묶음별 정답률을 날짜순으로 (빈 묶음 제외)', () => {
    const st = setStats(sets, attempts)
    expect(st.map((s) => [s.setId, s.rate, s.firstRate])).toEqual([
      ['s1', 50, 50],
      ['s2', 75, 50],
    ])
    expect(overall(st)).toEqual({ assigned: 6, solved: 4, rate: 67, firstRate: 50 })
  })
  it('주제별 정답률은 약한 주제부터', () => {
    const tags = new Map([
      ['p1', ['사활']],
      ['p2', ['사활', '끝내기']],
      ['p3', ['정석']],
      ['p4', ['정석']],
    ])
    const names = new Map([
      ['사활', '사활'],
      ['끝내기', '끝내기'],
      ['정석', '정석'],
    ])
    expect(tagStats(sets, attempts, tags, names).map((t) => [t.name, t.solved, t.assigned, t.rate])).toEqual([
      ['끝내기', 0, 2, 0],
      ['사활', 2, 4, 50],
      ['정석', 2, 2, 100],
    ])
  })
})
