-- 008: koleksiyonlar, taslaklar, yorum zinciri/sabitleme, vitrin anısı, tepki özeti.

-- Taslaklar: items.status artık 'draft' da olabilir (eski CHECK kısıtını kaldırıp genişletir)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'items'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table items drop constraint %I', r.conname);
  end loop;
end $$;
alter table items add constraint items_status_check check (status in ('pending', 'approved', 'draft'));

-- Yorumlar: yanıt zinciri + sabitleme
alter table comments add column if not exists parent_id bigint;
alter table comments add column if not exists pinned_at bigint;
create index if not exists idx_comments_parent on comments (parent_id);

-- Profilde vitrin (sabitlenmiş) anı
alter table app_users add column if not exists pinned_item_id text;

-- Koleksiyonlar (kaydetme listeleri; sadece sahibi görür)
create table if not exists collections (
  id bigserial primary key,
  user_id text not null,
  name text not null,
  name_lower text not null,
  created_at bigint not null,
  unique (user_id, name_lower)
);
create index if not exists idx_collections_user on collections (user_id);
create table if not exists collection_items (
  collection_id bigint not null references collections (id) on delete cascade,
  item_id text not null,
  added_at bigint not null,
  primary key (collection_id, item_id)
);
create index if not exists idx_collection_items_item on collection_items (item_id);

-- Anı başına emoji sayıları (kartlarda "en çok verilen 2 tepki" için)
create or replace view reaction_counts as
  select item_id, emoji, count(*)::bigint as cnt from reactions group by item_id, emoji;
