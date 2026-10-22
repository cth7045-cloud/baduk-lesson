-- =====================================================================
-- 바둑 수업: 권한(RLS)
-- 원칙
--  - 선생님: 모든 데이터 읽기·쓰기
--  - 학생: 자기에게 배정·공개된 것만 읽기, 자기 풀이 기록·제출 기보만 쓰기
--  - 코멘트(board_comments): 학생은 읽기만. 쓰기 정책 자체가 없으므로 DB가 거부함
--  - 로그인하지 않은 사용자(anon): 아무것도 못 봄 (정책을 authenticated 에만 부여)
-- =====================================================================

-- ---------- 도우미 함수 ----------
-- security definer: 함수 안에서는 RLS 없이 profiles 를 확인 (정책 안에서 다시 정책을 타는 무한 반복 방지)

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher' and is_active
  );
$$;

create or replace function public.is_active_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'student' and is_active
  );
$$;

-- 이 학생에게 과제 묶음이 배정되었는가
create or replace function public.is_assigned_set(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_student() and exists (
    select 1 from public.assignment_targets
    where set_id = p_set_id and student_id = auth.uid()
  );
$$;

-- 이 학생이 볼 수 있는 문제인가 (배정된 묶음에 들어 있음)
create or replace function public.can_read_problem(p_problem_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_teacher() or (
    public.is_active_student() and exists (
      select 1
      from public.assignment_set_problems sp
      join public.assignment_targets t on t.set_id = sp.set_id
      where sp.problem_id = p_problem_id and t.student_id = auth.uid()
    )
  );
$$;

-- 이 학생이 볼 수 있는 자료인가
create or replace function public.can_read_material(p_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_teacher() or (
    public.is_active_student() and exists (
      select 1 from public.materials m
      where m.id = p_material_id
        and (
          m.visibility = 'all'
          or exists (
            select 1 from public.material_targets mt
            where mt.material_id = m.id and mt.student_id = auth.uid()
          )
        )
    )
  );
$$;

-- 이 학생이 참여한 수업인가
create or replace function public.is_lesson_participant(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_student() and exists (
    select 1 from public.lesson_participants
    where lesson_id = p_lesson_id and student_id = auth.uid()
  );
$$;

-- "이 판을 볼 수 있는가" — 모든 바둑판·코멘트 정책이 이 함수 하나를 씀
create or replace function public.can_read_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_teacher() or (
    public.is_active_student() and (
      -- 자기가 만든 판 (제출 기보, 풀이 기록)
      exists (select 1 from public.boards b where b.id = p_board_id and b.created_by = auth.uid())
      -- 참여한 수업
      or exists (
        select 1 from public.lesson_rooms l
        join public.lesson_participants p on p.lesson_id = l.id
        where l.board_id = p_board_id and p.student_id = auth.uid()
      )
      -- 배정된 문제
      or exists (
        select 1 from public.problems pr
        where pr.board_id = p_board_id and public.can_read_problem(pr.id)
      )
      -- 공개된 자료
      or exists (
        select 1 from public.materials m
        where m.board_id = p_board_id and public.can_read_material(m.id)
      )
      -- 자기 제출 기보 / 자기 풀이 기록
      or exists (select 1 from public.game_submissions g where g.board_id = p_board_id and g.student_id = auth.uid())
      or exists (select 1 from public.problem_attempts a where a.board_id = p_board_id and a.student_id = auth.uid())
    )
  );
$$;

-- 도우미 함수는 로그인한 사용자만 실행
revoke execute on function public.is_teacher() from public, anon;
revoke execute on function public.is_active_student() from public, anon;
revoke execute on function public.is_assigned_set(uuid) from public, anon;
revoke execute on function public.can_read_problem(uuid) from public, anon;
revoke execute on function public.can_read_material(uuid) from public, anon;
revoke execute on function public.is_lesson_participant(uuid) from public, anon;
revoke execute on function public.can_read_board(uuid) from public, anon;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.is_active_student() to authenticated;
grant execute on function public.is_assigned_set(uuid) to authenticated;
grant execute on function public.can_read_problem(uuid) to authenticated;
grant execute on function public.can_read_material(uuid) to authenticated;
grant execute on function public.is_lesson_participant(uuid) to authenticated;
grant execute on function public.can_read_board(uuid) to authenticated;
-- 트리거 함수는 직접 호출할 일이 없음
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- 모든 테이블에 RLS 켜기 ----------
alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_source_notes enable row level security;
alter table public.board_reads enable row level security;
alter table public.lesson_rooms enable row level security;
alter table public.lesson_participants enable row level security;
alter table public.tags enable row level security;
alter table public.problems enable row level security;
alter table public.problem_tags enable row level security;
alter table public.assignment_sets enable row level security;
alter table public.assignment_set_problems enable row level security;
alter table public.assignment_targets enable row level security;
alter table public.problem_attempts enable row level security;
alter table public.materials enable row level security;
alter table public.material_tags enable row level security;
alter table public.material_targets enable row level security;
alter table public.game_submissions enable row level security;
alter table public.rank_history enable row level security;
alter table public.student_notes enable row level security;

-- =====================================================================
-- 사용자
-- =====================================================================
-- 본인, 선생님 프로필(코멘트 작성자 이름 표시용)은 누구나, 선생님은 전부
create policy "profiles: 읽기" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role = 'teacher' or (select public.is_teacher()));
-- 이름·급수 등 수정은 선생님만 (학생 계정 생성·비밀번호는 Edge Function이 처리)
create policy "profiles: 선생님 수정" on public.profiles for update to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- =====================================================================
-- 바둑판·코멘트
-- =====================================================================
create policy "boards: 읽기" on public.boards for select to authenticated
  using ((select public.is_teacher()) or public.can_read_board(id));

create policy "boards: 선생님 만들기" on public.boards for insert to authenticated
  with check ((select public.is_teacher()));
-- 학생은 제출 기보·풀이 기록용 판만 자기 이름으로 만들 수 있음
create policy "boards: 학생 만들기" on public.boards for insert to authenticated
  with check (
    (select public.is_active_student())
    and kind in ('submission', 'attempt')
    and created_by = (select auth.uid())
  );

create policy "boards: 선생님 수정" on public.boards for update to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));
-- 학생은 자기 풀이 기록 판만 수정 (제출한 기보는 선생님 검토용이라 수정 불가)
create policy "boards: 학생 풀이 기록 수정" on public.boards for update to authenticated
  using ((select public.is_active_student()) and kind = 'attempt' and created_by = (select auth.uid()))
  with check (kind = 'attempt' and created_by = (select auth.uid()));

create policy "boards: 선생님 삭제" on public.boards for delete to authenticated
  using ((select public.is_teacher()));

-- 코멘트: 학생은 읽기만 (쓰기·수정·삭제 정책은 선생님만 있음)
create policy "board_comments: 읽기" on public.board_comments for select to authenticated
  using (public.can_read_board(board_id));
create policy "board_comments: 선생님 쓰기" on public.board_comments for insert to authenticated
  with check ((select public.is_teacher()));
create policy "board_comments: 선생님 수정" on public.board_comments for update to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));
create policy "board_comments: 선생님 삭제" on public.board_comments for delete to authenticated
  using ((select public.is_teacher()));

