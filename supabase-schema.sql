-- Bu dosya migrations/ klasöründeki tüm güncellemelerin birleşimidir.
-- NORMALDE GEREK YOK: DATABASE_URL tanımlıysa sunucu bunları açılışta kendisi uygular.
-- Elle çalıştırmak istersen Supabase > SQL Editor'e olduğu gibi yapıştırabilirsin (tekrar çalıştırılabilir).

-- ===== 001_base.sql =====
-- 001: Temel şema (daha önce elle çalıştırılan supabase-schema.sql). Tamamen tekrar çalıştırılabilir.
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

-- Admin oturumları için rol bilgisi ("moderator" veya "superadmin");
-- normal kullanıcı token'larında kullanılmaz (null kalır)
alter table remember_tokens add column if not exists role text;

-- Kullanıcıya özel dosya boyutu/süre sınırları (boşsa genel ayarlar geçerli olur)
alter table app_users add column if not exists custom_image_bytes bigint;
alter table app_users add column if not exists custom_video_bytes bigint;
alter table app_users add column if not exists custom_video_duration_sec int;

-- Profilde gösterilen kısa "hakkımda" metni (herkese açık profilde de görünür)
alter table app_users add column if not exists bio text;

-- Admin panelinden verilebilen rozetler. "founder" ve "croshy" rozetine
-- sahip kullanıcılar TÜM site sınırlarından (boyut/süre/günlük limit) muaf
-- tutulur — bkz. server.js effectiveLimitsFor().
alter table app_users add column if not exists badges jsonb not null default '[]'::jsonb;

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

-- Yeni kayıt olan herkese otomatik verilen rozet zaten kod tarafında
-- ekleniyor; bu satır daha önce kayıt olmuş kullanıcıları da güncelleyip
-- rozeti olmayanlara "member" ekler. Script tekrar çalıştırılsa da
-- güvenlidir (zaten sahip olanları tekrar eklemez).
update app_users
set badges = badges || '["member"]'::jsonb
where not (badges @> '["member"]'::jsonb);

-- Silme işlemleri artık "yumuşak silme" — bir anı silindiğinde hemen
-- kalıcı olarak kaldırılmaz, 24 saat boyunca geri alınabilir durumda
-- bekletilir, süre dolunca Cloudinary'den ve veritabanından tamamen silinir.
alter table items add column if not exists deleted_at bigint;
create index if not exists idx_items_deleted_at on items (deleted_at);

-- ÖZEL/Plus üyelerin seçebildiği alternatif site teması (boşsa varsayılan)
alter table app_users add column if not exists theme text;

-- Tek kullanımlık, 24 saat geçerli rozet kodları (admin panelinde
-- oluşturulur, "/redeem" sayfasından kullanılır).
create table if not exists redeem_codes (
  code text primary key,
  badge text not null check (badge in ('special', 'plus')),
  created_at bigint not null,
  expires_at bigint not null,
  redeemed_by text,
  redeemed_at bigint
);
create index if not exists idx_redeem_expires on redeem_codes (expires_at);

-- Profil fotoğrafı (statik görsel ya da ÖZEL/Plus için GIF)
alter table app_users add column if not exists avatar_url text;
alter table app_users add column if not exists avatar_public_id text;

