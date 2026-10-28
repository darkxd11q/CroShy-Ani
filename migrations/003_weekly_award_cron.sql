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
