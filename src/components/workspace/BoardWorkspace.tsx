import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toDisplay } from '../../go/coords'
import { nodeMarkup } from '../../go/markup'
import { PLAY_ERROR_MESSAGE } from '../../go/rules/board'
import {
  clearMarkup,
  editStone,
  playMove,
  promoteToMainLine,
  toggleArrow,
  toggleLabel,
  toggleShape,
  type ShapeKind,
} from '../../go/tree/edit'
import { getNode, isOnMainLine, moveNumber, nextColor, nodeMove, pathTo } from '../../go/tree/gameTree'
import { lastMovePoint, moveNumbersOnBoard, positionAt } from '../../go/tree/position'
import { samePoint, type Color, type Point } from '../../go/types'
import { GoBoard } from '../board/GoBoard'
import { Icon } from '../board/icons'
import type { GameEditor } from '../board/useGameEditor'
import { CommentPanel } from '../comments/CommentPanel'
import type { CommentActions, CommentMap } from '../comments/types'
import { MoveTree } from '../tree/MoveTree'
import { useToast } from '../ui/Toast'
import s from './BoardWorkspace.module.css'

export type Tool = 'play' | 'black' | 'white' | 'erase' | ShapeKind | 'label' | 'arrow'

const TOOLS: { id: Tool; label: string; group: number }[] = [
  { id: 'play', label: '착수 (흑백 번갈아)', group: 0 },
  { id: 'black', label: '흑돌 놓기', group: 0 },
  { id: 'white', label: '백돌 놓기', group: 0 },
  { id: 'erase', label: '돌 지우기', group: 0 },
  { id: 'TR', label: '삼각형', group: 1 },
  { id: 'CR', label: '동그라미', group: 1 },
  { id: 'SQ', label: '사각형', group: 1 },
  { id: 'MA', label: 'X 표시', group: 1 },
  { id: 'label', label: '글자 (A, B, C…)', group: 1 },
  { id: 'arrow', label: '화살표 (시작점 → 끝점)', group: 1 },
]

const PREF_KEY = 'baduk-board-prefs-v1'
interface Prefs {
  showNumbers: boolean
  showCoords: boolean
  confirmTouch: boolean
}
function loadPrefs(): Prefs {
  const def = { showNumbers: false, showCoords: true, confirmTouch: true }
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') }
  } catch {
    return def
  }
}

export interface BoardWorkspaceProps {
  editor: GameEditor
  comments: CommentMap
  commentActions?: CommentActions
  /** 코멘트 작성·수정·삭제 가능 (선생님) */
  canEditComments: boolean
  /** 착수·표시 도구 사용 가능 */
  canEditBoard: boolean
  /** 학생이 올린 기보의 원본 메모 (노드 ID → 글) */
  sourceNotes?: Record<string, string>
  sourceMemo?: string
  /** 스위치 줄 끝에 넣을 내용 (예: 저장 상태) */
  aside?: ReactNode
  /** 화면 제목·버튼 줄. PC에서는 오른쪽 열 맨 위, 폰에서는 맨 위에 놓임 */
  header?: ReactNode
  /** 코멘트 패널의 "판 전체 메모" 제목 바꾸기 */
  memoLabel?: string
}

/**
 * 바둑판 + 도구 + 이동 버튼 + 코멘트 패널 + 수순 트리를 묶은 작업 화면.
 * 연습판, 수업방, 과제, 자료실, 기보 제출함에서 모두 이 컴포넌트를 씀.
 */
