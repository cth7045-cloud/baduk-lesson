-- =====================================================================
-- 4단계: 과제
-- 문제 만들기: 판 + 문제 + 태그를 한 번에 (중간에 실패하면 모두 취소)
-- =====================================================================
create or replace function public.create_problem(
  p_title text,
  p_size smallint,
  p_sgf text,
  p_to_play char(1),
  p_tag_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b uuid;
  pr uuid;
begin
  if not private.is_teacher() then
    raise exception '선생님만 문제를 만들 수 있습니다.';
  end if;
  insert into public.boards (kind, title, size, sgf) values ('problem', p_title, p_size, p_sgf) returning id into b;
  insert into public.problems (board_id, title, to_play) values (b, p_title, p_to_play) returning id into pr;
  insert into public.problem_tags (problem_id, tag_id)
    select pr, t from unnest(coalesce(p_tag_ids, '{}')) as t;
  return pr;
end;
$$;

revoke execute on function public.create_problem(text, smallint, text, char, uuid[]) from public, anon;
grant execute on function public.create_problem(text, smallint, text, char, uuid[]) to authenticated;
