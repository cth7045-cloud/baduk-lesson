# 바둑 수업

바둑 과외 수업용 웹 프로그램입니다. 실시간 수업판, 과제, 자료실, 기보 제출함, 성장 기록을 한곳에서 씁니다.

- **PC에서 켜는 방법**: [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md)
- **설계 문서**: [docs/DESIGN.md](docs/DESIGN.md)

## 진행 상황
| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 바둑판 컴포넌트 (규칙, 표시 도구, 변화도, 코멘트, SGF 입출력) | 완료 — 확인 대기 |
| 2 | Supabase 연동 (로그인, 권한, DB) | |
| 3 | 실시간 수업방 | |
| 4 | 과제 출제·자동 채점 | |
| 5 | 자료실, 기보 제출함 | |
| 6 | 성장 기록 | |

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
- `windows/` Windows용 실행 파일
