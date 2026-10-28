-- 002: Hesap bazlı yasak, süreli rozetler, red nedeni, etiketler, oturumlar,
-- bildirimler, yorumlar ve emoji tepkileri.

-- Hesap bazlı yasak (IP yasakları yerine; ortak IP'li mobil kullanıcıları etkilemez)
alter table app_users add column if not exists banned boolean not null default false;
alter table app_users add column if not exists banned_reason text;
alter table app_users add column if not exists banned_at bigint;

-- Süreli rozetler (ör. ÖZEL/Plus 30 gün): { "special": <bitiş ms> }; boş = süresiz
alter table app_users add column if not exists badge_expiry jsonb not null default '{}'::jsonb;
alter table redeem_codes add column if not exists duration_days int;

-- Anılar: red/kaldırma nedeni ve etiketler (#etiket)
alter table items add column if not exists reject_reason text;
alter table items add column if not exists tags text[] not null default '{}';
create index if not exists idx_items_tags on items using gin (tags);

-- Kalıcı oturumlar (sunucu uyuyup uyansa/yeniden başlasa kimse çıkış yapmaz)
create table if not exists sessions (
  sid text primary key,
  sess jsonb not null,
  expire bigint not null
);
create index if not exists idx_sessions_expire on sessions (expire);

-- Bildirimler (çan)
create table if not exists notifications (
  id bigserial primary key,
  user_id text not null,
  type text not null,
  text text not null,
  link text,
  created_at bigint not null,
  read boolean not null default false,
  dedupe_key text
);
create index if not exists idx_notif_user on notifications (user_id, read, created_at desc);
create unique index if not exists uq_notif_dedupe on notifications (user_id, dedupe_key) where dedupe_key is not null;

-- Yorumlar
create table if not exists comments (
  id bigserial primary key,
  item_id text not null,
  user_id text not null,
  body text not null,
  created_at bigint not null
);
create index if not exists idx_comments_item on comments (item_id, created_at);
create index if not exists idx_comments_user on comments (user_id);

-- Emoji tepkileri (bir kullanıcı bir anıya her emojiyle en fazla 1 kez)
create table if not exists reactions (
  item_id text not null,
  user_id text not null,
  emoji text not null,
  created_at bigint not null,
  primary key (item_id, user_id, emoji)
);
create index if not exists idx_reactions_item on reactions (item_id);
