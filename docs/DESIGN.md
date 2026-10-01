# 바둑 과외 수업 웹 프로그램 — 설계안 (검토용 초안)

> 상태: **확인 완료 (2026-10-01)**. 결정 사항: 설계안대로 진행 / 코멘트는 별도 테이블 / 학생은 아이디+비밀번호 로그인 / 과제는 브라우저 채점 / Supabase 설정은 Claude가 커넥터로 진행(선생님 승인 후).

---

## 1. 기술 스택과 제안

| 영역 | 선택 | 비고 |
|---|---|---|
| 프론트엔드 | React 18 + Vite + TypeScript | 요청대로 |
| 라우팅 | React Router | Render 정적 호스팅에서 새로고침 404가 나지 않도록 `render.yaml`에 SPA 리라이트(`/* → /index.html`) 포함 |
| 바둑판 렌더링 | SVG (직접 구현) | 화면 크기에 맞춰 선명하게 확대·축소, 터치 좌표 계산이 정확함. 19줄 361점은 SVG로 충분히 빠름 |
| 규칙·SGF·수순 트리 | 순수 TypeScript로 직접 구현 + Vitest 단위 테스트 | React와 분리해서 모든 화면이 같은 엔진을 씀 |
| 스타일 | CSS Modules + CSS 변수 | UI 키트를 쓰지 않음 → 흔한 "AI 사이트" 느낌 방지 |
| 백엔드 | Supabase (Auth, Postgres+RLS, Storage, Realtime, Edge Function 1개) | 요청대로 |
| 그래프(6단계) | Recharts | 가볍고 단순 |
| PDF 보기(5단계) | pdf.js | 갤럭시 폰/태블릿의 Chrome·삼성 인터넷은 PDF를 페이지 안에서 바로 못 보여주고 다운로드해버림 → 앱 안 뷰어 필요 |
| 배포 | Render Static Site | 요청대로. 빌드 결과물만 올리면 되는 구조 |

### 제안·주의 사항
1. **Render + Supabase 조합은 그대로 좋습니다.** 서버 코드가 필요 없는 구조(정적 사이트 + Supabase)라 Render 무료 정적 호스팅으로 충분합니다.
2. **Supabase 무료 플랜은 7일간 접속이 없으면 프로젝트가 일시정지됩니다.** 방학 등으로 1주 이상 쉬면 대시보드에서 "Restore"를 한 번 눌러야 합니다. (데이터는 유지됨) 안내 문서에 포함하겠습니다.
3. **코멘트는 SGF 본문이 아니라 별도 테이블에 저장하고, 내보낼 때 SGF의 `C`/`GC` 속성으로 합쳐 넣는 방식을 제안합니다.** (이유는 3장)
4. **학생 로그인은 "아이디 + 비밀번호" 방식을 제안합니다.** 선생님이 앱 안에서 학생 계정을 만들고 비밀번호를 알려주면 끝. 학생이 이메일을 확인할 필요가 없습니다. Supabase는 이메일이 필수라 내부적으로 `아이디@students.local` 형태의 가짜 이메일을 씁니다. 계정 생성에는 관리자 키가 필요하므로 이 키는 프론트엔드가 아닌 **Supabase Edge Function 안에만** 둡니다. 공개 회원가입은 Supabase 설정에서 끕니다.
5. **모바일 착수 방식:** 폰에서 19줄은 교차점 간격이 약 18px라 오착수가 잦습니다. "탭 → 반투명 미리보기 돌 → 같은 자리 한 번 더 탭하면 확정" 방식을 터치 기기에서 기본으로 켜고, 설정에서 끌 수 있게 하겠습니다.
6. **한국 기보 파일 인코딩:** 타이젬·오로 등에서 받은 SGF는 EUC-KR인 경우가 많아 그대로 읽으면 한글이 깨집니다. 불러오기 시 UTF-8/EUC-KR을 자동 판별합니다.
7. **바탕화면 실행 파일:** 이 작업은 클라우드에서 진행되어 선생님 PC 바탕화면에 직접 파일을 놓을 수는 없습니다. 대신 저장소에 `windows/바둑수업-시작.bat`(더블클릭 → 개발 서버 + 브라우저 자동 실행)과 `windows/바탕화면-바로가기-만들기.bat`(한 번 실행하면 바탕화면에 바로가기 생성)을 넣겠습니다.

