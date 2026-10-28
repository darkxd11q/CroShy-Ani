-- 004: IP adreslerinin saklanma süresini kısalt (KVKK).
-- Yeni sistemde limitler/beğeniler HESABA bağlıdır; IP sadece kısa süreli güvenlik kaydıdır.
update items set ip = null where ip is not null and created_at < (extract(epoch from now()) * 1000 - 2592000000);
delete from submission_log where ts < (extract(epoch from now()) * 1000 - 259200000);
-- eski (IP'ye bağlı) beğenileri geri döndürülemez şekilde takma adlandır; sayıları korunur
update likes set ip = 'h:' || md5('croshy-v1:' || ip) where ip not like 'u:%' and ip not like 'h:%';
-- eski ham IP'li "görüldü" kayıtlarını sil (sadece öneri sıralaması içindi)
delete from media_views where ip not like 'u:%' and ip not like 'h:%';
