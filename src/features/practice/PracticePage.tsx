import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useGameEditor } from '../../components/board/useGameEditor'
import { BOARD_MEMO, type CommentActions, type CommentMap } from '../../components/comments/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { BoardWorkspace } from '../../components/workspace/BoardWorkspace'
import { decodeSgfBytes } from '../../go/sgf/encoding'
import { exportSgf, importSgf, newGame } from '../../go/sgf/convert'
import { SgfParseError } from '../../go/sgf/parse'
import type { GameTree } from '../../go/tree/gameTree'
import { BOARD_SIZES } from '../../go/types'
import { loadPracticeDoc, savePracticeDoc } from '../../data/localPractice'
import { downloadText, safeFileName, todayStamp } from '../../lib/download'
import { SAMPLE_SGF } from './sample'
import s from './PracticePage.module.css'

function commentsFromImport(nodeComments: Record<string, string>, gameComment: string): CommentMap {
  const now = new Date().toISOString()
  const map: CommentMap = {}
  for (const [key, body] of Object.entries(nodeComments)) map[key] = { key, body, createdAt: now, updatedAt: now }
  if (gameComment) map[BOARD_MEMO] = { key: BOARD_MEMO, body: gameComment, createdAt: now, updatedAt: now }
  return map
}

function titleFromTree(tree: GameTree, fallback: string): string {
  const root = tree.nodes[tree.rootId].props
  const gn = root.GN?.[0]?.trim()
  if (gn) return gn
  const pb = root.PB?.[0]?.trim()
  const pw = root.PW?.[0]?.trim()
  if (pb || pw) return `${pb || '흑'} vs ${pw || '백'}`
  return fallback
}

interface Initial {
  tree: GameTree
  comments: CommentMap
  title: string
}

function loadInitial(): Initial {
  const doc = loadPracticeDoc()
  if (doc) {
    try {
      return { tree: importSgf(doc.sgf).tree, comments: doc.comments ?? {}, title: doc.title }
    } catch {
      // 저장본이 손상되었으면 새 판으로
    }
  }
  return { tree: newGame(19), comments: {}, title: '연습판' }
}

/**
 * 1단계 연습판: 로그인 없이 혼자서 바둑판·코멘트·SGF 기능을 시험해 보는 화면.
 * 내용은 이 브라우저에 자동 저장됨.
 */
export function PracticePage() {
  const initial = useMemo(loadInitial, [])
  const editor = useGameEditor(initial.tree)
  const [comments, setComments] = useState<CommentMap>(initial.comments)
  const [title, setTitle] = useState(initial.title)
  const [studentView, setStudentView] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  // 자동 저장 (입력이 멈추고 0.4초 뒤)
  useEffect(() => {
    const t = window.setTimeout(() => {
      // 지워진 수의 코멘트는 저장하지 않음
      const kept: CommentMap = {}
      for (const [k, v] of Object.entries(comments)) if (k === BOARD_MEMO || editor.tree.nodes[k]) kept[k] = v
      const ok = savePracticeDoc({
        version: 1,
        title,
        sgf: exportSgf(editor.tree, { keepIds: true }),
        comments: kept,
        updatedAt: new Date().toISOString(),
      })
      if (ok) setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    }, 400)
    return () => window.clearTimeout(t)
  }, [editor.tree, comments, title])

  const commentActions: CommentActions = useMemo(
    () => ({
      save: (key, body) =>
        setComments((prev) => {
          const now = new Date().toISOString()
          const old = prev[key]
          return { ...prev, [key]: { key, body, createdAt: old?.createdAt ?? now, updatedAt: now } }
        }),
      remove: (key) =>
        setComments((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        }),
    }),
    [],
  )

  const loadSgfText = useCallback(
    (text: string, fallbackTitle: string) => {
      try {
        const g = importSgf(text)
        editor.replace(g.tree)
        setComments(commentsFromImport(g.nodeComments, g.gameComment))
        setTitle(titleFromTree(g.tree, fallbackTitle))
        toast.show('기보를 불러왔습니다.')
      } catch (e) {
        toast.show(e instanceof SgfParseError ? `불러오기 실패: ${e.message}` : '불러오기 실패: SGF 파일을 확인해 주세요.')
      }
    },
    [editor, toast],
  )

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!window.confirm('지금 판을 불러온 기보로 바꿀까요? (지금 판이 필요하면 먼저 "SGF 내보내기"를 하세요)')) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    loadSgfText(decodeSgfBytes(bytes), file.name.replace(/\.sgf$/i, ''))
  }

  function onExport() {
    const nodeComments: Record<string, string> = {}
    for (const [k, v] of Object.entries(comments)) if (k !== BOARD_MEMO) nodeComments[k] = v.body
    const text = exportSgf(editor.tree, { nodeComments, gameComment: comments[BOARD_MEMO]?.body })
    downloadText(`${safeFileName(title)}_${todayStamp()}.sgf`, text)
  }

  function createNew(size: number) {
    editor.replace(newGame(size))
    setComments({})
    setTitle('연습판')
    setNewOpen(false)
  }

  return (
    <div className={s.page}>
      <div className={s.bar}>
        <input
          className={s.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="판 이름"
          maxLength={80}
        />
        <div className={s.actions}>
          <Button size="small" onClick={() => setNewOpen(true)}>
            새 판
          </Button>
          <Button size="small" onClick={() => fileRef.current?.click()}>
            SGF 불러오기
          </Button>
          <Button size="small" onClick={onExport}>
            SGF 내보내기
          </Button>
          <input ref={fileRef} type="file" accept=".sgf,application/x-go-sgf,text/plain" hidden onChange={onFile} />
          <div className={s.viewSwitch} role="group" aria-label="화면 보기">
            <button type="button" className={!studentView ? s.on : ''} onClick={() => setStudentView(false)}>
              선생님 화면
            </button>
            <button type="button" className={studentView ? s.on : ''} onClick={() => setStudentView(true)}>
              학생 화면
            </button>
          </div>
        </div>
      </div>

      {studentView && (
        <p className={s.notice}>
          학생 화면 미리보기입니다. 학생은 코멘트를 읽기만 할 수 있고, 판을 고칠 수 없습니다.
        </p>
      )}

      <BoardWorkspace
        editor={editor}
        comments={comments}
        commentActions={commentActions}
        canEditComments={!studentView}
        canEditBoard={!studentView}
        aside={savedAt && <span className={s.saved}>이 브라우저에 자동 저장됨 · {savedAt}</span>}
      />

      {newOpen && (
        <Dialog
          title="새 판 만들기"
          onClose={() => setNewOpen(false)}
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  loadSgfText(SAMPLE_SGF, '예제 기보')
                  setNewOpen(false)
                }}
              >
                예제 기보 열기
              </Button>
              <Button onClick={() => setNewOpen(false)}>취소</Button>
            </>
          }
        >
          <p>지금 판의 수순과 코멘트는 지워집니다. 필요하면 먼저 SGF로 내보내 주세요.</p>
          <div className={s.sizes}>
            {BOARD_SIZES.map((size) => (
              <Button key={size} variant="primary" onClick={() => createNew(size)}>
                {size}줄
              </Button>
            ))}
          </div>
        </Dialog>
      )}
      {toast.node}
    </div>
  )
}