export function BoardWorkspace({
  editor,
  comments,
  commentActions,
  canEditComments,
  canEditBoard,
  sourceNotes,
  sourceMemo,
  aside,
  header,
  memoLabel,
}: BoardWorkspaceProps) {
  const { tree, currentId } = editor
  const [tool, setTool] = useState<Tool>('play')
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [pending, setPending] = useState<{ p: Point; color: Color } | null>(null)
  const [arrowFrom, setArrowFrom] = useState<Point | null>(null)
  const [highlight, setHighlight] = useState<{ points: Point[]; key: number } | null>(null)
  const [focusSignal, setFocusSignal] = useState(0)
  const toast = useToast()

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
    } catch {
      // 저장 불가(사생활 보호 모드 등)여도 동작에는 지장 없음
    }
  }, [prefs])

  // 수를 옮기면 대기 중인 착수·화살표 시작점·좌표 강조는 취소
  useEffect(() => {
    setPending(null)
    setArrowFrom(null)
    setHighlight(null)
  }, [currentId])

  useEffect(() => {
    if (!highlight) return
    const t = window.setTimeout(() => setHighlight(null), 4000)
    return () => window.clearTimeout(t)
  }, [highlight])

  const node = getNode(tree, currentId)
  const board = useMemo(() => positionAt(tree, currentId), [tree, currentId])
  const markup = useMemo(() => nodeMarkup(node, tree.size), [node, tree.size])
  const toPlay = nextColor(tree, currentId)
  const numbers = useMemo(
    () => (prefs.showNumbers ? moveNumbersOnBoard(tree, currentId) : null),
    [prefs.showNumbers, tree, currentId],
  )

  // 판 위의 돌 중 코멘트가 달린 수
  const commentedPoints = useMemo(() => {
    const latest = new Map<number, string>()
    for (const id of pathTo(tree, currentId)) {
      const mv = nodeMove(tree, tree.nodes[id])
      if (mv?.point) latest.set(mv.point.y * tree.size + mv.point.x, id)
    }
    const set = new Set<number>()
    for (const [idx, id] of latest) if (comments[id] && board.cells[idx] !== 0) set.add(idx)
    return set
  }, [tree, currentId, comments, board])

  const commentedIds = useMemo(() => new Set(Object.keys(comments)), [comments])

  const variationHints = useMemo(() => {
    if (node.children.length < 2) return []
    return node.children.flatMap((cid) => {
      const mv = nodeMove(tree, tree.nodes[cid])
      return mv?.point ? [{ p: mv.point, color: mv.color }] : []
    })
  }, [node, tree])

  const play = useCallback(
    (p: Point | null, color: Color) => {
      const r = playMove(tree, currentId, color, p)
      if (!r.ok) {
        toast.show(PLAY_ERROR_MESSAGE[r.error])
        return
      }
      editor.apply(r.ops, r.nodeId)
    },
    [tree, currentId, editor, toast],
  )

  const onPointClick = useCallback(
    (p: Point, pointerType: string) => {
      switch (tool) {
        case 'play': {
          if (board.get(p) !== 0) {
            toast.show(PLAY_ERROR_MESSAGE.occupied)
            return
          }
          if (pointerType === 'touch' && prefs.confirmTouch && !samePoint(pending?.p, p)) {
            setPending({ p, color: toPlay })
            return
          }
          setPending(null)
          play(p, toPlay)
          return
        }
        case 'black':
        case 'white':
        case 'erase': {
          const r = editStone(tree, currentId, p, tool === 'erase' ? null : tool === 'black' ? 'B' : 'W')
          if (r.ok) editor.apply(r.ops, r.nodeId)
          return
        }
        case 'label':
          editor.apply(toggleLabel(tree, currentId, p))
          return
        case 'arrow':
          if (!arrowFrom) setArrowFrom(p)
          else {
            editor.apply(toggleArrow(tree, currentId, arrowFrom, p))
            setArrowFrom(null)
          }
          return
        default:
          editor.apply(toggleShape(tree, currentId, p, tool))
      }
    },
    [tool, board, prefs.confirmTouch, pending, toPlay, play, tree, currentId, editor, arrowFrom, toast],
  )

  // 키보드: ←→ 이동, ↑↓ 변화 바꾸기, Home/End, PageUp/Down 10수, Enter 코멘트 입력
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const keys: Record<string, () => void> = {
        ArrowLeft: () => editor.back(),
        ArrowRight: () => editor.forward(),
        ArrowUp: () => editor.switchVariation(-1),
        ArrowDown: () => editor.switchVariation(1),
        Home: () => editor.first(),
        End: () => editor.last(),
        PageUp: () => editor.back(10),
        PageDown: () => editor.forward(10),
        Escape: () => {
          setPending(null)
          setArrowFrom(null)
        },
      }
      if (canEditComments) keys.Enter = () => setFocusSignal((n) => n + 1)
      const fn = keys[e.key]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, canEditComments])

  const onCoordClick = useCallback((p: Point) => setHighlight({ points: [p], key: Date.now() }), [])

  // 현재 수 설명
  const mv = nodeMove(tree, node)
  const num = moveNumber(tree, currentId)
  const nodeLabel = mv
    ? `${num}수 · ${mv.color === 'B' ? '흑' : '백'} ${mv.point ? toDisplay(mv.point, tree.size) : '한 수 쉼'}`
    : node.parentId
      ? `${num}수 뒤 배치 변경`
      : '시작 배치'

  const siblings = node.parentId ? getNode(tree, node.parentId).children : [node.id]
  const varIndex = siblings.indexOf(node.id)
  const onMain = useMemo(() => isOnMainLine(tree, currentId), [tree, currentId])

  function deleteFromHere() {
    if (!node.parentId) {
      toast.show('처음 배치는 지울 수 없습니다. 새 판을 만들어 주세요.')
      return
    }
    if (!window.confirm(`이 수(${nodeLabel})와 그 뒤의 수순을 모두 지울까요?`)) return
    editor.apply([{ type: 'deleteNode', nodeId: currentId }])
  }

  return (
    <div className={s.layout}>
      {header && <div className={s.areaHead}>{header}</div>}
      {canEditBoard && (
        <div className={s.areaTools}>
          <div className={s.toolbar} role="toolbar" aria-label="바둑판 도구">
            {[0, 1].map((g) => (
              <div key={g} className={s.toolGroup}>
                {TOOLS.filter((t) => t.group === g).map((t) => {
                  const I = Icon[t.id as keyof typeof Icon]
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`${s.tool} ${tool === t.id ? s.toolOn : ''}`}
                      title={t.label}
                      aria-label={t.label}
                      aria-pressed={tool === t.id}
                      onClick={() => {
                        setTool(t.id)
                        setPending(null)
                        setArrowFrom(null)
                      }}
                    >
                      <I />
                    </button>
                  )
                })}
              </div>
            ))}
            <div className={s.toolGroup}>
              <button type="button" className={s.textTool} onClick={() => editor.apply(clearMarkup(currentId))}>
                표시 지우기
              </button>
              <button type="button" className={s.textTool} onClick={() => play(null, toPlay)}>
                한 수 쉼
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={s.areaBoard}>
        <div className={s.boardBox}>
          <GoBoard
            board={board}
            markup={markup}
            lastMove={lastMovePoint(tree, currentId)}
            numbers={numbers}
            commented={commentedPoints}
            variationHints={variationHints}
            pending={pending}
            highlights={highlight?.points}
            highlightKey={highlight?.key}
            arrowFrom={arrowFrom}
            showCoords={prefs.showCoords}
            hoverColor={canEditBoard && tool === 'play' ? toPlay : canEditBoard && tool === 'black' ? 'B' : canEditBoard && tool === 'white' ? 'W' : null}
            onPointClick={canEditBoard ? onPointClick : undefined}
          />
          {/* 안내 문구는 누른 자리의 반대쪽에 띄워 돌을 가리지 않게 함 */}
          {pending && (
            <div className={`${s.hint} ${pending.p.y >= tree.size / 2 ? s.hintTop : s.hintBottom}`}>
              같은 자리를 한 번 더 누르면 착수합니다
            </div>
          )}
          {arrowFrom && (
            <div className={`${s.hint} ${arrowFrom.y >= tree.size / 2 ? s.hintTop : s.hintBottom}`}>
              화살표 끝점을 누르세요
            </div>
          )}
        </div>
      </div>

      <div className={s.areaNav}>
        <div className={s.nav}>
          <div className={s.navButtons}>
            <NavBtn label="처음으로" onClick={editor.first} disabled={!editor.canBack} icon={<Icon.first />} />
            <NavBtn label="10수 뒤로" onClick={() => editor.back(10)} disabled={!editor.canBack} icon={<Icon.back10 />} />
            <NavBtn label="한 수 뒤로" onClick={() => editor.back()} disabled={!editor.canBack} icon={<Icon.back />} big />
            <NavBtn label="한 수 앞으로" onClick={() => editor.forward()} disabled={!editor.canForward} icon={<Icon.forward />} big />
            <NavBtn label="10수 앞으로" onClick={() => editor.forward(10)} disabled={!editor.canForward} icon={<Icon.forward10 />} />
            <NavBtn label="끝으로" onClick={editor.last} disabled={!editor.canForward} icon={<Icon.last />} />
          </div>
          <div className={s.status}>
            <span className={s.moveNo}>{num}수</span>
            <span className={s.toPlay}>
              <span className={toPlay === 'B' ? s.dotB : s.dotW} /> {toPlay === 'B' ? '흑' : '백'} 차례
            </span>
            <span className={s.caps} title="따낸 돌">
              따낸 돌 흑 {board.captures.B} · 백 {board.captures.W}
            </span>
          </div>
        </div>

        <div className={s.toggles}>
          <Toggle label="수순 번호" on={prefs.showNumbers} onChange={(v) => setPrefs({ ...prefs, showNumbers: v })} />
          <Toggle label="좌표" on={prefs.showCoords} onChange={(v) => setPrefs({ ...prefs, showCoords: v })} />
          {canEditBoard && (
            <Toggle
              label="터치 두 번 눌러 착수"
              on={prefs.confirmTouch}
              onChange={(v) => setPrefs({ ...prefs, confirmTouch: v })}
            />
          )}
          {aside && <div className={s.aside}>{aside}</div>}
        </div>
      </div>

      <div className={s.areaComments}>
        <CommentPanel
          boardSize={tree.size}
          nodeId={currentId}
          nodeLabel={nodeLabel}
          comments={comments}
          sourceNote={sourceNotes?.[currentId]}
          sourceMemo={sourceMemo}
          canEdit={canEditComments}
          actions={commentActions}
          onCoordClick={onCoordClick}
          focusSignal={focusSignal}
          memoLabel={memoLabel}
        />
      </div>

      <div className={s.areaTree}>
        <div className={s.treeBlock}>
          <div className={s.treeHead}>
            <span className={s.treeTitle}>수순</span>
            {siblings.length > 1 && (
              <span className={s.variation}>
                <button
                  type="button"
                  className={s.varBtn}
                  onClick={() => editor.switchVariation(-1)}
                  disabled={varIndex === 0}
                  aria-label="위 변화"
                >
                  <Icon.up />
                </button>
                변화 {varIndex + 1}/{siblings.length}
                <button
                  type="button"
                  className={s.varBtn}
                  onClick={() => editor.switchVariation(1)}
                  disabled={varIndex === siblings.length - 1}
                  aria-label="아래 변화"
                >
                  <Icon.down />
                </button>
              </span>
            )}
            {canEditBoard && (
              <span className={s.treeActions}>
                {!onMain && (
                  <button
                    type="button"
                    className={s.textTool}
                    onClick={() => editor.apply(promoteToMainLine(tree, currentId))}
                  >
                    본선으로
                  </button>
                )}
                <button type="button" className={`${s.textTool} ${s.dangerText}`} onClick={deleteFromHere}>
                  이 수부터 삭제
                </button>
              </span>
            )}
          </div>
          <MoveTree tree={tree} currentId={currentId} commentedIds={commentedIds} onSelect={editor.goTo} />
        </div>
      </div>
      {toast.node}
    </div>
  )
}

function NavBtn({
  label,
  onClick,
  disabled,
  icon,
  big,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  icon: ReactNode
  big?: boolean
}) {
  return (
    <button
      type="button"
      className={`${s.navBtn} ${big ? s.navBig : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={s.toggle}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className={s.switch} aria-hidden />
      {label}
    </label>
  )
}
