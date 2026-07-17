-- send-reminders Edge Function을 1분마다 자동 호출하도록 예약.
-- 아래 두 값을 채운 뒤 SQL Editor에서 실행하세요.
--   <PROJECT_REF>   : 프로젝트 URL의 서브도메인 (예: iyykrwowcxfmxntrwydo)
--   <CRON_SECRET>   : 직접 정한 임의의 긴 문자열.
--                      `supabase secrets set CRON_SECRET=...` 로 Edge Function에도
--                      "동일한 값"을 등록해둬야 함 (PUSH_NOTIFICATIONS.md 4단계 참고)
--
-- 최신 Supabase 프로젝트는 "publishable/secret" 새 키 체계를 쓰는 경우가 많아서,
-- Edge Function 호출 인증에 옛 service_role JWT 대신 이 방식(직접 정한 비밀값 +
-- --no-verify-jwt 배포)을 사용합니다. 더 간단하고 어떤 키 체계에서도 동작합니다.

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
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 예약 확인: select * from cron.job;
-- 예약 삭제: select cron.unschedule('haru-send-reminders-every-minute');

-- 참고: Supabase 대시보드 > Database > Cron Jobs 화면에서 "HTTP Request" 타입으로
-- 위 SQL 없이도 동일한 예약을 UI로 만들 수 있습니다 (더 쉬운 방법. Authorization
-- 헤더에 위와 동일하게 Bearer <CRON_SECRET>을 넣어주세요).
