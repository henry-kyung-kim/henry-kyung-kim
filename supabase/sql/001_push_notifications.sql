-- 알림(Web Push) 기능에 필요한 테이블
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행하세요.

-- 기기별 푸시 구독 정보
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- 같은 알림을 중복 발송하지 않기 위한 발송 기록.
-- Edge Function(서비스 롤 키)만 접근하므로 클라이언트용 정책은 만들지 않음.
create table if not exists public.sent_reminders (
  user_id uuid not null,
  event_id text not null,
  alarm text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, event_id, alarm)
);

alter table public.sent_reminders enable row level security;
-- 정책을 만들지 않으면 RLS가 기본적으로 모든 접근을 막고,
-- Edge Function은 service_role 키를 쓰므로 RLS 자체를 우회합니다.
