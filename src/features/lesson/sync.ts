import { exportSgf, importSgf } from '../../go/sgf/convert'
import type { GameTree } from '../../go/tree/gameTree'
import type { TreeOp } from '../../go/tree/ops'

/*
 * 실시간 수업 동기화 규칙 (화면·Supabase와 분리된 순수 로직 → 단위 테스트 가능)
 *
 *  보내는 메시지
 *   - ops      : 판 편집 연산 (착수, 표시, 변화도...). goto = 보낸 사람이 편집 후 보고 있는 수
 *   - nav      : 선생님이 보고 있는 수 (학생 화면이 따라감)
 *   - snapshot : 판 전체 (SGF). 학생이 새로 들어오거나 다시 연결될 때, 판을 통째로 바꿀 때
 *   - ended    : 수업 종료
 *
 *  권한: "선생님만 조작"일 때 학생의 ops 는 무시 (DB 채널 권한으로도 막혀 있음)
 */

export type Role = 'teacher' | 'student'
export type ControlMode = 'teacher' | 'everyone'

export type SyncMessage =
  | { event: 'ops'; payload: { from: string; role: Role; ops: TreeOp[]; goto?: string } }
  | { event: 'nav'; payload: { nodeId: string } }
  | { event: 'snapshot'; payload: { sgf: string; nodeId: string } }
  | { event: 'ended'; payload: Record<string, never> }

export interface Transport {
  send: (msg: SyncMessage) => void
}

export interface SyncCallbacks {
  /** 다른 사람의 편집 연산을 내 판에 적용 */
  applyRemote: (ops: TreeOp[]) => void
  /** 판 전체 교체 */
  replaceTree: (tree: GameTree, nodeId?: string) => void
  goTo: (nodeId: string) => void
  getState: () => { tree: GameTree; currentId: string }
  /** 학생: 선생님이 보고 있는 수가 바뀜 */
  onTeacherNode?: (nodeId: string) => void
  onEnded?: () => void
}

export class LessonSync {
  private mode: ControlMode

  constructor(
    private me: { id: string; role: Role },
    private transport: Transport,
    private cb: SyncCallbacks,
    mode: ControlMode,
  ) {
    this.mode = mode
  }

  setControlMode(mode: ControlMode) {
    this.mode = mode
  }

  get isTeacher() {
    return this.me.role === 'teacher'
  }

  /** 지금 내가 판을 바꿀 수 있는가 */
  canEdit() {
    return this.isTeacher || this.mode === 'everyone'
  }

  /** 내가 편집한 뒤 호출 → 다른 사람에게 전달 */
  localOps(ops: TreeOp[], goto?: string) {
    if (!ops.length || !this.canEdit()) return
    const replace = ops.find((o) => o.type === 'replaceTree')
    if (replace && replace.type === 'replaceTree') {
      // 판 전체 교체는 연산 대신 SGF로 보냄 (크기가 작고 안전함)
      this.sendSnapshot()
      return
    }
    this.transport.send({ event: 'ops', payload: { from: this.me.id, role: this.me.role, ops, goto } })
  }

  /** 선생님이 보고 있는 수 알림 */
  localNav(nodeId: string) {
    if (this.isTeacher) this.transport.send({ event: 'nav', payload: { nodeId } })
  }

  sendSnapshot() {
    if (!this.isTeacher) return
    const { tree, currentId } = this.cb.getState()
    this.transport.send({ event: 'snapshot', payload: { sgf: exportSgf(tree, { keepIds: true }), nodeId: currentId } })
  }

  sendEnded() {
    if (this.isTeacher) this.transport.send({ event: 'ended', payload: {} })
  }

  /** 채널에 (다시) 연결됨: 선생님은 판 전체를 한 번 보내서 모두를 맞춤 */
  onConnected() {
    if (this.isTeacher) this.sendSnapshot()
  }

  /** 다른 사람이 들어옴: 학생이 들어오면 선생님이 판 전체를 보냄 */
  onPeerJoin(role: Role) {
    if (this.isTeacher && role === 'student') this.sendSnapshot()
  }

  /** 받은 메시지 처리 */
  handle(msg: SyncMessage) {
    switch (msg.event) {
      case 'ops': {
        const { role, ops, goto } = msg.payload
        if (role === 'student' && this.mode !== 'everyone') return
        const { currentId } = this.cb.getState()
        this.cb.applyRemote(ops)
        // 같은 수를 보고 있던 사람이 다음 수를 두면 따라감 (선생님 화면)
        if (goto && this.isTeacher) {
          const add = ops.find((o) => o.type === 'addNode' && o.id === goto)
          if (add && add.type === 'addNode' && add.parentId === currentId) this.cb.goTo(goto)
        }
        return
      }
      case 'nav':
        if (!this.isTeacher) this.cb.onTeacherNode?.(msg.payload.nodeId)
        return
      case 'snapshot': {
        if (this.isTeacher) return
        try {
          const { tree } = importSgf(msg.payload.sgf)
          const { currentId } = this.cb.getState()
          this.cb.replaceTree(tree, tree.nodes[currentId] ? currentId : msg.payload.nodeId)
          this.cb.onTeacherNode?.(msg.payload.nodeId)
        } catch {
          // 손상된 메시지는 무시 (다음 snapshot 에서 맞춰짐)
        }
        return
      }
      case 'ended':
        this.cb.onEnded?.()
        return
    }
  }
}
