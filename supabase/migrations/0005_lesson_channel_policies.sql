-- =====================================================================
-- 3단계: 수업 채널 권한 (비공개 채널 lesson:<수업 ID>)
-- 주의: realtime.messages 표는 실시간 기능에 처음 접속할 때 Supabase가 만듦.
--       표가 생긴 뒤에 적용할 것 (함수들은 0004 에 있음)
-- =====================================================================

create policy "수업 채널: 받기" on realtime.messages for select to authenticated
  using (private.can_join_lesson(private.lesson_topic_id((select realtime.topic()))));

create policy "수업 채널: 보내기" on realtime.messages for insert to authenticated
  with check (
    case
      when extension = 'presence' then private.can_join_lesson(private.lesson_topic_id((select realtime.topic())))
      else private.can_broadcast_lesson(private.lesson_topic_id((select realtime.topic())))
    end
  );

