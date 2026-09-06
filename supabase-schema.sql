-- CroShy Anı — Supabase şema kurulumu
-- Supabase projende: Dashboard > SQL Editor > New query > bu dosyanın tamamını
-- yapıştırıp "Run" de. Tüm tabloları tek seferde oluşturur.
--
-- Not: "users" yerine "app_users" ismi kullanıldı; Supabase'in kendi
-- Auth sistemiyle (auth.users) karışmasın diye. Biz Supabase Auth
-- kullanmıyoruz, kendi basit kullanıcı/şifre sistemimizi bu tabloda tutuyoruz.

create table if not exists items (
  id text primary key,
  url text not null,
  public_id text not null,
  type text not null check (type in ('image', 'video')),
  uploader_name text not null,
  user_id text,
  ip text,
  caption text default '',
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at bigint not null
);
create index if not exists idx_items_status on items (status);
create index if not exists idx_items_ip on items (ip);

create table if not exists app_users (
  id text primary key,
  username text not null,
  username_lower text not null unique,
  password_hash text not null,
  created_at bigint not null,
  size_limit_exempt boolean not null default false
);

create table if not exists bans (
  ip text primary key,
  banned_at bigint not null,
  reason text default '',
  usernames jsonb not null default '[]'::jsonb
);

create table if not exists submission_log (
  id bigserial primary key,
  ip text not null,
  ts bigint not null
);
create index if not exists idx_submission_log_ip_ts on submission_log (ip, ts);

create table if not exists likes (
  item_id text not null,
  ip text not null,
  ts bigint not null,
  primary key (item_id, ip)
);

create table if not exists media_views (
  item_id text not null,
  ip text not null,
  ts bigint not null,
  primary key (item_id, ip)
);

-- "Beni hatırla" / otomatik giriş için uzun ömürlü token'lar.
-- Ham token asla saklanmaz, sadece sha256 hash'i saklanır.
create table if not exists remember_tokens (
  token_hash text primary key,
  subject_type text not null check (subject_type in ('admin', 'user')),
  subject_id text not null,
  username text not null,
  created_at bigint not null,
  expires_at bigint not null
);
create index if not exists idx_remember_expires on remember_tokens (expires_at);

-- Kullanıcıya özel dosya boyutu/süre sınırları (boşsa genel ayarlar geçerli olur)
alter table app_users add column if not exists custom_image_bytes bigint;
alter table app_users add column if not exists custom_video_bytes bigint;
alter table app_users add column if not exists custom_video_duration_sec int;

-- Genel (site geneli) varsayılan ayarlar — tek satırlık basit bir ayar tablosu.
-- Admin panelinden değiştirilebilir; kullanıcıya özel sınır yoksa buradaki
-- değerler kullanılır.
create table if not exists app_settings (
  id int primary key default 1,
  daily_submit_limit int not null default 2,
  max_image_bytes bigint not null default 8912896,
  max_video_bytes bigint not null default 41943040,
  max_video_duration_sec int not null default 150,
  updated_at bigint not null default 0
);
insert into app_settings (id, daily_submit_limit, max_image_bytes, max_video_bytes, max_video_duration_sec, updated_at)
values (1, 2, 8912896, 41943040, 150, 0)
on conflict (id) do nothing;

-- Bu tablolara sadece sunucumuz (service_role anahtarıyla) erişiyor;
-- service_role zaten Row Level Security'yi atlar, bu yüzden RLS'i
-- kapalı bırakmak (varsayılan) yeterli ve en basit seçenektir.