-- 원본 기보 메모: 학생은 자기가 올린 판에 처음 넣을 때만
create policy "board_source_notes: 읽기" on public.board_source_notes for select to authenticated
  using (public.can_read_board(board_id));
create policy "board_source_notes: 넣기" on public.board_source_notes for insert to authenticated
  with check (
    (select public.is_teacher())
    or (
      (select public.is_active_student())
      and exists (
        select 1 from public.boards b
        where b.id = board_id and b.created_by = (select auth.uid()) and b.kind = 'submission'
      )
    )
  );
create policy "board_source_notes: 선생님 수정" on public.board_source_notes for update to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));
create policy "board_source_notes: 선생님 삭제" on public.board_source_notes for delete to authenticated
  using ((select public.is_teacher()));

-- 열람 기록: 각자 자기 것만
create policy "board_reads: 본인" on public.board_reads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_read_board(board_id));
create policy "board_reads: 선생님 읽기" on public.board_reads for select to authenticated
  using ((select public.is_teacher()));

-- =====================================================================
-- 수업
-- =====================================================================
create policy "lesson_rooms: 읽기" on public.lesson_rooms for select to authenticated
  using ((select public.is_teacher()) or public.is_lesson_participant(id));
create policy "lesson_rooms: 선생님 관리" on public.lesson_rooms for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "lesson_participants: 읽기" on public.lesson_participants for select to authenticated
  using ((select public.is_teacher()) or student_id = (select auth.uid()));
