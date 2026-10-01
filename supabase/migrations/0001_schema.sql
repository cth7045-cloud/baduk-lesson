-- =====================================================================
-- 바둑 수업: 테이블 구조
-- 설계: docs/DESIGN.md 4장
-- 권한(RLS)은 0002_rls.sql 에서 설정
-- =====================================================================

-- ---------- 공통: 수정 시각 자동 기록 ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- 종류(열거형) ----------
create type public.user_role as enum ('teacher', 'student');
create type public.board_kind as enum ('lesson', 'problem', 'material', 'submission', 'attempt', 'practice');
create type public.lesson_status as enum ('live', 'ended');
create type public.control_mode as enum ('teacher', 'everyone');
create type public.material_type as enum ('sgf', 'pdf', 'image');
create type public.visibility as enum ('all', 'selected');
create type public.submission_status as enum ('submitted', 'reviewed');

-- =====================================================================
-- 4-1. 사용자
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  display_name text not null default '' check (char_length(display_name) <= 40),
  login_id text unique,
  current_rank text check (char_length(current_rank) <= 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is '선생님 1명 + 학생들. 계정(auth.users)이 만들어질 때 자동 생성';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- 계정이 만들어지면 프로필 자동 생성.
-- 역할: 맨 처음 만들어지는 계정(선생님이 Supabase 대시보드에서 직접 만듦) = 선생님,
--       그 뒤로는 학생 관리 기능(Edge Function)이 정한 역할(app_metadata.role, 관리자 키로만 설정 가능)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.user_role;
begin
  if not exists (select 1 from public.profiles where role = 'teacher') then
    r := 'teacher';
  elsif new.raw_app_meta_data ->> 'role' = 'teacher' then
    r := 'teacher';
  else
    r := 'student';
  end if;

  insert into public.profiles (id, role, display_name, login_id)
  values (
    new.id,
    r,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'login_id'
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 4-2. 바둑판·코멘트 (모든 기능의 공통 기반)
-- =====================================================================
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  kind public.board_kind not null,
  title text not null default '' check (char_length(title) <= 120),
  size smallint not null default 19 check (size between 2 and 25),
  -- 노드 ID(XID)가 들어 있는 내부 저장용 SGF. 코멘트는 board_comments 에 따로 저장
  sgf text not null check (char_length(sgf) <= 2000000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.boards is '모든 바둑 데이터(수업판, 문제, 자료, 제출 기보, 풀이 기록)를 SGF로 저장';
create index boards_created_by_idx on public.boards (created_by);

create trigger boards_updated_at before update on public.boards
  for each row execute function public.set_updated_at();

create table public.board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  -- NULL = 판 전체 메모
  node_id text check (char_length(node_id) <= 40),
  body text not null check (char_length(body) between 1 and 5000),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 한 수(또는 판 전체)에 코멘트 하나
  constraint board_comments_one_per_node unique nulls not distinct (board_id, node_id)
);
comment on table public.board_comments is '수 코멘트·변화도 코멘트·판 전체 메모. 선생님만 쓰기 가능(RLS)';

create trigger board_comments_updated_at before update on public.board_comments
  for each row execute function public.set_updated_at();

create table public.board_source_notes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  node_id text check (char_length(node_id) <= 40),
  body text not null check (char_length(body) <= 5000),
  constraint board_source_notes_one_per_node unique nulls not distinct (board_id, node_id)
);
comment on table public.board_source_notes is '학생이 올린 SGF 안에 원래 있던 메모 (읽기 전용 보존)';

create table public.board_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  board_id uuid not null references public.boards (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, board_id)
);
comment on table public.board_reads is '"새 코멘트 있음" 표시용: 마지막으로 판을 연 시각';
create index board_reads_board_idx on public.board_reads (board_id);

-- =====================================================================
-- 4-3. 수업
-- =====================================================================
create table public.lesson_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (char_length(title) <= 120),
  board_id uuid not null unique references public.boards (id) on delete restrict,
  status public.lesson_status not null default 'live',
  control_mode public.control_mode not null default 'teacher',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
comment on table public.lesson_rooms is '수업방 = 수업 기록 (종료 후 날짜별 목록)';

create trigger lesson_rooms_updated_at before update on public.lesson_rooms
  for each row execute function public.set_updated_at();

