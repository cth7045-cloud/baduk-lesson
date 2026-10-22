import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameEditor } from '../../components/board/useGameEditor'
import type { CommentActions, CommentMap } from '../../components/comments/types'
import type { GameTree } from '../../go/tree/gameTree'
import type { TreeOp } from '../../go/tree/ops'
import { saveBoardTree } from '../../data/boards'
import { deleteComment, listComments, saveComment, subscribeComments } from '../../data/comments'

export type SaveState = 'saved' | 'saving' | 'error'

interface Options {
  boardId: string
  initialTree: GameTree
  initialComments: CommentMap
  /** 판이 바뀌면 자동 저장 (선생님 화면) */
  autosave: boolean
  /** 내 편집이 일어날 때 (실시간 전송 등) */
  onOps?: (ops: TreeOp[], nodeId?: string) => void
  onError?: (message: string) => void
}

/**
 * DB에 저장된 바둑판 하나를 편집하는 화면의 공통 부분.
 * 수순 트리 편집 상태 + 코멘트(실시간 반영) + 판 자동 저장.
 * 수업방, 문제 출제, 풀이 기록, 자료실, 기보 제출함에서 함께 씀.
 */
export function useBoardDocument({ boardId, initialTree, initialComments, autosave, onOps, onError }: Options) {
  const onOpsRef = useRef(onOps)
  onOpsRef.current = onOps
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const editor = useGameEditor(initialTree, (ops, nodeId) => onOpsRef.current?.(ops, nodeId))
  const [comments, setComments] = useState<CommentMap>(initialComments)
  const [saveState, setSaveState] = useState<SaveState>('saved')

  // ---------- 코멘트: 실시간 반영 ----------
  useEffect(
    () =>
      subscribeComments(boardId, {
        upsert: (c) => setComments((prev) => ({ ...prev, [c.key]: c })),
        remove: (key) =>
          setComments((prev) => {
            if (!prev[key]) return prev
            const next = { ...prev }
            delete next[key]
            return next
          }),
      }),
    [boardId],
  )

  const commentActions: CommentActions = useMemo(
    () => ({
      save: async (key, body) => {
        try {
          const c = await saveComment(boardId, key, body)
          setComments((prev) => ({ ...prev, [key]: c }))
        } catch (e) {
          onErrorRef.current?.(`코멘트를 저장하지 못했습니다: ${(e as Error).message}`)
          throw e
        }
      },
      remove: async (key) => {
        try {
          await deleteComment(boardId, key)
          setComments((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        } catch (e) {
          onErrorRef.current?.(`코멘트를 지우지 못했습니다: ${(e as Error).message}`)
          throw e
        }
      },
    }),
    [boardId],
  )

  const reloadComments = useCallback(async () => setComments(await listComments(boardId)), [boardId])

  // ---------- 판 자동 저장 ----------
  const lastSaved = useRef(initialTree)
  const treeRef = useRef(editor.tree)
  treeRef.current = editor.tree

  const flush = useCallback(async () => {
    const tree = treeRef.current
    if (tree === lastSaved.current) return
    setSaveState('saving')
    try {
      await saveBoardTree(boardId, tree)
      lastSaved.current = tree
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, [boardId])

  useEffect(() => {
    if (!autosave || editor.tree === lastSaved.current) return
    const t = window.setTimeout(() => void flush(), 1500)
    return () => window.clearTimeout(t)
  }, [editor.tree, autosave, flush])

  // 저장되지 않은 내용이 있는데 창을 닫으려 하면 경고
  useEffect(() => {
    if (!autosave) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (treeRef.current !== lastSaved.current) {
        void flush()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [autosave, flush])

  // 화면을 떠날 때 남은 변경 저장
  useEffect(() => () => void flush(), [flush])

  return { editor, comments, setComments, commentActions, reloadComments, saveState, flush }
}

export function saveStateLabel(s: SaveState): string {
  return s === 'saving' ? '저장 중…' : s === 'error' ? '저장 실패 — 인터넷 확인' : '자동 저장됨'
}
