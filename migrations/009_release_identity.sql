-- 009: güncelleme duyurusu (kim hangi sürümü gördü) ve admin <-> normal hesap bağlantısı.
alter table app_users add column if not exists seen_release text;
alter table admins add column if not exists linked_user_id text;
create index if not exists idx_admins_linked on admins (linked_user_id);