---

## 2. 폴더 구조

```
baduk-lesson/
├─ .env.example                  # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (실제 값은 .env, git 제외)
├─ index.html
├─ package.json / vite.config.ts / tsconfig.json
├─ render.yaml                   # Render 정적 사이트 배포 설정
├─ windows/
│  ├─ 바둑수업-시작.bat
│  └─ 바탕화면-바로가기-만들기.bat
├─ docs/
│  ├─ DESIGN.md                  # 이 문서
│  ├─ SUPABASE_SETUP.md          # (2단계) 처음 하는 사람 기준 단계별 안내
│  └─ DEPLOY_RENDER.md           # 배포 안내
├─ supabase/
│  ├─ migrations/                # DB 스키마·RLS를 SQL 파일로 관리 (대시보드 SQL 편집기에 붙여넣기만 해도 됨)
│  │  ├─ 0001_schema.sql
│  │  ├─ 0002_rls.sql
│  │  └─ 0003_storage.sql
│  └─ functions/
│     └─ manage-students/        # 학생 계정 생성·비밀번호 재설정·비활성화 (관리자 키는 여기만)
└─ src/
   ├─ main.tsx / App.tsx / routes.tsx
   ├─ go/                        # ★ 바둑 엔진 (React 무관, 순수 TS, 단위 테스트)
   │  ├─ sgf/                    #   parse, stringify, 인코딩 판별, 좌표 변환
   │  ├─ tree/                   #   수순 트리(노드 ID, 분기, 이동), 편집 연산(실시간 동기화 단위)
   │  ├─ rules/                  #   따냄, 자충수 금지, 패 금지
   │  ├─ problem/                #   (4단계) 사활 문제 자동 채점
   │  └─ __tests__/
   ├─ components/
   │  ├─ board/                  # ★ GoBoard(SVG), 돌·표시 레이어, 터치 입력, 도구 막대, 이동 버튼
   │  ├─ tree/                   # ★ MoveTree (수순 트리, 코멘트 달린 수 표시)
   │  ├─ comments/               # ★ CommentPanel / CommentEditor / CommentText(굵게·좌표 링크)
   │  ├─ workspace/              # ★ BoardWorkspace = 판 + 트리 + 코멘트 패널 조합, 반응형 배치
   │  └─ ui/                     #   버튼, 대화상자, 탭 등 공용 소품
   ├─ data/                      # 저장소 인터페이스: 1단계는 브라우저 저장, 2단계부터 Supabase 구현
   ├─ features/
   │  ├─ practice/               # 1단계: 혼자 테스트하는 연습판 페이지
   │  ├─ auth/                   # 2단계
   │  ├─ students/               # 2·6단계: 학생 관리, 성장 기록
   │  ├─ lesson/                 # 3단계: 실시간 수업방, 수업 기록
   │  ├─ assignments/            # 4단계: 문제 출제, 과제 묶음, 풀이, 채점 현황
   │  ├─ library/                # 5단계: 자료실
   │  └─ submissions/            # 5단계: 기보 제출함
   ├─ lib/                       # supabase 클라이언트, 환경변수 검사
   └─ styles/                    # 색·글꼴 토큰, 나무결 판 텍스처
```

**재사용 원칙:** 수업방·과제·자료실·제출함 화면은 모두 `BoardWorkspace` 하나를 쓰고, 화면마다 다른 점(누가 착수 가능한지, 코멘트 편집 권한, 저장 위치)만 props와 저장소 객체로 넘깁니다.

