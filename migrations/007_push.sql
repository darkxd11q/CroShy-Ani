-- 007: telefona/tarayıcıya bildirim (web push) abonelikleri.
create table if not exists push_subscriptions (
  id bigserial primary key,
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at bigint not null,
  last_used_at bigint
);
create index if not exists idx_push_user on push_subscriptions (user_id);
