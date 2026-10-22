-- =====================================================================
-- 5단계: 자료실, 기보 제출함
-- =====================================================================

-- ---------- 파일 보관함 (PDF·이미지), 비공개 ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials',
  'materials',
  false,
  31457280, -- 30MB
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- 파일을 볼 수 있는가: 선생님, 또는 그 파일을 가진 자료가 학생에게 공개됨
create or replace function private.can_read_material_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_teacher() or exists (
    select 1 from public.materials m
    where m.storage_path = p_name and private.can_read_material(m.id)
  );
$$;
revoke execute on function private.can_read_material_file(text) from public, anon;
grant execute on function private.can_read_material_file(text) to authenticated;

create policy "자료 파일: 읽기" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and private.can_read_material_file(name));
create policy "자료 파일: 선생님 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and private.is_teacher());
create policy "자료 파일: 선생님 수정" on storage.objects for update to authenticated
  using (bucket_id = 'materials' and private.is_teacher())
  with check (bucket_id = 'materials' and private.is_teacher());
create policy "자료 파일: 선생님 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and private.is_teacher());

-- ---------- SGF 자료 올리기: 판 + 자료 + 태그 + 공개 학생 + 코멘트를 한 번에 ----------
-- p_comments: [{"node_id": "...", "body": "..."}] (node_id 가 null 이면 판 전체 메모)
create or replace function public.create_sgf_material(
  p_title text,
  p_description text,
  p_size smallint,
  p_sgf text,
  p_visibility public.visibility,
  p_tag_ids uuid[],
  p_student_ids uuid[],
  p_comments jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b uuid;
  m uuid;
begin
  if not private.is_teacher() then
    raise exception '선생님만 자료를 올릴 수 있습니다.';
  end if;
  insert into public.boards (kind, title, size, sgf) values ('material', p_title, p_size, p_sgf) returning id into b;
  insert into public.materials (title, description, type, board_id, visibility)
    values (p_title, coalesce(p_description, ''), 'sgf', b, p_visibility) returning id into m;
  insert into public.material_tags (material_id, tag_id) select m, t from unnest(coalesce(p_tag_ids, '{}')) as t;
  insert into public.material_targets (material_id, student_id) select m, s from unnest(coalesce(p_student_ids, '{}')) as s;
  insert into public.board_comments (board_id, node_id, body)
    select b, c ->> 'node_id', c ->> 'body'
    from jsonb_array_elements(coalesce(p_comments, '[]'::jsonb)) as c
    where coalesce(c ->> 'body', '') <> '';
  return m;
end;
$$;
revoke execute on function public.create_sgf_material(text, text, smallint, text, public.visibility, uuid[], uuid[], jsonb) from public, anon;
grant execute on function public.create_sgf_material(text, text, smallint, text, public.visibility, uuid[], uuid[], jsonb) to authenticated;

-- ---------- 학생 기보 제출: 판 + 원본 메모 + 제출 기록을 한 번에 ----------
-- p_notes: 학생 SGF 안에 있던 메모 [{"node_id": "...", "body": "..."}] → 읽기 전용으로 보존
create or replace function public.create_submission(
  p_title text,
  p_size smallint,
  p_sgf text,
  p_played_on date,
  p_note text,
  p_notes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b uuid;
  g uuid;
begin
  if not private.is_active_student() then
    raise exception '학생 계정으로만 기보를 제출할 수 있습니다.';
  end if;
  insert into public.boards (kind, title, size, sgf, created_by)
    values ('submission', p_title, p_size, p_sgf, auth.uid()) returning id into b;
  insert into public.board_source_notes (board_id, node_id, body)
    select b, n ->> 'node_id', n ->> 'body'
    from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as n
    where coalesce(n ->> 'body', '') <> '';
  insert into public.game_submissions (student_id, board_id, title, student_note, played_on)
    values (auth.uid(), b, p_title, coalesce(p_note, ''), p_played_on) returning id into g;
  return g;
end;
$$;
revoke execute on function public.create_submission(text, smallint, text, date, text, jsonb) from public, anon;
grant execute on function public.create_submission(text, smallint, text, date, text, jsonb) to authenticated;