```tsx
<BoardWorkspace
  board={board}                 // SGF 기반 수순 트리
  comments={commentStore}       // 로컬 / Supabase / 실시간 구현 중 하나
  canEditComments={isTeacher}
  canPlay={...}
  mode="lesson" | "problem" | "review" | "library"
/>
```

---

## 3. 핵심 설계 결정

### 3-1. 코멘트를 별도 테이블에 두는 이유
- 학생이 수업판에 착수하거나 기보를 올릴 때 SGF 텍스트를 쓰게 됩니다. 코멘트가 SGF 텍스트 안에 있으면, DB는 "착수만 바꿨는지, 코멘트도 바꿨는지" 구분할 수 없어 **RLS로 학생의 코멘트 수정·삭제를 막을 수 없습니다.**
- 코멘트를 `board_comments` 테이블에 두면 "선생님만 쓰기 가능" 규칙을 DB가 확실히 강제합니다. 수정 시각도 코멘트마다 기록됩니다.
- **SGF 호환성은 유지:** 내보내기·다운로드 시 수 코멘트는 각 노드의 `C[...]`, 판 전체 메모는 루트의 `GC[...]`(SGF 표준 "대국 설명" 속성)에 자동으로 합쳐 넣습니다. 다른 바둑 프로그램에서도 그대로 보입니다.
- **불러오기:** 선생님이 올린 SGF의 기존 `C`는 코멘트 테이블로 옮겨 바로 편집 가능. 학생이 올린 SGF의 기존 `C`(학생 본인 메모)는 "원본 메모"로 보존하고 선생님 코멘트와 구분해 표시합니다.

### 3-2. 노드 ID
- 코멘트와 실시간 편집이 "어느 수"를 가리키는지 안정적으로 알아야 하므로, 내부 저장 SGF의 각 노드에 짧은 고유 ID를 비표준 속성으로 붙입니다. (SGF 규격상 다른 프로그램은 모르는 속성을 무시함)
- 외부로 내보낼 때는 이 ID를 제거한 깨끗한 SGF를 만듭니다.

### 3-3. 실시간 수업방 동기화
- **착수·표시·분기·이동:** Supabase Realtime *Broadcast*로 "편집 연산"(예: `노드 X 아래에 흑 D4 추가`)을 보냅니다. 판 전체를 매번 보내지 않아 빠르고, 노드 ID 기반이라 두 사람이 동시에 둬도 꼬이지 않습니다.
- **현재 보고 있는 수 따라가기:** 학생 화면은 기본적으로 선생님이 보는 수를 따라가고, 학생이 직접 수순을 넘겨보면 "선생님 화면으로 돌아가기" 버튼이 뜹니다.
- **코멘트:** DB에 저장(RLS 검사) → Realtime *Postgres Changes*로 학생 화면에 즉시 반영. 학생이 위조된 코멘트를 뿌릴 수 없습니다.
- **저장:** 선생님 화면이 몇 초마다, 그리고 수업 종료 시 판 상태(SGF)를 DB에 저장. 늦게 들어오거나 재접속한 학생은 저장본 + 이후 연산으로 따라잡습니다.
- **권한 전환:** "선생님만 조작"일 때 학생 화면의 착수 입력이 잠기고, 들어오는 학생 연산도 무시합니다.

### 3-4. 사활 문제 형식
- 문제 = 하나의 SGF 트리. 초기 배치(`AB`/`AW`) + 정답 분기들 + 오답 분기들(상대 응수 포함).
- 오답 수에는 SGF 표준 "나쁜 수" 표시(`BM`), 정답 끝 수에는 "좋은 수" 표시(`TE`)를 붙여 다른 프로그램에서도 의미가 보이게 합니다.
- 학생 수가 트리에 있으면 그 노드의 첫 자식(상대 응수)을 자동으로 두고, 트리에 없는 수는 "예상 밖의 수(오답)"로 처리합니다.
- 문제 설명 = 판 전체 메모, 각 수 해설 / 오답 이유 = 해당 노드 코멘트 → 코멘트 컴포넌트 그대로 재사용.
- 채점은 브라우저에서 합니다. 기술에 밝은 학생이 개발자 도구로 정답을 볼 가능성은 있지만, 과외 규모에서는 이 방식이 단순하고 반응이 빠릅니다. (원하시면 서버 채점으로 바꿀 수 있음)

