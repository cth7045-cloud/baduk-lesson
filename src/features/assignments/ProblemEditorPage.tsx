import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CommentMap } from '../../components/comments/types'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { BoardWorkspace } from '../../components/workspace/BoardWorkspace'
import { summarizeProblem } from '../../go/problem/grader'
import { getNode, nodeMove, type GameTree } from '../../go/tree/gameTree'
import { loadBoard } from '../../data/boards'
import { listComments } from '../../data/comments'
import { createTag, getProblem, listTags, updateProblem, type ProblemRow, type Tag } from '../../data/problems'
import { saveStateLabel, useBoardDocument } from '../boards/useBoardDocument'
import { ProblemSolver } from './ProblemSolver'
import { TagPicker } from './common'
import s from './Assignments.module.css'

interface Loaded {
  problem: ProblemRow
  tree: GameTree
  comments: CommentMap
  tags: Tag[]
}

/** 선생님: 문제 출제·수정 */
export function ProblemEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void (async () => {
      try {
        const problem = await getProblem(id)
        const [{ tree }, comments, tags] = await Promise.all([loadBoard(problem.board_id), listComments(problem.board_id), listTags()])
        setData({ problem, tree, comments, tags })
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [id])

  if (error) return <p className={s.message}>문제를 불러오지 못했습니다: {error}</p>
  if (!data) return <p className={s.message}>불러오는 중…</p>
  return <ProblemEditor key={data.problem.id} initial={data} />
}

function ProblemEditor({ initial }: { initial: Loaded }) {
  const toast = useToast()
  const [problem, setProblem] = useState(initial.problem)
  const [title, setTitle] = useState(initial.problem.title)
  const [difficulty, setDifficulty] = useState<number | null>(initial.problem.difficulty)
  const [tags, setTags] = useState(initial.tags)
  const [tagIds, setTagIds] = useState(initial.problem.tags.map((t) => t.tag_id))
  const [metaDirty, setMetaDirty] = useState(false)
  const [preview, setPreview] = useState(false)

  const { editor, comments, commentActions, saveState, flush } = useBoardDocument({
    boardId: problem.board_id,
    initialTree: initial.tree,
    initialComments: initial.comments,
    autosave: true,
    onError: (m) => toast.show(m),
  })

  const { tree, currentId } = editor
  const root = getNode(tree, tree.rootId)
  const toPlay = (root.props.PL?.[0] as 'B' | 'W' | undefined) ?? problem.to_play
  const node = getNode(tree, currentId)
  const isMove = !!nodeMove(tree, node)
  const summary = useMemo(() => summarizeProblem(tree), [tree])

  function setToPlay(c: 'B' | 'W') {
    editor.apply([{ type: 'setProps', nodeId: tree.rootId, props: { PL: [c] } }])
    setMetaDirty(true)
  }

  function toggleMark(mark: 'TE' | 'BM') {
    const other = mark === 'TE' ? 'BM' : 'TE'
    const on = !!node.props[mark]
    editor.apply([{ type: 'setProps', nodeId: currentId, props: { [mark]: on ? null : ['1'], [other]: null } }])
  }

  async function saveMeta() {
    if (!title.trim()) return toast.show('문제 이름을 입력해 주세요.')
    try {
      await updateProblem(problem.id, problem.board_id, { title: title.trim(), to_play: toPlay, difficulty }, tagIds)
      setProblem({ ...problem, title: title.trim(), to_play: toPlay, difficulty })
      setMetaDirty(false)
      toast.show('저장했습니다.')
    } catch (e) {
      toast.show(`저장하지 못했습니다: ${(e as Error).message}`)
    }
  }

  async function addTag() {
    const name = window.prompt('새 태그 이름 (예: 맥, 수상전)')?.trim()
    if (!name) return
    try {
      const t = await createTag(name)
      setTags([...tags, t])
      setTagIds([...tagIds, t.id])
      setMetaDirty(true)
    } catch (e) {
      toast.show((e as Error).message)
    }
  }

  if (preview) {
    return (
      <div className={s.previewWrap}>
        <div className={s.previewBar}>
          <span>학생 화면 미리보기 — 기록은 남지 않습니다.</span>
          <Button size="small" variant="primary" onClick={() => setPreview(false)}>
            출제 화면으로
          </Button>
        </div>
        <ProblemSolver title={title || '문제'} problemTree={tree} comments={comments} />
      </div>
    )
  }

  const header = (
    <div className={s.editorHead}>
      <Link to="/assignments?tab=problems" className={s.back}>
        ← 문제 은행
      </Link>
      <input
        className={s.titleInput}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          setMetaDirty(true)
        }}
        aria-label="문제 이름"
        maxLength={120}
      />
      <div className={s.metaRow}>
        <div className={s.segment}>
          <button type="button" className={toPlay === 'B' ? s.on : ''} onClick={() => setToPlay('B')}>
            흑선
          </button>
          <button type="button" className={toPlay === 'W' ? s.on : ''} onClick={() => setToPlay('W')}>
            백선
          </button>
        </div>
        <label className={s.inline}>
          난이도
          <select
            className={s.select}
            value={difficulty ?? ''}
            onChange={(e) => {
              setDifficulty(e.target.value ? Number(e.target.value) : null)
              setMetaDirty(true)
            }}
          >
            <option value="">-</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {'★'.repeat(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TagPicker
        tags={tags}
        selected={tagIds}
        onChange={(ids) => {
          setTagIds(ids)
          setMetaDirty(true)
        }}
        onAdd={() => void addTag()}
      />
      {metaDirty && (
        <Button size="small" variant="primary" onClick={() => void saveMeta()}>
          이름·차례·난이도·태그 저장
        </Button>
      )}

      <div className={s.markBox}>
        <span className={s.markLabel}>
          {isMove ? '지금 수를' : '수를 선택한 뒤'} 표시:
        </span>
        <Button size="small" disabled={!isMove} className={node.props.TE ? s.markGood : ''} onClick={() => toggleMark('TE')}>
          {node.props.TE ? '✓ 정답 표시됨' : '정답'}
        </Button>
        <Button size="small" disabled={!isMove} className={node.props.BM ? s.markBad : ''} onClick={() => toggleMark('BM')}>
          {node.props.BM ? '✕ 오답 표시됨' : '오답'}
        </Button>
        <span className={s.summary}>
          정답 수순 {summary.correctLines}개 · 오답 {summary.wrongMoves}개
        </span>
      </div>

      <details className={s.guide}>
        <summary>문제 만드는 방법</summary>
        <ol>
          <li>
            <b>처음 배치</b>: 수순 트리의 첫 칸(□)이 선택된 상태에서 도구 막대의 <b>흑돌·백돌 놓기</b>로 돌을 놓습니다.
          </li>
          <li>
            <b>정답 수순</b>: 착수 도구로 학생의 정답 수 → 상대 응수 → … 순서로 둡니다. 마지막 수까지 가면 정답입니다.
          </li>
          <li>
            <b>다른 정답·오답</b>: 처음(⏮)으로 돌아가 다른 수를 두면 갈래가 생깁니다. 틀린 수는 <b>오답</b>을 누르고, 이어서 상대의 응징 수를 둡니다.
          </li>
          <li>
            <b>해설</b>: 각 수에 코멘트를 달면 학생이 그 수를 두었을 때 보입니다 (정답 해설·오답 이유). 문제 설명(예: "흑선 활")은 아래 "문제 설명"에 씁니다.
          </li>
          <li>
            수순 중간에서 끝내려면 그 수에 <b>정답</b>을 누릅니다.
          </li>
        </ol>
      </details>

      <Button
        variant="primary"
        onClick={() => {
          void flush()
          setPreview(true)
        }}
      >
        학생처럼 풀어 보기
      </Button>
    </div>
  )

  return (
    <div>
      <BoardWorkspace
        header={header}
        editor={editor}
        comments={comments}
        commentActions={commentActions}
        canEditComments
        canEditBoard
        memoLabel="문제 설명"
        aside={<span className={s.muted}>{saveStateLabel(saveState)}</span>}
      />
      {toast.node}
    </div>
  )
}
