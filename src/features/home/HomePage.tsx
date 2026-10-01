import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import s from './HomePage.module.css'

interface Item {
  title: string
  desc: string
  to?: string
  /** 아직 만들지 않은 기능: 몇 단계에서 추가되는지 */
  stage?: number
}

const TEACHER_ITEMS: Item[] = [
  { title: '수업방', desc: '실시간 수업판을 열고 학생과 함께 둡니다.', to: '/lessons' },
  { title: '수업 기록', desc: '지난 수업을 날짜별로 다시 보고 코멘트를 고칩니다.', to: '/lessons' },
  { title: '과제', desc: '사활·수읽기 문제를 만들고 학생에게 배정합니다.', stage: 4 },
  { title: '자료실', desc: '해설 기보, PDF, 이미지를 올립니다.', stage: 5 },
  { title: '기보 제출함', desc: '학생이 올린 실전 기보에 코멘트를 답니다.', stage: 5 },
  { title: '학생 관리', desc: '학생 계정 만들기, 비밀번호 변경, 급수 기록.', to: '/students' },
  { title: '성장 기록', desc: '학생별 정답률, 약점, 급수 변화.', stage: 6 },
  { title: '연습판', desc: '혼자 바둑판·코멘트·SGF 기능을 시험합니다.', to: '/practice' },
]

const STUDENT_ITEMS: Item[] = [
  { title: '수업', desc: '선생님이 연 수업방에 들어갑니다.', to: '/lessons' },
  { title: '수업 기록', desc: '지난 수업을 코멘트와 함께 복습합니다.', to: '/lessons' },
  { title: '과제', desc: '받은 문제를 풉니다.', stage: 4 },
  { title: '자료실', desc: '선생님이 올린 해설 기보와 자료를 봅니다.', stage: 5 },
  { title: '기보 제출', desc: '내 실전 기보를 올리고 선생님 코멘트를 봅니다.', stage: 5 },
]

export function HomePage() {
  const { profile } = useAuth()
  if (!profile) return null
  const teacher = profile.role === 'teacher'
  const items = teacher ? TEACHER_ITEMS : STUDENT_ITEMS

  return (
    <div className={s.page}>
      <h1 className={s.title}>
        {profile.display_name}
        {teacher ? ' 선생님' : ''}, 안녕하세요
      </h1>
      <p className={s.sub}>{teacher ? '오늘 수업 준비를 시작해 볼까요?' : '오늘도 즐겁게 공부해요.'}</p>

      <ul className={s.list}>
        {items.map((it) => (
          <li key={it.title}>
            {it.to ? (
              <Link to={it.to} className={s.item}>
                <span className={s.itemTitle}>{it.title}</span>
                <span className={s.itemDesc}>{it.desc}</span>
                <span className={s.arrow} aria-hidden>
                  →
                </span>
              </Link>
            ) : (
              <div className={`${s.item} ${s.soon}`}>
                <span className={s.itemTitle}>{it.title}</span>
                <span className={s.itemDesc}>{it.desc}</span>
                <span className={s.stage}>{it.stage}단계에서 추가</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
