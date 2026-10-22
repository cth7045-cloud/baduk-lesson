import { describe, expect, it } from 'vitest'
import { fromDisplay } from '../../../go/coords'
import { newGame } from '../../../go/sgf/convert'
import { playMove, toggleShape } from '../../../go/tree/edit'
import { lineEnd, nextColor, type GameTree } from '../../../go/tree/gameTree'
import { applyOps, type TreeOp } from '../../../go/tree/ops'
import { LessonSync, type ControlMode, type Role, type SyncMessage } from '../sync'

/** 메모리 안에서 메시지를 주고받는 가짜 채널 (자기 자신에게는 안 보냄) */
class Bus {
  clients: Client[] = []
  log: SyncMessage[] = []
  deliver(from: Client, msg: SyncMessage) {
    this.log.push(msg)
    // 실제 네트워크처럼 JSON으로 한 번 변환
    const copy = JSON.parse(JSON.stringify(msg)) as SyncMessage
    for (const c of this.clients) if (c !== from && c.connected) c.sync.handle(copy)
  }
}

class Client {
  tree: GameTree
  currentId: string
  teacherNode: string | null = null
  ended = false
  connected = true
  sync: LessonSync

  constructor(bus: Bus, public id: string, public role: Role, tree: GameTree, mode: ControlMode) {
    this.tree = tree
    this.currentId = tree.rootId
    this.sync = new LessonSync(
      { id, role },
      { send: (m) => bus.deliver(this, m) },
      {
        applyRemote: (ops) => (this.tree = applyOps(this.tree, ops)),
        replaceTree: (t, n) => {
          this.tree = t
          this.currentId = n && t.nodes[n] ? n : t.rootId
        },
        goTo: (n) => {
          if (this.tree.nodes[n]) this.currentId = n
        },
        getState: () => ({ tree: this.tree, currentId: this.currentId }),
        onTeacherNode: (n) => (this.teacherNode = n),
        onEnded: () => (this.ended = true),
      },
      mode,
    )
    bus.clients.push(this)
  }

  /** 화면에서 착수한 것처럼: 내 판에 적용 후 전송 */
  play(coord: string): boolean {
    if (!this.sync.canEdit()) return false
    const r = playMove(this.tree, this.currentId, nextColor(this.tree, this.currentId), fromDisplay(coord, this.tree.size))
    if (!r.ok) return false
    this.tree = applyOps(this.tree, r.ops)
    this.currentId = r.nodeId
    this.sync.localOps(r.ops, r.nodeId)
    if (this.role === 'teacher') this.sync.localNav(this.currentId)
    return true
  }

  edit(ops: TreeOp[]) {
    this.tree = applyOps(this.tree, ops)
    this.sync.localOps(ops)
  }
}

function setup(mode: ControlMode = 'teacher') {
  const bus = new Bus()
  const base = newGame(19)
  const teacher = new Client(bus, 't', 'teacher', base, mode)
  const s1 = new Client(bus, 's1', 'student', base, mode)
  const s2 = new Client(bus, 's2', 'student', base, mode)
  return { bus, teacher, s1, s2 }
}

const moves = (c: Client) => {
  const out: string[] = []
  let id: string | undefined = c.tree.rootId
  while (id) {
    const n: GameTree['nodes'][string] = c.tree.nodes[id]
    const v = n.props.B?.[0] ?? n.props.W?.[0]
    if (v !== undefined) out.push(v)
    id = n.children[0]
  }
  return out.join(' ')
}

describe('실시간 수업 동기화', () => {
  it('선생님 착수가 모든 학생 판에 똑같이 반영되고, 학생 화면이 선생님 수를 따라간다', () => {
    const { teacher, s1, s2 } = setup()
    teacher.play('Q16')
    teacher.play('D4')
    expect(moves(s1)).toBe('pd dp')
    expect(moves(s2)).toBe(moves(teacher))
    expect(s1.teacherNode).toBe(teacher.currentId)
    // 표시 도구도 전달
    teacher.edit(toggleShape(teacher.tree, teacher.currentId, fromDisplay('C3', 19)!, 'TR'))
    expect(s1.tree.nodes[teacher.currentId].props.TR).toEqual(['cq'])
  })

  it('"선생님만 조작"이면 학생은 둘 수 없고, 보내더라도 무시된다', () => {
    const { teacher, s1, s2 } = setup('teacher')
    expect(s1.play('Q16')).toBe(false)
    // 조작된 클라이언트가 억지로 보낸 경우
    const r = playMove(s1.tree, s1.tree.rootId, 'B', fromDisplay('D4', 19))
    if (!r.ok) throw new Error()
    s1.sync.setControlMode('everyone') // 자기 화면에서만 바꾼 상태
    s1.sync.localOps(r.ops, r.nodeId)
    expect(moves(teacher)).toBe('')
    expect(moves(s2)).toBe('')
  })

  it('"학생도 착수 가능"이면 학생 수가 모두에게 반영되고, 같은 수를 보던 선생님 화면이 따라간다', () => {
    const { teacher, s1, s2 } = setup('everyone')
    teacher.play('Q16')
    s1.currentId = teacher.currentId
    expect(s1.play('D4')).toBe(true)
    expect(moves(teacher)).toBe('pd dp')
    expect(moves(s2)).toBe('pd dp')
    expect(teacher.currentId).toBe(s1.currentId)
  })

  it('동시에 다른 수를 두면 변화도로 갈라질 뿐 판이 깨지지 않는다', () => {
    const { teacher, s1, s2 } = setup('everyone')
    teacher.play('Q16')
    s1.currentId = teacher.currentId
    s2.currentId = teacher.currentId
    s1.play('D4')
    s2.play('D16')
    const root = teacher.tree.nodes[teacher.tree.rootId]
    const first = teacher.tree.nodes[root.children[0]]
    expect(first.children).toHaveLength(2)
    expect(Object.keys(s1.tree.nodes).sort()).toEqual(Object.keys(teacher.tree.nodes).sort())
    expect(Object.keys(s2.tree.nodes).sort()).toEqual(Object.keys(teacher.tree.nodes).sort())
  })

  it('늦게 들어온(또는 끊겼던) 학생은 선생님이 보낸 판 전체로 맞춰진다', () => {
    const { teacher, s1 } = setup()
    s1.connected = false
    teacher.play('Q16')
    teacher.play('D4')
    teacher.play('Q3')
    expect(moves(s1)).toBe('')
    s1.connected = true
    teacher.sync.onPeerJoin('student')
    expect(moves(s1)).toBe(moves(teacher))
    expect(s1.teacherNode).toBe(teacher.currentId)
    expect(lineEnd(s1.tree, s1.tree.rootId)).toBe(teacher.currentId)
  })

  it('선생님이 판을 통째로 바꾸면(SGF 불러오기·초기화) 판 전체가 전달된다', () => {
    const { bus, teacher, s1 } = setup()
    teacher.play('Q16')
    const fresh = newGame(9)
    teacher.tree = fresh
    teacher.currentId = fresh.rootId
    teacher.sync.localOps([{ type: 'replaceTree', tree: fresh }])
    expect(bus.log.at(-1)?.event).toBe('snapshot')
    expect(s1.tree.size).toBe(9)
    expect(s1.tree.rootId).toBe(fresh.rootId)
  })

  it('수업 종료가 전달된다', () => {
    const { teacher, s1, s2 } = setup()
    teacher.sync.sendEnded()
    expect(s1.ended && s2.ended).toBe(true)
  })
})