### 3-5. "새 코멘트 있음" 표시
- 학생이 어떤 판을 마지막으로 연 시각(`board_reads`)과 그 판 코멘트의 최신 수정 시각을 비교합니다. 기보 제출함, 과제 피드백, 수업 기록, 자료실에 공통으로 씁니다.

---

## 4. DB 테이블 설계

### 4-1. 사용자
| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `profiles` | `id`(= auth 사용자), `role`('teacher'/'student'), `display_name`, `login_id`, `current_rank`, `is_active`, `created_at` | 선생님 1명 + 학생들 |

### 4-2. 바둑판·코멘트 (모든 기능의 공통 기반)
| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `boards` | `id`, `kind`('lesson'/'problem'/'material'/'submission'/'attempt'/'practice'), `title`, `size`(9/13/19), `sgf`(text, 노드 ID 포함, 코멘트 제외), `created_by`, `created_at`, `updated_at` | 모든 바둑 데이터는 여기 SGF로 저장 |
| `board_comments` | `id`, `board_id`, `node_id`(NULL이면 판 전체 메모), `body`, `author_id`, `created_at`, `updated_at` | 수 코멘트 / 변화도 코멘트 / 판 전체 메모. `(board_id, node_id)` 당 1개 |
| `board_source_notes` | `board_id`, `node_id`, `body` | 학생이 올린 SGF 안에 원래 있던 메모 (읽기 전용 보존) |
| `board_reads` | `user_id`, `board_id`, `last_seen_at` | "새 코멘트 있음" 판단용 |

### 4-3. 수업
| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `lesson_rooms` | `id`, `title`, `board_id`, `status`('live'/'ended'), `control_mode`('teacher'/'everyone'), `started_at`, `ended_at` | 수업방 = 수업 기록 (종료 후 날짜별 목록) |
| `lesson_participants` | `lesson_id`, `student_id` | 입장 허용 학생 + 수업 횟수 집계 + 복습 권한 |

### 4-4. 과제
| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `tags` | `id`, `name`, `sort_order` | 포석·정석·중반·사활·끝내기·실전해설 … (선생님 추가 가능, 자료실과 문제 공용) |
| `problems` | `id`, `board_id`, `title`, `to_play`('B'/'W'), `difficulty`, `created_at` | 사활/수읽기 문제 1개 |
| `problem_tags` | `problem_id`, `tag_id` | 주제별 약점 분석용 |
| `assignment_sets` | `id`, `title`, `description`, `due_at`, `created_at` | 과제 묶음 |
| `assignment_set_problems` | `set_id`, `problem_id`, `position` | 묶음에 들어간 문제와 순서 |
| `assignment_targets` | `set_id`, `student_id`, `assigned_at` | 묶음을 받은 학생 |
| `problem_attempts` | `id`, `set_id`, `problem_id`, `student_id`, `board_id`(학생 풀이 기록: 시도마다 분기로 쌓임), `tries`, `solved`, `first_try_correct`, `solved_at`, `updated_at` | 제출 여부·정답률·시도 횟수. 선생님 피드백은 이 `board_id`에 코멘트로 |

### 4-5. 자료실·기보 제출함
| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `materials` | `id`, `title`, `type`('sgf'/'pdf'/'image'), `board_id`(SGF일 때), `storage_path`(PDF·이미지일 때), `visibility`('all'/'selected'), `created_at`, `updated_at` | 자료 |
| `material_tags` | `material_id`, `tag_id` | |
| `material_targets` | `material_id`, `student_id` | 특정 학생 공개일 때 |
| `game_submissions` | `id`, `student_id`, `board_id`, `title`, `student_note`, `played_on`, `status`('submitted'/'reviewed'), `reviewed_at`, `created_at` | 학생 실전 기보 |

