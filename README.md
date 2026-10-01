# 바둑 수업

바둑 과외 수업용 웹 프로그램입니다. 실시간 수업판, 과제, 자료실, 기보 제출함, 성장 기록을 한곳에서 씁니다.

- **PC에서 켜는 방법**: [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md)
- **서버(Supabase) 설정**: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
- **인터넷 주소**: https://baduk-lesson.onrender.com ([docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md))
- **설계 문서**: [docs/DESIGN.md](docs/DESIGN.md)

## 진행 상황
| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 바둑판 컴포넌트 (규칙, 표시 도구, 변화도, 코멘트, SGF 입출력) | 완료 |
| 2 | Supabase 연동 (로그인, 권한, DB) | 완료 |
| 3 | 실시간 수업방 | 완료 |
| 4 | 과제 출제·자동 채점·학생별 피드백 | 완료 |
| 5 | 자료실, 기보 제출함 | 완료 |
| 6 | 성장 기록 | 완료 |

## 개발자용 명령
```bash
npm install      # 처음 한 번
npm run dev      # 개발 서버 (http://localhost:5173)
npm test         # 바둑 규칙·SGF 단위 테스트
npm run build    # 배포용 빌드 (dist/)
```

## 폴더
- `src/go/` 바둑 엔진: 규칙(따냄·자충·패), SGF 읽기/쓰기, 수순 트리. 화면과 분리되어 단위 테스트됨
- `src/components/` 재사용 컴포넌트: 바둑판, 수순 트리, 코멘트 패널, 이를 묶은 `BoardWorkspace`
- `src/features/` 화면별 기능 (1단계는 `practice` 연습판)
- `src/features/auth`, `src/features/students` 로그인, 학생 관리
- `src/features/lesson` 실시간 수업방·수업 기록 (`sync.ts` = 동기화 규칙, 다중 접속 단위 테스트 포함)
- `src/features/assignments` 문제 출제·과제 묶음·풀이(자동 채점)·현황표·피드백 (채점 규칙은 `src/go/problem/grader.ts`)
- `src/features/library`, `src/features/submissions` 자료실(해설 기보·PDF·이미지), 기보 제출함
- `src/features/growth` 성장 기록 (계산은 `stats.ts`, 그래프는 `src/components/charts`)
- `src/data/` Supabase 읽기·쓰기 (판, 코멘트, 수업, 과제, 자료, 제출 기보, 급수·상담 메모)
- `supabase/migrations/` DB 테이블·권한(RLS) SQL (적용 순서대로 번호)
- `supabase/functions/manage-students/` 학생 계정 생성·비밀번호 변경·정지 (관리자 키는 서버 안에서만 사용)
- `windows/` Windows용 실행 파일