-- Haftalık rozet ödülleri (her Cuma 17:15'te otomatik dağıtılır).
-- "seen" = ödül kutlama ekranı kullanıcıya gösterildi mi; theme_expires_at =
-- ödül temalarının (Aurora/Kraliyet) bitiş zamanı (ödülden 15 gün sonra).
create table if not exists weekly_awards (
  id bigserial primary key,
  user_id text not null,
  username text not null,
  badge text not null check (badge in ('weekly_active', 'weekly_liked')),
  week_end bigint not null,
  submissions int not null default 0,
  likes int not null default 0,
  awarded_at bigint not null,
  theme_expires_at bigint not null,
  seen boolean not null default false
);
create index if not exists idx_weekly_awards_user on weekly_awards (user_id, seen);
create index if not exists idx_weekly_awards_theme on weekly_awards (user_id, theme_expires_at);

-- Son haftalık dağıtımın zamanı (aynı hafta iki kez dağıtılmasın diye)
alter table app_settings add column if not exists last_weekly_award bigint not null default 0;

-- İsim rengi (ÖZEL/Plus/haftalık rozet sahipleri): hazır gradyan ya da harf harf renkler
alter table app_users add column if not exists name_style jsonb;

-- Kullanıcı adı değişiklik geçmişi (kullanıcı 14 günde en fazla 2 kez değiştirebilir;
-- admin değişiklikleri sayılmaz)
create table if not exists name_changes (
  id bigserial primary key,
  user_id text not null,
  old_name text not null,
  new_name text not null,
  changed_at bigint not null,
  by_admin boolean not null default false
);
create index if not exists idx_name_changes_user on name_changes (user_id, changed_at);

-- Geri bildirimler (sağ alttaki widget'tan gelir, süper admin görür).
-- thanks_seen=false -> kullanıcı onaylanan/çok beğenilen bildirimi için
-- teşekkür ekranını henüz görmedi.
create table if not exists feedback (
  id bigserial primary key,
  user_id text not null,
  username text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'loved', 'dismissed')),
  created_at bigint not null,
  reviewed_at bigint,
  thanks_seen boolean not null default true
);
create index if not exists idx_feedback_status on feedback (status, created_at);
create index if not exists idx_feedback_user on feedback (user_id, thanks_seen);

-- Bu tablolara sadece sunucumuz (service_role anahtarıyla) erişiyor;
-- service_role zaten Row Level Security'yi atlar, bu yüzden RLS'i
-- kapalı bırakmak (varsayılan) yeterli ve en basit seçenektir.


-- ===== 002_features.sql =====
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


-- ===== 003_weekly_award_cron.sql =====
-- 003: Haftalık rozetler artık VERİTABANININ KENDİSİNDE (pg_cron) dağıtılır:
-- Render uyuyor olsa bile her Cuma 17:15'te (Türkiye saati) çalışır.
-- Sunucudaki yedek zamanlayıcı aynı "last_weekly_award" kaydını kullandığı için
-- iki taraf birlikte çalışsa da aynı hafta için ödül ikinci kez verilmez.

create or replace function public.run_weekly_award() returns void
language plpgsql
as $fn$
declare
  local_now timestamp := (now() at time zone 'Europe/Istanbul');
  fri_local timestamp;
  t_ms bigint;
  from_ms bigint;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  claimed int;
  w record;