### 4-6. 성장 기록
| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `rank_history` | `id`, `student_id`, `rank`(예: '5급', '1단'), `recorded_on`, `note` | 급수 변화 (선생님 수동 기록) |
| `student_notes` | `id`, `student_id`, `body`, `created_at`, `updated_at` | 지도 방향·상담 메모 (**학생에게는 보이지 않음**) |

정답률 추이·주제별 약점·수업 횟수는 위 테이블에서 계산하는 **DB 뷰**로 만들고 따로 저장하지 않습니다.

### 4-7. Storage (파일)
| 버킷 | 공개 여부 | 내용 |
|---|---|---|
| `materials` | 비공개 | 자료실 PDF·이미지. 열람 권한은 `materials` 공개 설정과 같은 규칙으로 검사, 짧은 기한의 서명 URL로 표시 |

SGF는 몇 KB 수준의 텍스트라 Storage가 아닌 `boards.sgf` 컬럼에 둡니다. (검색·권한·실시간 처리가 단순해짐)

---

## 5. 권한(RLS) 요약

| 대상 | 선생님 | 학생 |
|---|---|---|
| `board_comments` | 읽기·쓰기·수정·삭제 | **읽기만** (자기가 볼 수 있는 판만). INSERT/UPDATE/DELETE 정책 없음 → DB가 거부 |
| `boards` | 전부 | 읽기: 자기가 참여한 수업, 배정된 문제, 공개된 자료, 자기 제출 기보·풀이 기록만. 쓰기: 자기 풀이 기록, 자기 제출 기보 최초 등록만 |
| 수업방 | 생성·종료·권한 전환 | 참여자로 등록된 방만 입장 |
| 과제·문제 | 전부 | 배정된 묶음과 그 문제만 읽기, 자기 `problem_attempts`만 쓰기 |
| 자료 | 전부 | 전체 공개 + 자기에게 공개된 것만 |
| `rank_history` | 전부 | 자기 것 읽기만 |
| `student_notes` | 전부 | **접근 불가** |
| `profiles` | 전부 | 자기 것 읽기만 (역할 변경 불가) |

"이 판을 볼 수 있는가"는 SQL 함수 `can_read_board(board_id)` 하나로 모아 모든 정책에서 재사용합니다.

---

## 6. 단계별 진행 계획

| 단계 | 결과물 | 확인 방법 |
|---|---|---|
| 1 | 바둑 엔진(규칙·SGF·트리) + 바둑판·표시 도구·변화도·코멘트 컴포넌트 + 연습판 페이지 | Supabase 없이 `바둑수업-시작.bat` 더블클릭 → 브라우저에서 혼자 착수·코멘트·SGF 입출력 테스트 (코멘트는 브라우저에 임시 저장) |
| 2 | Supabase 스키마·RLS·학생 계정 관리, 로그인 | 안내 문서대로 프로젝트 생성 → 선생님/학생 계정으로 각각 로그인, 학생이 코멘트 수정 시도 시 거부되는지 확인 |
| 3 | 실시간 수업방, 실시간 코멘트, 수업 기록 | PC + 폰으로 동시에 접속해 착수·코멘트 동기화 확인 |
| 4 | 문제 출제·자동 채점·과제 묶음·피드백·현황 | |
| 5 | 자료실, 기보 제출함 | |
| 6 | 성장 기록 페이지 | |

---

## 7. 2단계 구현 메모 (2026-10-01)

