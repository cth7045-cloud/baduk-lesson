import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEditor } from '../../components/board/useGameEditor'
import type { TreeOp } from '../../go/tree/ops'
import { requireSupabase } from '../../lib/supabase'
import { LessonSync, type ControlMode, type Role, type SyncMessage } from './sync'

export type ChannelStatus = 'off' | 'connecting' | 'connected' | 'error'

export interface OnlineUser {
  id: string
  name: string
  role: Role
}

interface Options {
  lessonId: string
  /** 진행 중인 수업일 때만 채널에 들어감 */
  enabled: boolean
  me: OnlineUser
  mode: ControlMode
  editor: GameEditor
  onEnded: () => void
}

/**
 * Supabase 실시간 채널(lesson:<ID>, 비공개)과 LessonSync를 연결하는 훅.
 *  - 판 편집·선생님 화면 위치·판 전체를 주고받음 (broadcast)
 *  - 누가 접속해 있는지 표시 (presence)
 */
export function useLessonChannel({ lessonId, enabled, me, mode, editor, onEnded }: Options) {
  const [status, setStatus] = useState<ChannelStatus>(enabled ? 'connecting' : 'off')
  const [online, setOnline] = useState<OnlineUser[]>([])
  const [teacherNode, setTeacherNode] = useState<string | null>(null)
  const syncRef = useRef<LessonSync | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // 콜백 안에서 항상 최신 값을 쓰기 위한 참조
  const editorRef = useRef(editor)
  editorRef.current = editor
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded

  useEffect(() => {
    syncRef.current?.setControlMode(mode)
  }, [mode])

  useEffect(() => {
    if (!enabled) {
      setStatus('off')
      return
    }
    const sb = requireSupabase()
    let alive = true
    let channel: RealtimeChannel | null = null
    setStatus('connecting')

    const transport = {
      send: (msg: SyncMessage) => {
        void channel?.send({ type: 'broadcast', event: msg.event, payload: msg.payload })
      },
    }
    const sync = new LessonSync(
      { id: me.id, role: me.role },
      transport,
      {
        applyRemote: (ops) => editorRef.current.applyRemote(ops),
        replaceTree: (tree, nodeId) => editorRef.current.replace(tree, nodeId),
        goTo: (id) => editorRef.current.goTo(id),
        getState: () => ({ tree: editorRef.current.tree, currentId: editorRef.current.currentId }),
        onTeacherNode: (id) => setTeacherNode(id),
        onEnded: () => onEndedRef.current(),
      },
      mode,
    )
    syncRef.current = sync

    // 연결이 실패하거나 끊기면 잠시 뒤 스스로 다시 연결 (2초 → 4초 → … 최대 30초)
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const retry = () => {
      if (!alive || retryTimer) return
      setStatus('error')
      const old = channel
      channel = null
      channelRef.current = null
      if (old) void sb.removeChannel(old)
      const delay = Math.min(30000, 2000 * 2 ** failures)
      failures++
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        void connect()
      }, delay)
    }

    const connect = async () => {
      // 비공개 채널은 로그인 정보로 권한을 확인하므로 먼저 전달
      await sb.realtime.setAuth()
      if (!alive) return
      const ch = sb.channel(`lesson:${lessonId}`, {
        config: { private: true, broadcast: { self: false }, presence: { key: me.id } },
      })
      channel = ch
      channelRef.current = ch
      for (const event of ['ops', 'nav', 'snapshot', 'ended'] as const) {
        ch.on('broadcast', { event }, ({ payload }) => sync.handle({ event, payload } as SyncMessage))
      }
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<OnlineUser>()
        const users = new Map<string, OnlineUser>()
        for (const list of Object.values(state)) for (const u of list) users.set(u.id, { id: u.id, name: u.name, role: u.role })
        setOnline([...users.values()])
      })
      ch.on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const p of newPresences as unknown as OnlineUser[]) if (p.id !== me.id) sync.onPeerJoin(p.role)
      })
      ch.subscribe(async (st) => {
        if (!alive || channel !== ch) return
        if (st === 'SUBSCRIBED') {
          failures = 0
          setStatus('connected')
          await ch.track({ id: me.id, name: me.name, role: me.role })
          sync.onConnected()
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
          retry()
        } else if (st === 'CLOSED') {
          setStatus((s) => (s === 'error' ? s : 'connecting'))
        }
      })
    }
    void connect().catch(retry)

    return () => {
      alive = false
      clearTimeout(retryTimer)
      syncRef.current = null
      channelRef.current = null
      if (channel) void sb.removeChannel(channel)
    }
    // mode 는 위의 별도 효과에서 반영하므로 여기서는 다시 연결하지 않음
  }, [enabled, lessonId, me.id, me.name, me.role])

  /** 내 편집을 보냄 (useGameEditor 의 onOps 에 연결) */
  const sendOps = useCallback((ops: TreeOp[], nodeId?: string) => syncRef.current?.localOps(ops, nodeId), [])
  const sendNav = useCallback((nodeId: string) => syncRef.current?.localNav(nodeId), [])
  const sendSnapshot = useCallback(() => syncRef.current?.sendSnapshot(), [])
  const sendEnded = useCallback(() => syncRef.current?.sendEnded(), [])

  /** 학생: 판을 다시 맞춰 달라고 요청 (접속 표시를 다시 해서 선생님이 판 전체를 보내게 함) */
  const resync = useCallback(async () => {
    const ch = channelRef.current
    if (!ch) return
    await ch.untrack()
    await ch.track({ id: me.id, name: me.name, role: me.role })
  }, [me.id, me.name, me.role])

  return { status, online, teacherNode, sendOps, sendNav, sendSnapshot, sendEnded, resync }
}
