-- =====================================================================
-- 권한 도우미 함수를 API에 노출되지 않는 private 스키마로 이동
-- (Supabase 보안 점검 권고: SECURITY DEFINER 함수가 /rest/v1/rpc 로 호출되지 않게)
-- 정책(RLS)은 함수를 내부 번호로 참조하므로 옮겨도 그대로 동작함
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_teacher() set schema private;
alter function public.is_active_student() set schema private;
alter function public.is_assigned_set(uuid) set schema private;
alter function public.can_read_problem(uuid) set schema private;
alter function public.can_read_material(uuid) set schema private;
alter function public.is_lesson_participant(uuid) set schema private;
alter function public.can_read_board(uuid) set schema private;

-- 함수 안에서 서로 부르는 이름도 private 로 바꿔 다시 정의
create or replace function private.is_teacher()
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

create or replace function private.is_active_student()
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
create or replace function private.is_assigned_set(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_student() and exists (
    select 1 from public.assignment_targets
    where set_id = p_set_id and student_id = auth.uid()
  );
$$;

-- 이 학생이 볼 수 있는 문제인가 (배정된 묶음에 들어 있음)
create or replace function private.can_read_problem(p_problem_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_teacher() or (
    private.is_active_student() and exists (
      select 1
      from public.assignment_set_problems sp
      join public.assignment_targets t on t.set_id = sp.set_id
      where sp.problem_id = p_problem_id and t.student_id = auth.uid()
    )
  );
$$;

-- 이 학생이 볼 수 있는 자료인가
create or replace function private.can_read_material(p_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_teacher() or (
    private.is_active_student() and exists (
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
create or replace function private.is_lesson_participant(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_student() and exists (
    select 1 from public.lesson_participants
    where lesson_id = p_lesson_id and student_id = auth.uid()
  );
$$;

-- "이 판을 볼 수 있는가" — 모든 바둑판·코멘트 정책이 이 함수 하나를 씀
create or replace function private.can_read_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_teacher() or (
    private.is_active_student() and (
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
        where pr.board_id = p_board_id and private.can_read_problem(pr.id)
      )
      -- 공개된 자료
      or exists (
        select 1 from public.materials m
        where m.board_id = p_board_id and private.can_read_material(m.id)
      )
      -- 자기 제출 기보 / 자기 풀이 기록
      or exists (select 1 from public.game_submissions g where g.board_id = p_board_id and g.student_id = auth.uid())
      or exists (select 1 from public.problem_attempts a where a.board_id = p_board_id and a.student_id = auth.uid())
    )
  );
$$;

revoke execute on function private.is_teacher() from public, anon;
revoke execute on function private.is_active_student() from public, anon;
revoke execute on function private.is_assigned_set(uuid) from public, anon;
revoke execute on function private.can_read_problem(uuid) from public, anon;
revoke execute on function private.can_read_material(uuid) from public, anon;
revoke execute on function private.is_lesson_participant(uuid) from public, anon;
revoke execute on function private.can_read_board(uuid) from public, anon;
grant execute on function private.is_teacher() to authenticated;
grant execute on function private.is_active_student() to authenticated;
grant execute on function private.is_assigned_set(uuid) to authenticated;
grant execute on function private.can_read_problem(uuid) to authenticated;
grant execute on function private.can_read_material(uuid) to authenticated;
grant execute on function private.is_lesson_participant(uuid) to authenticated;
grant execute on function private.can_read_board(uuid) to authenticated;
