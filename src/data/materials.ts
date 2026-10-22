import type { ImportedGame } from '../go/sgf/convert'
import { requireSupabase } from '../lib/supabase'
import { treeToStoredSgf } from './boards'

export type MaterialType = 'sgf' | 'pdf' | 'image'
export type Visibility = 'all' | 'selected'

export interface Material {
  id: string
  title: string
  description: string
  type: MaterialType
  board_id: string | null
  storage_path: string | null
  visibility: Visibility
  created_at: string
  updated_at: string
  tags: { tag_id: string }[]
  targets: { student_id: string }[]
}

const SELECT = '*, tags:material_tags(tag_id), targets:material_targets(student_id)'
const BUCKET = 'materials'

export async function listMaterials(): Promise<Material[]> {
  const { data, error } = await requireSupabase().from('materials').select(SELECT).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as unknown as Material[]
}

export async function getMaterial(id: string): Promise<Material> {
  const { data, error } = await requireSupabase().from('materials').select(SELECT).eq('id', id).single()
  if (error) throw new Error(error.message)
  return data as unknown as Material
}

interface Meta {
  title: string
  description: string
  visibility: Visibility
  tagIds: string[]
  studentIds: string[]
}

/** SGF 자료: 파일 안의 코멘트(C)·대국 설명(GC)은 바로 고칠 수 있는 코멘트로 옮김 */
export async function createSgfMaterial(meta: Meta, game: ImportedGame): Promise<string> {
  const comments = Object.entries(game.nodeComments).map(([node_id, body]) => ({ node_id, body }))
  if (game.gameComment) comments.push({ node_id: null as unknown as string, body: game.gameComment })
  const { data, error } = await requireSupabase().rpc('create_sgf_material', {
    p_title: meta.title,
    p_description: meta.description,
    p_size: game.tree.size,
    p_sgf: treeToStoredSgf(game.tree),
    p_visibility: meta.visibility,
    p_tag_ids: meta.tagIds,
    p_student_ids: meta.visibility === 'selected' ? meta.studentIds : [],
    p_comments: comments,
  })
  if (error) throw new Error(error.message)
  return data as string
}

function extOf(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name)
  if (m) return m[1].toLowerCase()
  return file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1] ?? 'bin'
}

/** PDF·이미지 자료: 파일을 비공개 보관함에 올린 뒤 자료로 등록 (파일 이름은 영문 ID로 바꿔 저장) */
export async function createFileMaterial(meta: Meta, file: File): Promise<string> {
  const sb = requireSupabase()
  const type: MaterialType = file.type === 'application/pdf' ? 'pdf' : 'image'
  const path = `${crypto.getRandomValues(new Uint32Array(4)).join('-')}.${extOf(file)}`
  const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) throw new Error(/size|exceed/i.test(up.error.message) ? '파일이 너무 큽니다. (최대 30MB)' : up.error.message)
  const ins = await sb
    .from('materials')
    .insert({ title: meta.title, description: meta.description, type, storage_path: path, visibility: meta.visibility })
    .select('id')
    .single()
  if (ins.error) {
    await sb.storage.from(BUCKET).remove([path])
    throw new Error(ins.error.message)
  }
  const id = (ins.data as { id: string }).id
  await setMaterialLinks(id, meta.tagIds, meta.visibility === 'selected' ? meta.studentIds : [])
  return id
}

async function setMaterialLinks(id: string, tagIds: string[], studentIds: string[]) {
  const sb = requireSupabase()
  const d1 = await sb.from('material_tags').delete().eq('material_id', id)
  if (d1.error) throw new Error(d1.error.message)
  if (tagIds.length) {
    const r = await sb.from('material_tags').insert(tagIds.map((tag_id) => ({ material_id: id, tag_id })))
    if (r.error) throw new Error(r.error.message)
  }
  const d2 = await sb.from('material_targets').delete().eq('material_id', id)
  if (d2.error) throw new Error(d2.error.message)
  if (studentIds.length) {
    const r = await sb.from('material_targets').insert(studentIds.map((student_id) => ({ material_id: id, student_id })))
    if (r.error) throw new Error(r.error.message)
  }
}

export async function updateMaterial(m: Material, meta: Meta) {
  const sb = requireSupabase()
  const r = await sb
    .from('materials')
    .update({ title: meta.title, description: meta.description, visibility: meta.visibility })
    .eq('id', m.id)
  if (r.error) throw new Error(r.error.message)
  if (m.board_id) await sb.from('boards').update({ title: meta.title }).eq('id', m.board_id)
  await setMaterialLinks(m.id, meta.tagIds, meta.visibility === 'selected' ? meta.studentIds : [])
}

/** 자료 삭제: 자료 → (SGF면) 판과 코멘트 → (파일이면) 보관함 파일 */
export async function deleteMaterial(m: Material) {
  const sb = requireSupabase()
  const r = await sb.from('materials').delete().eq('id', m.id)
  if (r.error) throw new Error(r.error.message)
  if (m.board_id) await sb.from('boards').delete().eq('id', m.board_id)
  if (m.storage_path) await sb.storage.from(BUCKET).remove([m.storage_path])
}

/** 비공개 파일을 잠깐(1시간) 볼 수 있는 주소 */
export async function materialFileUrl(path: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
