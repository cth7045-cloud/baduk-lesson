import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { createFileMaterial, createSgfMaterial, updateMaterial, type Material, type Visibility } from '../../data/materials'
import { createTag, listTags, type Tag } from '../../data/problems'
import { readSgfFile, titleFromTree } from '../../lib/sgfFile'
import type { Profile } from '../auth/types'
import { listStudents } from '../students/api'
import { TagPicker } from '../assignments/common'
import s from './Library.module.css'

const ACCEPT = '.sgf,.pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*'

function kindOf(file: File): 'sgf' | 'pdf' | 'image' | null {
  if (/\.sgf$/i.test(file.name)) return 'sgf'
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  if (file.type.startsWith('image/')) return 'image'
  return null
}

/** 자료 올리기 (material = null) 또는 자료 정보 고치기 */
export function MaterialDialog({ material, onClose, onSaved }: { material: Material | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState(material?.title ?? '')
  const [description, setDescription] = useState(material?.description ?? '')
  const [visibility, setVisibility] = useState<Visibility>(material?.visibility ?? 'all')
  const [tags, setTags] = useState<Tag[]>([])
  const [tagIds, setTagIds] = useState<string[]>(material?.tags.map((t) => t.tag_id) ?? [])
  const [students, setStudents] = useState<Profile[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set(material?.targets.map((t) => t.student_id) ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([listTags(), listStudents()]).then(([t, st]) => {
      setTags(t)
      setStudents(st.filter((x) => x.is_active))
    })
  }, [])

  async function onPick(f: File | undefined) {
    if (!f) return
    const kind = kindOf(f)
    if (!kind) {
      setError('SGF, PDF, 이미지(PNG·JPG) 파일만 올릴 수 있습니다.')
      return
    }
    setError(null)
    setFile(f)
    if (title) return
    const fallback = f.name.replace(/\.[^.]+$/, '')
    if (kind !== 'sgf') return setTitle(fallback)
    // 해설 기보는 기보 안의 제목(GN)이나 대국자 이름으로
    try {
      setTitle(titleFromTree((await readSgfFile(f)).tree, fallback))
    } catch {
      setError('SGF 파일을 읽지 못했습니다.')
    }
  }

  async function addTag() {
    const name = window.prompt('새 태그 이름')?.trim()
    if (!name) return
    try {
      const t = await createTag(name)
      setTags([...tags, t])
      setTagIds([...tagIds, t.id])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function save() {
    if (!material && !file) return setError('올릴 파일을 골라 주세요.')
    if (!title.trim()) return setError('자료 이름을 입력해 주세요.')
    if (visibility === 'selected' && picked.size === 0) return setError('공개할 학생을 한 명 이상 골라 주세요.')
    const meta = { title: title.trim(), description: description.trim(), visibility, tagIds, studentIds: [...picked] }
    setBusy(true)
    setError(null)
    try {
      if (material) {
        await updateMaterial(material, meta)
        onSaved(material.id)
      } else if (file && kindOf(file) === 'sgf') {
        onSaved(await createSgfMaterial(meta, await readSgfFile(file)))
      } else if (file) {
        onSaved(await createFileMaterial(meta, file))
      }
    } catch (e) {
      setError(`저장하지 못했습니다: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={material ? '자료 정보 고치기' : '자료 올리기'}
      wide
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? '올리는 중…' : material ? '저장' : '올리기'}
          </Button>
        </>
      }
    >
      <div className={s.form}>
        {!material && (
          <div className={s.field}>
            파일
            <button type="button" className={s.drop} onClick={() => fileRef.current?.click()}>
              {file ? (
                <>
                  <b>{file.name}</b> ({Math.max(1, Math.round(file.size / 1024))}KB) — 다른 파일 고르기
                </>
              ) : (
                '눌러서 파일 고르기 (해설 기보 SGF, PDF, 이미지)'
              )}
            </button>
            <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => void onPick(e.target.files?.[0])} />
            {file && kindOf(file) === 'sgf' && <small className={s.hint}>기보 안의 코멘트는 자료실에서 바로 고칠 수 있는 코멘트로 옮겨집니다.</small>}
          </div>
        )}
        <label className={s.field}>
          자료 이름
          <input className={s.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className={s.field}>
          설명 (선택)
          <textarea className={s.textarea} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </label>
        <div className={s.field}>
          주제 태그
          <TagPicker tags={tags} selected={tagIds} onChange={setTagIds} onAdd={() => void addTag()} />
        </div>
        <div className={s.field}>
          공개 범위
          <div className={s.segment}>
            <button type="button" className={visibility === 'all' ? s.on : ''} onClick={() => setVisibility('all')}>
              모든 학생
            </button>
            <button type="button" className={visibility === 'selected' ? s.on : ''} onClick={() => setVisibility('selected')}>
              특정 학생만
            </button>
          </div>
          {visibility === 'selected' && (
            <div className={s.checks}>
              {students.map((st) => (
                <label key={st.id} className={s.check}>
                  <input
                    type="checkbox"
                    checked={picked.has(st.id)}
                    onChange={(e) => {
                      const next = new Set(picked)
                      if (e.target.checked) next.add(st.id)
                      else next.delete(st.id)
                      setPicked(next)
                    }}
                  />
                  {st.display_name}
                </label>
              ))}
            </div>
          )}
        </div>
        {error && <p className={s.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
