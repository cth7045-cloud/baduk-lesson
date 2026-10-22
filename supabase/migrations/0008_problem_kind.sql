-- =====================================================================
-- 과제 종류 추가: 사활·수읽기 문제(solve) / 모양 외우기(memorize)
--  - 모양 외우기: 본선 수순(정석 등)을 순서대로, 수순이 없으면 배치(모양)를 그대로 다시 놓는 과제
--  - 기존 문제는 모두 'solve' 로 그대로 유지됨
--  - 문제 만들기 함수(create_problem)는 그대로 두고, 외우기 과제는 만든 뒤 kind 만 바꿈 (선생님 수정 권한)
-- =====================================================================
alter table public.problems
  add column if not exists kind text not null default 'solve' check (kind in ('solve', 'memorize'));
comment on column public.problems.kind is 'solve = 사활·수읽기 문제, memorize = 모양(수순) 외우기';