- Supabase 프로젝트: `baduk-lesson` (ref `lmrqkstgdhxvwgypvktd`, 서울 ap-northeast-2, 무료 플랜)
- 마이그레이션: `0001_schema`(테이블) → `0002_rls`(권한) → `0003_private_helpers`(권한 도우미 함수를 API에 노출되지 않는 `private` 스키마로 이동, Supabase 보안 점검 경고 0건)
- 첫 계정 = 선생님: `auth.users` 에 처음 생기는 계정의 프로필은 자동으로 `teacher`. 이후 계정은 Edge Function이 `app_metadata.role = student` 로 만듦 (관리자 키로만 설정 가능한 값)
- 학생 로그인 아이디 → 내부 이메일 `아이디@students.baduk.invalid` (`.invalid` 는 실제로 존재할 수 없는 주소라 재설정 메일 등이 외부로 나가지 않음)
- Edge Function 관리자 키: 새 방식 `SUPABASE_SECRET_KEYS.default` 우선, 없으면 옛 `SUPABASE_SERVICE_ROLE_KEY` (옛 키는 2026년 말 종료)
- 프론트엔드는 공개 키(`sb_publishable_…`)만 사용, `.env` 로 분리
- 계정 정지: Auth ban + `profiles.is_active = false` (이미 로그인한 화면도 RLS가 막음)

## 8. 3단계 구현 메모 (2026-10-01)

- 채널 `lesson:<수업 ID>` (비공개): 판 편집 연산(ops), 선생님 화면 위치(nav), 판 전체(snapshot, SGF), 종료(ended)를 broadcast로 주고받고 presence로 접속자 표시
- 동기화 규칙은 `src/features/lesson/sync.ts` 하나에 모음 (화면·Supabase와 분리, 선생님 1 + 학생 2 상황 단위 테스트)
  - 학생이 들어오거나 다시 연결되면 선생님 화면이 판 전체(snapshot)를 보냄
  - 학생 화면은 선생님이 보는 수를 따라가고, 학생이 직접 넘기면 멈춤 → "선생님 화면 따라가기" 버튼. 같은 수로 돌아오면 자동 재개
  - "학생도 착수 가능"일 때 학생 수를 두면, 같은 수를 보던 선생님 화면이 따라감
- 코멘트·수업 상태 변경은 DB 변경 알림(postgres_changes)으로 전달 → 코멘트는 RLS 검사를 거친 것만 학생에게 감
- 판 저장: 선생님 화면이 1.5초마다(변경 시) `boards.sgf` 에 저장, 수업 종료 시 즉시 저장 후 `status = ended`
- 수업 기록 = 종료된 수업. 선생님은 판·코멘트 계속 수정 가능, 학생은 읽기 전용 복습
- 마이그레이션 0005(채널 권한 정책)는 Supabase가 `realtime.messages` 표를 만든 뒤(실시간 기능 첫 접속 후) 적용해야 함

## 9. 4단계 구현 메모 (2026-10-01)

- 문제 = SGF 트리. 루트에 처음 배치(AB/AW)와 둘 차례(PL). 오답 수 = `BM`, 중간 정답 완료 = `TE`, 수순 끝 = 정답
- 채점(`src/go/problem/grader.ts`): 정답 수 → 상대 첫 자식 응수 자동 → … / BM 수 → 응징 수 자동 + 오답 이유 코멘트 / 트리에 없는 수 → 예상 밖의 수
- 학생 풀이판은 수순 트리·다음 수 힌트를 숨김. 풀이 기록은 모든 시도를 한 판의 변화도로 쌓아 저장 (틀린 수 BM, 맞힌 끝 TE)
- 기록: `problem_attempts` (시도 횟수, 정답 여부, 첫 시도 정답). 이미 맞힌 문제를 다시 풀어도 기록은 바뀌지 않음
- 선생님 현황표: 학생 × 문제 (✓/✕ + 시도 횟수, 제출, 정답률, 첫 시도 정답률). 칸 → 풀이 기록 판에 피드백 코멘트(수마다 + 총평)
- 학생 "새 피드백" = 마지막으로 연 시각(`board_reads`)보다 늦게 바뀐 코멘트가 있음
- 마이그레이션 0006: `create_problem` 함수