create table public.lesson_participants (
  lesson_id uuid not null references public.lesson_rooms (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (lesson_id, student_id)
);
create index lesson_participants_student_idx on public.lesson_participants (student_id);

-- =====================================================================
-- 4-4. 과제
-- =====================================================================
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 30),
  sort_order integer not null default 0
);
comment on table public.tags is '주제 태그 (자료실·문제 공용)';

insert into public.tags (name, sort_order) values
  ('포석', 10), ('정석', 20), ('중반', 30), ('사활', 40), ('끝내기', 50), ('실전해설', 60);

create table public.problems (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null unique references public.boards (id) on delete restrict,
  title text not null default '' check (char_length(title) <= 120),
  to_play char(1) not null default 'B' check (to_play in ('B', 'W')),
  difficulty smallint check (difficulty between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger problems_updated_at before update on public.problems
  for each row execute function public.set_updated_at();

create table public.problem_tags (
  problem_id uuid not null references public.problems (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (problem_id, tag_id)
);
create index problem_tags_tag_idx on public.problem_tags (tag_id);

create table public.assignment_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger assignment_sets_updated_at before update on public.assignment_sets
  for each row execute function public.set_updated_at();

create table public.assignment_set_problems (
  set_id uuid not null references public.assignment_sets (id) on delete cascade,
  problem_id uuid not null references public.problems (id) on delete cascade,
  position integer not null default 0,
  primary key (set_id, problem_id)
);
create index assignment_set_problems_problem_idx on public.assignment_set_problems (problem_id);

create table public.assignment_targets (
  set_id uuid not null references public.assignment_sets (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (set_id, student_id)
);
create index assignment_targets_student_idx on public.assignment_targets (student_id);

create table public.problem_attempts (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.assignment_sets (id) on delete cascade,
  problem_id uuid not null references public.problems (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  -- 학생 풀이 기록 (시도마다 분기로 쌓임). 선생님 피드백은 이 판의 코멘트로
  board_id uuid unique references public.boards (id) on delete set null,
  tries integer not null default 0 check (tries >= 0),
  solved boolean not null default false,
  first_try_correct boolean,
  solved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, problem_id, student_id)
);
create index problem_attempts_student_idx on public.problem_attempts (student_id);
create index problem_attempts_problem_idx on public.problem_attempts (problem_id);

create trigger problem_attempts_updated_at before update on public.problem_attempts
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 4-5. 자료실·기보 제출함
-- =====================================================================
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  type public.material_type not null,
  board_id uuid unique references public.boards (id) on delete restrict,
  storage_path text,
  visibility public.visibility not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- SGF 자료는 바둑판, PDF·이미지는 파일
  constraint materials_content check (
    (type = 'sgf' and board_id is not null) or (type <> 'sgf' and storage_path is not null)
  )
);

create trigger materials_updated_at before update on public.materials
  for each row execute function public.set_updated_at();

create table public.material_tags (
  material_id uuid not null references public.materials (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (material_id, tag_id)
);
create index material_tags_tag_idx on public.material_tags (tag_id);

create table public.material_targets (
  material_id uuid not null references public.materials (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (material_id, student_id)
);
create index material_targets_student_idx on public.material_targets (student_id);

create table public.game_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  board_id uuid not null unique references public.boards (id) on delete restrict,
  title text not null default '' check (char_length(title) <= 120),
  student_note text not null default '' check (char_length(student_note) <= 2000),
  played_on date,
  status public.submission_status not null default 'submitted',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index game_submissions_student_idx on public.game_submissions (student_id);

create trigger game_submissions_updated_at before update on public.game_submissions
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 4-6. 성장 기록
-- =====================================================================
create table public.rank_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  rank text not null check (char_length(rank) between 1 and 20),
  recorded_on date not null default current_date,
  note text not null default '' check (char_length(note) <= 500)
);
create index rank_history_student_idx on public.rank_history (student_id, recorded_on);

create table public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.student_notes is '지도 방향·상담 메모. 학생에게는 보이지 않음';
create index student_notes_student_idx on public.student_notes (student_id);

create trigger student_notes_updated_at before update on public.student_notes
  for each row execute function public.set_updated_at();
