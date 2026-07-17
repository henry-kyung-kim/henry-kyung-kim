-- send-reminders Edge Function을 1분마다 자동 호출하도록 예약.
-- 아래 두 값을 프로젝트 값으로 바꾼 뒤 SQL Editor에서 실행하세요.
--   <PROJECT_REF>          : Supabase 프로젝트 참조 ID (프로젝트 URL의 서브도메인)
--   <SERVICE_ROLE_KEY>     : 프로젝트 Settings > API 의 service_role 키.
--                             Edge Function은 유효한 Supabase 서명 토큰을 요구하는데,
--                             service_role 키가 여기 해당해서 별도 비밀값 없이 이걸 그대로 씁니다.
--                             (Settings > API에서만 복사 가능한 민감한 키이니 노출에 주의)

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'haru-send-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 예약 확인: select * from cron.job;
-- 예약 삭제: select cron.unschedule('haru-send-reminders-every-minute');

-- 참고: Supabase 대시보드 > Database > Cron Jobs 화면에서
-- 위 SQL 없이도 동일한 예약을 UI로 만들 수 있습니다 (더 쉬운 방법).
