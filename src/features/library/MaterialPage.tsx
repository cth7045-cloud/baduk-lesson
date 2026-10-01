import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CommentMap } from '../../components/comments/types'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { BoardWorkspace } from '../../components/workspace/BoardWorkspace'
import type { GameTree } from '../../go/tree/gameTree'
import { loadBoard } from '../../data/boards'
import { listComments } from '../../data/comments'
import { deleteMaterial, getMaterial, materialFileUrl, type Material } from '../../data/materials'
import { markBoardRead } from '../../data/reads'
import { downloadSgfWithComments } from '../../lib/sgfFile'
import { useAuth } from '../auth/AuthProvider'
import { saveStateLabel, useBoardDocument } from '../boards/useBoardDocument'
import { MaterialDialog } from './MaterialDialog'
import s from './Library.module.css'

// PDF 뷰어는 PDF를 열 때만 불러옴 (처음 화면을 가볍게)
const PdfViewer = lazy(() => import('./PdfViewer'))

export function MaterialPage() {
  const { id } = useParams<{ id: string }>()
  const [material, setMaterial] = useState<Material | null>(null)
  const [board, setBoard] = useState<{ tree: GameTree; comments: CommentMap } | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async (mid: string) => {
    try {
      const m = await getMaterial(mid)
      setMaterial(m)
      if (m.board_id) {
        const [{ tree }, comments] = await Promise.all([loadBoard(m.board_id), listComments(m.board_id)])
        setBoard({ tree, comments })
      } else if (m.storage_path) {
        setFileUrl(await materialFileUrl(m.storage_path))
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    if (id) void load(id)
  }, [id])

  if (error) return <p className={s.message}>자료를 열 수 없습니다: {error}</p>
  if (!material) return <p className={s.message}>불러오는 중…</p>
  if (material.type === 'sgf') {
    if (!board) return <p className={s.message}>불러오는 중…</p>
    return <SgfMaterial key={material.id} material={material} tree={board.tree} comments={board.comments} onChanged={() => void load(material.id)} />
  }
  return <FileMaterial material={material} url={fileUrl} onChanged={() => void load(material.id)} />
}

/** 선생님 도구: 정보 고치기, 삭제 */
function TeacherTools({ material, onChanged }: { material: Material; onChanged: () => void }) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  async function remove() {
    if (!window.confirm(`"${material.title}" 자료를 삭제할까요?\n${material.type === 'sgf' ? '기보와 코멘트가' : '파일이'} 함께 지워지며 되돌릴 수 없습니다.`)) return
    try {
      await deleteMaterial(material)
      navigate('/library')
    } catch (e) {
      window.alert(`삭제하지 못했습니다: ${(e as Error).message}`)
    }
  }
  return (
    <>
      <div className={s.actions}>
        <Button size="small" onClick={() => setEditing(true)}>
          정보·공개 범위 고치기
        </Button>
        <Button size="small" variant="ghost" danger onClick={() => void remove()}>
          삭제
        </Button>
      </div>
      {editing && (
        <MaterialDialog
          material={material}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
        />
      )}
    </>
  )
}

function Heading({ material }: { material: Material }) {
  return (
    <>
      <Link to="/library" className={s.back}>
        ← 자료실
      </Link>
      <h1 className={s.title}>{material.title}</h1>
      {material.description && <p className={s.desc}>{material.description}</p>}
    </>
  )
}

function SgfMaterial({ material, tree, comments: initialComments, onChanged }: { material: Material; tree: GameTree; comments: CommentMap; onChanged: () => void }) {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const toast = useToast()
  const { editor, comments, commentActions, saveState } = useBoardDocument({
    boardId: material.board_id!,
    initialTree: tree,
    initialComments,
    autosave: isTeacher,
    onError: (m) => toast.show(m),
  })

  useEffect(() => {
    if (profile && !isTeacher) void markBoardRead(profile.id, material.board_id!)
  }, [profile, isTeacher, material.board_id])

  const header = (
    <div className={s.side}>
      <Heading material={material} />
      <div className={s.actions}>
        <Button size="small" onClick={() => downloadSgfWithComments(editor.tree, comments, material.title)}>
          SGF 내려받기
        </Button>
      </div>
      {isTeacher && <TeacherTools material={material} onChanged={onChanged} />}
      {!isTeacher && <p className={s.muted}>수순을 넘기면 수마다 해설이 나옵니다. 좌표(D4 등)를 누르면 판에 위치가 표시됩니다.</p>}
    </div>
  )

  return (
    <div>
      <BoardWorkspace
        header={header}
        editor={editor}
        comments={comments}
        commentActions={commentActions}
        canEditComments={isTeacher}
        canEditBoard={isTeacher}
        aside={isTeacher && <span className={s.muted}>{saveStateLabel(saveState)}</span>}
      />
      {toast.node}
    </div>
  )
}

function FileMaterial({ material, url, onChanged }: { material: Material; url: string | null; onChanged: () => void }) {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  return (
    <div className={s.filePage}>
      <div className={s.fileHead}>
        <Heading material={material} />
        <div className={s.actions}>
          {url && (
            <a className={s.linkBtn} href={url} target="_blank" rel="noreferrer">
              새 창으로 열기 / 내려받기
            </a>
          )}
        </div>
        {isTeacher && <TeacherTools material={material} onChanged={onChanged} />}
      </div>
      {!url && <p className={s.muted}>파일을 불러오는 중…</p>}
      {url && material.type === 'image' && <img className={s.picture} src={url} alt={material.title} />}
      {url && material.type === 'pdf' && (
        <Suspense fallback={<p className={s.muted}>PDF 보기 준비 중…</p>}>
          <PdfViewer url={url} />
        </Suspense>
      )}
    </div>
  )
}
