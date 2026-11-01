-- 005: işlem kaydı (audit log), şikayetler ve kişisel yönetici hesapları (2 adımlı doğrulamalı).

-- Yönetici işlem kaydı: kim, ne zaman, neyi yaptı
create table if not exists audit_log (
  id bigserial primary key,
  actor text not null,
  role text,
  action text not null,
  label text,
  target text,
  details text,
  status int,
  created_at bigint not null
);
create index if not exists idx_audit_created on audit_log (created_at desc);

-- Kullanıcı şikayetleri (anı ya da yorum)
create table if not exists reports (
  id bigserial primary key,
  item_id text not null,
  comment_id bigint,
  reporter_id text not null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at bigint not null,
  resolved_by text,
  resolved_at bigint
);
create unique index if not exists uq_reports_once on reports (reporter_id, item_id, coalesce(comment_id, 0));
create index if not exists idx_reports_status on reports (status, created_at);

-- Kişisel yönetici hesapları (ortak şifre yerine); TOTP gizli anahtarı şifreli saklanır
create table if not exists admins (
  id text primary key,
  username text not null,
  username_lower text not null unique,
  password_hash text not null,
  role text not null check (role in ('moderator', 'superadmin')),
  totp_secret text,
  totp_enabled boolean not null default false,
  disabled boolean not null default false,
  must_change_password boolean not null default false,
  created_at bigint not null,
  last_login_at bigint
);
