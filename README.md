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
- Rozet sistemi — bazı özel rozetler sahibine ekstra ayrıcalıklar tanır

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
