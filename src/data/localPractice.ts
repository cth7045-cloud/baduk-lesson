import type { CommentMap } from '../components/comments/types'

/*
 * 1단계 연습판 저장소: 브라우저(localStorage)에 임시 저장.
 * 2단계부터는 같은 모양의 데이터를 Supabase(boards, board_comments 테이블)에 저장함.
 */

export interface PracticeDoc {
  version: 1
  title: string
  /** 노드 ID를 포함한 내부 저장용 SGF (코멘트 제외) */
  sgf: string
  comments: CommentMap
  updatedAt: string
}

const KEY = 'baduk-practice-doc-v1'

export function loadPracticeDoc(): PracticeDoc | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const doc = JSON.parse(raw) as PracticeDoc
    return doc.version === 1 && typeof doc.sgf === 'string' ? doc : null
  } catch {
    return null
  }
}

export function savePracticeDoc(doc: PracticeDoc): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc))
    return true
  } catch {
    return false
  }
}
