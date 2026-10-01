/** 판 전체 메모를 가리키는 키 (DB에서는 node_id = NULL) */
export const BOARD_MEMO = '__board__'

export interface BoardComment {
  /** 노드 ID 또는 BOARD_MEMO */
  key: string
  body: string
  createdAt: string
  updatedAt: string
}

/** 키 → 코멘트 */
export type CommentMap = Record<string, BoardComment>

/**
 * 코멘트 저장 방식. 화면은 이 인터페이스만 알고,
 * 실제 저장은 1단계에서는 브라우저, 2단계부터는 Supabase가 맡음.
 */
export interface CommentActions {
  save: (key: string, body: string) => void | Promise<void>
  remove: (key: string) => void | Promise<void>
}
