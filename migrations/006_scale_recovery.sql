-- 006: ölçek (özet görünümleri), kurtarma kodları ve kalıcı hız sınırı sayaçları.

-- Beğeni / yorum sayıları: tüm satırları çekmek yerine öğe başına TEK satır (1000 satır sınırına takılmaz)
create or replace view like_counts as
  select item_id, count(*)::bigint as cnt from likes group by item_id;
create or replace view comment_counts as
  select item_id, count(*)::bigint as cnt from comments group by item_id;

-- Kurtarma kodları (e-postasız şifre sıfırlama): kodlar HASH'li saklanır, bir kez kullanılır
create table if not exists recovery_codes (
  id bigserial primary key,
  user_id text not null,
  code_hash text not null,
  created_at bigint not null,
  used_at bigint
);
create index if not exists idx_recovery_user on recovery_codes (user_id, used_at);

-- Giriş denemesi / hız sınırı sayaçları: sunucu yeniden başlasa da sıfırlanmasın
create table if not exists rate_state (
  name text not null,
  key text not null,
  state jsonb not null,
  expires_at bigint not null,
  primary key (name, key)
);
create index if not exists idx_rate_state_exp on rate_state (expires_at);
