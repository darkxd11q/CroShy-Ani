# CroShy Anı 📸

Topluluğun fotoğraf ve kısa videolarla anılarını paylaştığı, modern ve güvenli
bir anı sitesi. Paylaşılan her anı yayına girmeden önce incelenir; site
tamamen üye tabanlı çalışır ve herkesin kendi profili vardır.

## Özellikler

**Anı paylaşımı**
- Fotoğraf ve kısa video paylaşımı, sürükle-bırak ile kolay yükleme
- Her anıya kısa bir açıklama eklenir
- Videolar belirli bir süreyle sınırlıdır; daha uzun bir video seçildiğinde
  hangi bölümünün paylaşılacağını kendin seçebileceğin bir kırpma aracı
  otomatik açılır
- Yüklenen fotoğraf/video, sınırları aşmayacak şekilde kaliteden çok
  ödün vermeden otomatik sıkıştırılır

**Keşif ve etkileşim**
- Akış; önce görmediğin yeni anıları, sonra daha önce gördüklerini gösterecek
  şekilde akıllıca sıralanır — istersen En Yeni / En Eski / En Çok Beğenilen
  sıralamasına da geçebilirsin
- Anılar sayfada çapraz, akıcı bir zaman çizgisinde belirir
- Beğeni sistemi
- Fotoğraf/videoya tıklayınca büyüyüp sesli/kontrollü şekilde açılır

**Hesaplar ve profiller**
- Kullanıcı adı + şifre ile kayıt ve giriş; bir kere giriş yaptıktan sonra
  tarayıcın seni hatırlar, tekrar şifre girmene gerek kalmaz
- Herkesin kendine ait, düzenlenebilir bir profili vardır: kısa bir
  "hakkımda" metni, paylaştığı anıların galerisi, istatistikleri
- Diğer kullanıcıların herkese açık profillerini görüntüleyebilir, o kişinin
  paylaştığı anıları ve topladığı beğenileri görebilirsin
- Rozet sistemi — kayıt olan herkes bir rozet kazanır, bazı özel rozetler sahibine ekstra ayrıcalıklar tanır
- **ÖZEL** ve **Plus** üyelik — özel kodlarla açılan premium roller: daha yüksek yükleme sınırları, günlük daha fazla paylaşım, ekstra renk temaları ve kişiye özel bir karşılama deneyimi
- Herkes kendine özel **profil fotoğrafı** ekleyebilir (yuvarlak alan sürükle-yakınlaştır ile ayarlanır, yüklenmeden önce kalite bozulmadan sıkıştırılır); ÖZEL ve Plus üyeler **GIF** profil fotoğrafı da kullanabilir
- Ana sayfadan tek tıkla giriş yapma / kayıt olma, "beni hatırla" ile 3 aya kadar otomatik giriş
- **Haftanın Aktifi** ve **Haftanın Beğenileni** rozetleri her Cuma 17:15'te otomatik verilir; kazananı havalı bir kutlama ekranı karşılar ve 15 gün boyunca 2 ekstra tema kazanır
- Sağ alttaki **geri bildirim** düğmesiyle fikir ve önerilerini ekibe iletebilirsin; katkın değerlendirilirse sana özel bir teşekkür ekranı karşılar
- Kullanıcı adını 14 günde 2 kez değiştirebilirsin; ÖZEL, Plus ve haftalık rozet sahipleri adlarını harf harf ya da hazır gradyanlarla renklendirebilir
- Sonsuz kaydırma: anılar sayfa sayfa yüklenir; videolar yalnızca ekrandayken oynar, görseller otomatik küçültülür
- Her anının **paylaşılabilir bir sayfası** (`/m/...`) vardır: yorumlar, emoji tepkileri, paylaş düğmesi ve sosyal medya önizlemesi
- `#etiket` ile anıları filtrele, `@kullanıcı` ile birini etiketle; 🎲 Rastgele Anı butonu
- 🔔 Bildirim çanı: anın onaylandığında/reddedildiğinde (nedeniyle), yorum, beğeni, tepki ve etiketlerde haber alırsın
- Beğeniler ve günlük paylaşım hakları **hesaba** bağlıdır (ortak internet bağlantısı kullanan arkadaşlar birbirini etkilemez)
- KVKK: gizlilik, kullanım şartları ve çerez sayfaları; profilinden verilerini indirebilir ya da hesabını kalıcı silebilirsin
- Yanlışlıkla silinen bir anı, kısa bir süre içinde geri getirilebilir

