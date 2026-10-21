# 인터넷 배포 (Render)

| 항목 | 값 |
|---|---|
| 접속 주소 | **https://baduk-lesson.onrender.com** |
| Render 서비스 | `baduk-lesson` (정적 사이트) — https://dashboard.render.com/static/srv-dav7rb7pn0mc73ajcnug |
| 배포하는 브랜치 | `claude/baduk-tutoring-web-u8zoia` (이 브랜치에 새 커밋이 올라가면 **자동으로 다시 배포**) |
| 빌드 | `npm ci && npm run build` → `dist` 폴더 공개 |
| 환경 변수 | `NODE_VERSION=22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (공개 키) |

## 알아 둘 점
- 학생에게는 위 주소만 알려 주면 됩니다. PC에 프로그램을 설치하거나 .env 를 넣을 필요가 없습니다.
- 수업방 링크(`/lessons/...`)를 디스코드에 붙여넣으면 학생이 바로 그 수업으로 들어옵니다. (주소로 바로 들어오거나 새로고침해도 열리도록 `404.html` 대체 페이지를 함께 만듦)
- 새 버전 올리기: 자동 배포가 켜져 있지만 GitHub 연결 알림이 오지 않아 실제로는 자동으로 올라가지 않았습니다. 지금은 Claude가 Render에서 직접 배포 버튼을 누릅니다(직접 하려면 Render 서비스 → **Manual Deploy → Deploy latest commit**).
- Supabase 무료 플랜은 7일 동안 사용이 없으면 잠듭니다(로그인 화면에 "서버에 연결하지 못했습니다"가 나옴).
  - 막는 장치: `.github/workflows/keep-alive.yml` 이 사흘마다 서버에 가벼운 요청을 보냅니다. GitHub는 기본 브랜치(`main`)에 있는 예약 작업만 실행하므로 이 파일이 `main`에 들어가야 동작합니다.
  - 잠들었을 때: https://supabase.com/dashboard 에서 `baduk-lesson` → **Restore project** (데이터는 그대로). 깨어난 뒤 수업 실시간 연결이 계속 실패하면 Project Settings → **Restart project**.

## (선택) 주소 바꾸기
Render 서비스 → **Settings** → **Custom Domains** 에서 가지고 있는 도메인(예: baduk.example.com)을 연결할 수 있습니다.
