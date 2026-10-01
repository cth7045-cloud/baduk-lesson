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
- 코드를 고치면 몇 분 뒤 자동으로 새 버전이 올라갑니다. 진행 상황은 위 Render 서비스 주소의 **Events** 탭에서 볼 수 있습니다.
- Supabase 무료 플랜은 7일 동안 접속이 없으면 잠듭니다. 그때는 https://supabase.com/dashboard 에서 `baduk-lesson` → **Restore project** (데이터는 그대로).

## (선택) 주소 바꾸기
Render 서비스 → **Settings** → **Custom Domains** 에서 가지고 있는 도메인(예: baduk.example.com)을 연결할 수 있습니다.