**Tasarım**
- Modern, koyu temalı; Space Grotesk ve Inter fontları
- Havalı bir açılış animasyonu
- Sağ üstteki menüden sosyal medya ve topluluk bağlantılarına ulaşılır
- Temaya uygun özel bir 404 sayfası

**Güvenlik**
- Şifreler hash'lenerek saklanır, kaba kuvvet saldırılarına karşı giriş
  denemeleri sınırlıdır
- Oturumlar güvenli, HTTPS destekli çerezlerle yönetilir
- İçerik denetimi: her paylaşım yayına girmeden önce incelenir

## Teknolojiler

- **Node.js / Express** — sunucu
- **Cloudinary** — fotoğraf ve video depolama
- **Supabase (Postgres)** — kullanıcılar, anılar, beğeniler ve site verisi
- **EJS** — sunucu taraflı şablonlar

## Kurulum

### 1. Cloudinary hesabı

[cloudinary.com](https://cloudinary.com/users/register_free) üzerinden
ücretsiz bir hesap aç ve Dashboard'dan **Cloud Name**, **API Key**,
**API Secret** bilgilerini al. Ardından **Settings → Upload → Upload
presets** kısmından **Signing Mode: Unsigned** olan bir preset oluştur.

### 2. Supabase projesi

[supabase.com](https://supabase.com) üzerinden ücretsiz bir proje oluştur.
Proje hazır olunca **SQL Editor**'e girip bu repodaki `supabase-schema.sql`
dosyasının tamamını çalıştır — gereken tüm tabloları bir kerede oluşturur.
**Project Settings → API** sayfasından **Project URL** ve **service_role**
anahtarını al.

### 3. Ortam değişkenleri

`.env.example` dosyasını `.env` olarak kopyala ve içindeki değerleri kendi
bilgilerinle doldur.

### 3.1. Veritabanı güncellemeleri (otomatik)

`.env` içine Supabase'in **Database → Connection string** adresini `DATABASE_URL` olarak eklersen,
sunucu açılışta `migrations/` klasöründeki güncellemeleri kendisi uygular (elle SQL çalıştırmana gerek kalmaz).
Haftalık rozetler de veritabanında (`pg_cron`) çalıştığı için sunucu uyuyor olsa bile Cuma 17:15'te dağıtılır.
`DATABASE_URL` vermezsen `supabase-schema.sql` dosyasını SQL Editor'de elle çalıştırman yeterlidir.

### 4. Çalıştırma

```bash
npm install
npm start
```

Site `http://localhost:3000` adresinde çalışmaya başlar.

## Yayına alma

Proje [Render](https://render.com) gibi Node.js destekleyen herhangi bir
platformda çalışacak şekilde tasarlanmıştır ve tamamen "stateless"tir (hiçbir
veri yerel diske yazılmaz — her şey Cloudinary ve Supabase'de tutulur).

1. Projeyi bir GitHub reposuna yükle (`.env` dosyası `.gitignore` sayesinde
   depoya dahil edilmez).
2. Render Dashboard'da **New → Blueprint** ile reponu seç; repodaki
   `render.yaml` servisi otomatik tanımlar.
3. İstenen ortam değişkenlerini (Cloudinary ve Supabase bilgilerin) doldur.

Deploy tamamlandığında siten `https://servis-adin.onrender.com` adresinde
yayında olur.

## Testler

```bash
npm test        # birim + rota testleri
npm i           # (jsdom geliştirme bağımlılığı için)
npm run test:ui # ana sayfa / anı sayfası / çan arayüz testleri
```