create policy "lesson_participants: 선생님 관리" on public.lesson_participants for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- =====================================================================
-- 과제
-- =====================================================================
create policy "tags: 읽기" on public.tags for select to authenticated using (true);
create policy "tags: 선생님 관리" on public.tags for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "problems: 읽기" on public.problems for select to authenticated
  using (public.can_read_problem(id));
create policy "problems: 선생님 관리" on public.problems for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "problem_tags: 읽기" on public.problem_tags for select to authenticated
  using (public.can_read_problem(problem_id));
create policy "problem_tags: 선생님 관리" on public.problem_tags for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "assignment_sets: 읽기" on public.assignment_sets for select to authenticated
  using ((select public.is_teacher()) or public.is_assigned_set(id));
create policy "assignment_sets: 선생님 관리" on public.assignment_sets for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "assignment_set_problems: 읽기" on public.assignment_set_problems for select to authenticated
  using ((select public.is_teacher()) or public.is_assigned_set(set_id));
create policy "assignment_set_problems: 선생님 관리" on public.assignment_set_problems for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "assignment_targets: 읽기" on public.assignment_targets for select to authenticated
  using ((select public.is_teacher()) or student_id = (select auth.uid()));
create policy "assignment_targets: 선생님 관리" on public.assignment_targets for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- 풀이 기록: 학생은 배정받은 묶음의 문제에 대해서만 자기 기록을 만들고 고침
create policy "problem_attempts: 읽기" on public.problem_attempts for select to authenticated
  using ((select public.is_teacher()) or student_id = (select auth.uid()));
create policy "problem_attempts: 학생 만들기" on public.problem_attempts for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and public.is_assigned_set(set_id)
    and exists (
      select 1 from public.assignment_set_problems sp
      where sp.set_id = problem_attempts.set_id and sp.problem_id = problem_attempts.problem_id
    )
  );
create policy "problem_attempts: 학생 수정" on public.problem_attempts for update to authenticated
  using (student_id = (select auth.uid()) and public.is_assigned_set(set_id))
  with check (student_id = (select auth.uid()) and public.is_assigned_set(set_id));
create policy "problem_attempts: 선생님 관리" on public.problem_attempts for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- =====================================================================
-- 자료실·기보 제출함
-- =====================================================================
create policy "materials: 읽기" on public.materials for select to authenticated
  using (public.can_read_material(id));
create policy "materials: 선생님 관리" on public.materials for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "material_tags: 읽기" on public.material_tags for select to authenticated
  using (public.can_read_material(material_id));
create policy "material_tags: 선생님 관리" on public.material_tags for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "material_targets: 읽기" on public.material_targets for select to authenticated
  using ((select public.is_teacher()) or student_id = (select auth.uid()));
create policy "material_targets: 선생님 관리" on public.material_targets for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy "game_submissions: 읽기" on public.game_submissions for select to authenticated
  using ((select public.is_teacher()) or student_id = (select auth.uid()));
-- 학생은 자기 판으로만 제출 (검토 상태는 선생님만 바꿈)
create policy "game_submissions: 학생 제출" on public.game_submissions for insert to authenticated
  with check (
    (select public.is_active_student())
    and student_id = (select auth.uid())
    and status = 'submitted'
    and exists (
      select 1 from public.boards b
      where b.id = board_id and b.created_by = (select auth.uid()) and b.kind = 'submission'
    )
  );
create policy "game_submissions: 선생님 관리" on public.game_submissions for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- =====================================================================
-- 성장 기록
-- =====================================================================
create policy "rank_history: 읽기" on public.rank_history for select to authenticated
  using ((select public.is_teacher()) or student_id = (select auth.uid()));
create policy "rank_history: 선생님 관리" on public.rank_history for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- 상담 메모: 선생님만 (학생 정책 없음 → 학생은 아예 못 봄)
create policy "student_notes: 선생님 관리" on public.student_notes for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));
