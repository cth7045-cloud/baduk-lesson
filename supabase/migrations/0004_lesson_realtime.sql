-- =====================================================================
-- 3단계: 실시간 수업방
--  - 수업 채널(lesson:<수업 ID>)은 비공개 채널: 참여 학생과 선생님만 듣고 보낼 수 있음
--  - 학생은 "학생도 착수 가능"일 때만 판 변경을 보낼 수 있음 (접속 표시는 항상 가능)
--  - 코멘트·수업 상태 변경은 DB 변경 알림(postgres_changes)으로 전달 → RLS가 그대로 적용됨
--  - 채널 권한 정책(realtime.messages)은 0005 에 있음: 실시간 기능을 처음 쓸 때 Supabase가
--    realtime.messages 표를 만들기 때문에, 그 뒤에 적용해야 함
-- =====================================================================

-- 채널 이름 "lesson:<uuid>" 에서 수업 ID 꺼내기 (형식이 다르면 NULL)
create or replace function private.lesson_topic_id(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_topic like 'lesson:%' then
    return substr(p_topic, 8)::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- 수업 채널에 들어갈 수 있는가: 선생님 또는 참여 학생
create or replace function private.can_join_lesson(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_lesson_id is not null and (private.is_teacher() or private.is_lesson_participant(p_lesson_id));
$$;

-- 수업 채널에 판 변경을 보낼 수 있는가: 선생님, 또는 "학생도 착수 가능"인 진행 중 수업의 참여 학생
create or replace function private.can_broadcast_lesson(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_lesson_id is not null and (
    private.is_teacher()
    or (
      private.is_lesson_participant(p_lesson_id)
      and exists (
        select 1 from public.lesson_rooms
        where id = p_lesson_id and status = 'live' and control_mode = 'everyone'
      )
    )
  );
$$;

revoke execute on function private.lesson_topic_id(text) from public, anon;
revoke execute on function private.can_join_lesson(uuid) from public, anon;
revoke execute on function private.can_broadcast_lesson(uuid) from public, anon;
grant execute on function private.lesson_topic_id(text) to authenticated;
grant execute on function private.can_join_lesson(uuid) to authenticated;
grant execute on function private.can_broadcast_lesson(uuid) to authenticated;

-- 코멘트와 수업 상태(조작 권한, 종료)의 변경을 실시간으로 알림
alter publication supabase_realtime add table public.board_comments, public.lesson_rooms;

-- 수업 열기: 판 + 수업방 + 참여 학생을 한 번에 (중간에 실패하면 모두 취소)
create or replace function public.create_lesson(
  p_title text,
  p_size smallint,
  p_sgf text,
  p_student_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b uuid;
  l uuid;
begin
  if not private.is_teacher() then
    raise exception '선생님만 수업을 열 수 있습니다.';
  end if;
  insert into public.boards (kind, title, size, sgf) values ('lesson', p_title, p_size, p_sgf) returning id into b;
  insert into public.lesson_rooms (title, board_id) values (p_title, b) returning id into l;
  insert into public.lesson_participants (lesson_id, student_id)
    select l, sid from unnest(coalesce(p_student_ids, '{}')) as sid;
  return l;
end;
$$;

revoke execute on function public.create_lesson(text, smallint, text, uuid[]) from public, anon;
grant execute on function public.create_lesson(text, smallint, text, uuid[]) to authenticated;
