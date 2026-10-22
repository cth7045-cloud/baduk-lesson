// 학생 계정 관리 (선생님만 호출 가능)
//  - create:         학생 계정 만들기 (아이디 + 비밀번호)
//  - reset_password: 비밀번호 바꾸기
//  - set_active:     계정 정지 / 다시 사용
// 계정을 만들고 비밀번호를 바꾸려면 관리자 키가 필요하므로, 이 기능은 브라우저가 아닌 서버(Edge Function)에서만 실행됨.
import { createClient } from 'npm:@supabase/supabase-js@2'

/** 학생 아이디 → 로그인용 내부 이메일. 프론트엔드(src/lib/auth.ts)와 같은 규칙 */
// .invalid 는 인터넷에 실제로 존재할 수 없는 주소(RFC 2606) → 비밀번호 재설정 메일 등이 외부로 새어 나갈 수 없음
const STUDENT_EMAIL_DOMAIN = 'students.baduk.invalid'
const LOGIN_ID_RE = /^[a-z0-9][a-z0-9_.-]{2,19}$/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * 관리자 키: 새 방식의 비밀 키(SUPABASE_SECRET_KEYS)를 먼저 쓰고, 없으면 옛 방식(service_role) 사용.
 * 옛 방식 키는 2026년 말에 사용이 끝남. 두 키 모두 Supabase가 서버에 자동으로 넣어 주며 코드에는 적지 않음.
 */
function adminKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    if (keys.default) return keys.default
  } catch {
    // 형식이 다르면 옛 키로
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: '허용되지 않는 요청입니다.' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, adminKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 호출한 사람이 선생님인지 확인
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return reply(401, { error: '로그인이 필요합니다.' })
  const { data: me } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .single()
  if (!me || me.role !== 'teacher' || !me.is_active) return reply(403, { error: '선생님만 사용할 수 있습니다.' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: '요청 내용을 읽을 수 없습니다.' })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  const checkPassword = () =>
    password.length < 6 ? '비밀번호는 6자 이상이어야 합니다.' : password.length > 72 ? '비밀번호가 너무 깁니다.' : null

  // 대상이 학생 계정인지 확인 (선생님 계정은 이 기능으로 건드리지 않음)
  async function studentTarget(): Promise<string | Response> {
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
    if (!data) return reply(404, { error: '학생을 찾을 수 없습니다.' })
    if (data.role !== 'student') return reply(400, { error: '학생 계정만 바꿀 수 있습니다.' })
    return userId
  }

  switch (body.action) {
    case 'create': {
      const loginId = String(body.loginId ?? '').trim().toLowerCase()
      const displayName = String(body.displayName ?? '').trim()
      if (!LOGIN_ID_RE.test(loginId))
        return reply(400, { error: '아이디는 영문 소문자·숫자로 3~20자여야 합니다. (_ . - 사용 가능)' })
      if (!displayName || displayName.length > 40) return reply(400, { error: '이름을 1~40자로 입력해 주세요.' })
      const pwError = checkPassword()
      if (pwError) return reply(400, { error: pwError })

      const { data: dup } = await admin.from('profiles').select('id').eq('login_id', loginId).maybeSingle()
      if (dup) return reply(409, { error: '이미 쓰고 있는 아이디입니다.' })

      const { data, error } = await admin.auth.admin.createUser({
        email: `${loginId}@${STUDENT_EMAIL_DOMAIN}`,
        password,
        email_confirm: true,
        app_metadata: { role: 'student' },
        user_metadata: { display_name: displayName, login_id: loginId },
      })
      if (error) {
        const exists = /already|registered|exists/i.test(error.message)
        return reply(exists ? 409 : 400, { error: exists ? '이미 쓰고 있는 아이디입니다.' : `계정을 만들지 못했습니다: ${error.message}` })
      }
      return reply(200, { userId: data.user.id })
    }

    case 'reset_password': {
      const target = await studentTarget()
      if (target instanceof Response) return target
      const pwError = checkPassword()
      if (pwError) return reply(400, { error: pwError })
      const { error } = await admin.auth.admin.updateUserById(target, { password })
      if (error) return reply(400, { error: `비밀번호를 바꾸지 못했습니다: ${error.message}` })
      return reply(200, { ok: true })
    }

    case 'set_active': {
      const target = await studentTarget()
      if (target instanceof Response) return target
      const active = body.active === true
      // 정지: 로그인을 막고(ban), 이미 로그인한 화면에서도 RLS가 is_active 를 확인해 아무것도 못 보게 함
      const { error } = await admin.auth.admin.updateUserById(target, { ban_duration: active ? 'none' : '876000h' })
      if (error) return reply(400, { error: `상태를 바꾸지 못했습니다: ${error.message}` })
      const { error: pErr } = await admin.from('profiles').update({ is_active: active }).eq('id', target)
      if (pErr) return reply(400, { error: `상태를 바꾸지 못했습니다: ${pErr.message}` })
      return reply(200, { ok: true })
    }

    default:
      return reply(400, { error: '알 수 없는 요청입니다.' })
  }
})