begin
  fri_local := date_trunc('week', local_now) + interval '4 days 17 hours 15 minutes';
  if fri_local > local_now then
    fri_local := fri_local - interval '7 days';
  end if;
  t_ms := (extract(epoch from (fri_local at time zone 'Europe/Istanbul')) * 1000)::bigint;
  from_ms := t_ms - 604800000;

  update app_settings set last_weekly_award = t_ms where id = 1 and last_weekly_award < t_ms;
  get diagnostics claimed = row_count;
  if claimed = 0 then
    return;
  end if;

  -- geçen haftanın sahiplerinden rozetleri al
  update app_users
     set badges = (badges - 'weekly_active') - 'weekly_liked'
   where badges ? 'weekly_active' or badges ? 'weekly_liked';

  -- Haftanın Aktifi: dönemde en çok ONAYLI anı paylaşan
  select i.user_id as user_id, count(*)::int as subs, coalesce(sum(l.cnt), 0)::int as like_total
    into w
    from items i
    left join (select item_id, count(*) as cnt from likes group by item_id) l on l.item_id = i.id
   where i.status = 'approved' and i.deleted_at is null and i.user_id is not null
     and i.created_at >= from_ms and i.created_at < t_ms
   group by i.user_id
   order by count(*) desc, coalesce(sum(l.cnt), 0) desc, i.user_id asc
   limit 1;
  if found and exists (select 1 from app_users where id = w.user_id) then
    update app_users set badges = badges || '["weekly_active"]'::jsonb
     where id = w.user_id and not (badges ? 'weekly_active');
    insert into weekly_awards (user_id, username, badge, week_end, submissions, likes, awarded_at, theme_expires_at, seen)
    select u.id, u.username, 'weekly_active', t_ms, w.subs, w.like_total, now_ms, now_ms + 1296000000, false
      from app_users u where u.id = w.user_id;
    insert into notifications (user_id, type, text, link, created_at)
    values (w.user_id, 'badge', 'Haftanın Aktifi rozetini kazandın! 🔥 Ödül temaların profilinde seni bekliyor.', '/profile', now_ms);
  end if;

  -- Haftanın Beğenileni: dönemde paylaştığı anıların beğeni toplamı en yüksek olan
  select i.user_id as user_id, count(*)::int as subs, coalesce(sum(l.cnt), 0)::int as like_total
    into w
    from items i
    left join (select item_id, count(*) as cnt from likes group by item_id) l on l.item_id = i.id
   where i.status = 'approved' and i.deleted_at is null and i.user_id is not null
     and i.created_at >= from_ms and i.created_at < t_ms
   group by i.user_id
   having coalesce(sum(l.cnt), 0) >= 1
   order by coalesce(sum(l.cnt), 0) desc, count(*) desc, i.user_id asc
   limit 1;
  if found and exists (select 1 from app_users where id = w.user_id) then
    update app_users set badges = badges || '["weekly_liked"]'::jsonb
     where id = w.user_id and not (badges ? 'weekly_liked');
    insert into weekly_awards (user_id, username, badge, week_end, submissions, likes, awarded_at, theme_expires_at, seen)
    select u.id, u.username, 'weekly_liked', t_ms, w.subs, w.like_total, now_ms, now_ms + 1296000000, false
      from app_users u where u.id = w.user_id;
    insert into notifications (user_id, type, text, link, created_at)
    values (w.user_id, 'badge', 'Haftanın Beğenileni rozetini kazandın! ⭐ Ödül temaların profilinde seni bekliyor.', '/profile', now_ms);
  end if;
end
$fn$;

-- Her Cuma 14:15 UTC = 17:15 Türkiye saati (pg_cron UTC çalışır). Eklenti
-- kurulamazsa (yetki vb.) sunucu içi zamanlayıcı yedek olarak çalışmaya devam eder.
do $cron$
begin
  create extension if not exists pg_cron;
  begin
    perform cron.unschedule('croshy-weekly-award');
  exception when others then
    null;
  end;
  perform cron.schedule('croshy-weekly-award', '15 14 * * 5', 'select public.run_weekly_award()');
exception when others then
  raise notice 'pg_cron kurulamadi (sunucu yedegi calisacak): %', sqlerrm;
end
$cron$;


-- ===== 004_privacy.sql =====
-- 004: IP adreslerinin saklanma süresini kısalt (KVKK).
-- Yeni sistemde limitler/beğeniler HESABA bağlıdır; IP sadece kısa süreli güvenlik kaydıdır.
update items set ip = null where ip is not null and created_at < (extract(epoch from now()) * 1000 - 2592000000);
delete from submission_log where ts < (extract(epoch from now()) * 1000 - 259200000);
-- eski (IP'ye bağlı) beğenileri geri döndürülemez şekilde takma adlandır; sayıları korunur
update likes set ip = 'h:' || md5('croshy-v1:' || ip) where ip not like 'u:%' and ip not like 'h:%';
-- eski ham IP'li "görüldü" kayıtlarını sil (sadece öneri sıralaması içindi)
delete from media_views where ip not like 'u:%' and ip not like 'h:%';
