# 서버(Supabase) 설정 — 선생님이 직접 하실 일

프로젝트 만들기, DB 테이블, 권한 규칙, 학생 계정 기능은 이미 다 해 두었습니다.
선생님은 아래 **세 가지만** 하시면 됩니다. (10분 정도)

| 항목 | 값 |
|---|---|
| 프로젝트 이름 | `baduk-lesson` (서울 지역) |
| 서버 주소 | `https://lmrqkstgdhxvwgypvktd.supabase.co` |
| 공개 키 | `sb_publishable_rvfW1m6KdNUVhqm5mRLS6Q_FHRts3eN` |

> 공개 키는 원래 브라우저에 공개되는 키라서 이 문서에 적어도 안전합니다. 실제 데이터 보호는 DB 권한 규칙(RLS)이 합니다.
> 학생 계정을 만들 때 쓰는 **관리자 키는 어디에도 적혀 있지 않고**, Supabase 서버 안에서만 쓰입니다.

---

## 1. 아무나 가입하지 못하게 막기

1. 브라우저에서 아래 주소를 엽니다. (Supabase에 로그인되어 있어야 합니다)

   https://supabase.com/dashboard/project/lmrqkstgdhxvwgypvktd/auth/providers

2. 화면 위쪽 **"User Signups"** 칸에서 **"Allow new users to sign up"** 스위치를 눌러 **끕니다** (회색이 되게).
3. 그 칸 아래쪽의 **"Save changes"** 버튼을 누릅니다.

이제 학생 계정은 선생님이 프로그램 안에서 만들어 줄 때만 생깁니다.

---

## 2. 선생님 계정 만들기

> **맨 처음 만든 계정이 자동으로 "선생님"이 됩니다.** 그러니 이 단계를 학생 계정보다 먼저 해 주세요.

1. 아래 주소를 엽니다.

   https://supabase.com/dashboard/project/lmrqkstgdhxvwgypvktd/auth/users

2. 오른쪽 위 초록색 **"Add user"** 버튼 → **"Create new user"** 를 누릅니다.
3. 입력 칸을 채웁니다.
   - **Email**: 선생님이 로그인할 때 쓸 이메일 (예: 평소 쓰는 이메일)
   - **Password**: 로그인 비밀번호 (6자 이상, 잊지 않게 따로 적어 두세요)
   - **Auto Confirm User?** 체크 상자는 **체크된 상태로** 둡니다.
4. **"Create user"** 를 누릅니다.
5. 다 했으면 Claude에게 "선생님 계정 만들었어"라고 알려 주세요. 선생님 권한이 제대로 들어갔는지 확인해 드립니다.

---

## 3. 선생님 PC에 서버 주소 넣기 (한 번만)

1. 새 버전 프로그램을 내려받아 압축을 풉니다. (방법은 [WINDOWS_SETUP.md](WINDOWS_SETUP.md)의 2번과 같습니다)
2. `windows` 폴더의 **`서버-연결-설정.bat`** 을 더블클릭합니다.
   - 처음 실행하면 **"바둑 수업 시작"** 아이콘을 눌러도 이 창이 자동으로 뜹니다.
3. 검은 창에 차례로 붙여넣습니다. (붙여넣기 = **마우스 오른쪽 버튼 클릭**)
   - 1) 서버 주소: 위 표의 `https://lmrqkstgdhxvwgypvktd.supabase.co` → Enter
   - 2) 공개 키: 위 표의 `sb_publishable_...` → Enter
4. "저장했습니다"가 나오면 아무 키나 눌러 닫습니다.

한 번 넣어 두면 PC에 저장되어, 나중에 새 버전을 내려받아도 다시 넣을 필요가 없습니다.

---

## 그다음
1. 바탕화면 **"바둑 수업 시작"** 을 더블클릭 → 2번에서 만든 이메일·비밀번호로 로그인
2. 위쪽 **"학생 관리"** → **"학생 추가"** 로 학생 계정 만들기 (이름, 아이디, 비밀번호)
3. 학생에게 아이디·비밀번호를 알려 주면, 학생은 아이디로 로그인합니다.

## 참고: 무료 플랜 주의 사항
- **7일 동안 아무도 접속하지 않으면** Supabase가 프로젝트를 잠재웁니다. 그때는 https://supabase.com/dashboard 에서 `baduk-lesson` 을 누르고 **"Restore project"** 를 누르면 몇 분 뒤 다시 켜집니다. (데이터는 그대로)
- 원래 있던 `handwritten-note` 프로젝트는 무료 플랜 개수 제한(2개) 때문에 **일시정지**해 두었습니다. 다시 쓰려면 같은 방법으로 Restore 하면 되는데, 그러려면 다른 프로젝트 하나를 먼저 정지해야 합니다.
