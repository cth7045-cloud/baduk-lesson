/**
 * 학생 아이디 → 로그인용 내부 이메일.
 * Supabase 로그인은 이메일이 필요해서, 학생 아이디를 실제로는 존재하지 않는 주소로 바꿔 씀.
 * supabase/functions/manage-students/index.ts 와 같은 규칙이어야 함.
 */
export const STUDENT_EMAIL_DOMAIN = 'students.baduk.invalid'

export const LOGIN_ID_RE = /^[a-z0-9][a-z0-9_.-]{2,19}$/

export function loginToEmail(idOrEmail: string): string {
  const v = idOrEmail.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${STUDENT_EMAIL_DOMAIN}`
}

/** 로그인 오류를 쉬운 한국어로 */
export function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return '아이디 또는 비밀번호가 맞지 않습니다.'
  if (/banned|user is banned/i.test(message)) return '사용이 정지된 계정입니다. 선생님께 문의하세요.'
  if (/email not confirmed/i.test(message)) return '아직 사용할 수 없는 계정입니다. 선생님께 문의하세요.'
  if (/network|fetch/i.test(message)) return '인터넷 연결을 확인해 주세요.'
  if (/rate limit|too many/i.test(message)) return '시도가 너무 많습니다. 잠시 후 다시 해 주세요.'
  return `로그인하지 못했습니다. (${message})`
}
