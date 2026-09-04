# CroShy Anı 📸

Fotoğraf/kısa video paylaşım sitesi. Herkes anı ekleyebilir, admin onaylayana kadar
sitede görünmez. Ana sayfada onaylı anılar, ekranda aynı anda en fazla **2 tane**
görünecek şekilde, yukarıdan aşağıya **çapraz (zigzag)** bir zaman çizgisinde
sıralanır; aşağı kaydırdıkça sırayla belirir.

**Mimari**: medya (fotoğraf/video) Cloudinary'de, tüm metin verisi (kullanıcılar,
anılar, beğeniler, yasaklar) Supabase'de (Postgres) tutulur. Sunucu tamamen
"stateless" — hiçbir şey yerel diske yazılmaz, bu yüzden Render'ın ücretsiz
planında bile veri kaybı yaşanmaz.

## Özellikler

- 🎬 Fotoğraf + kısa video yükleme (sürükle-bırak)
- ☁️ **Cloudinary** üzerinden ücretsiz, yüksek kapasiteli (25GB) medya depolama
- 🗄️ **Supabase** üzerinden ücretsiz, kalıcı Postgres veritabanı (kullanıcılar, anılar, beğeniler...)
- ✅ Onay akışı: kullanıcı gönderir → admin panelde bekler → onaylanır/reddedilir
- 🖼️ Çapraz (zigzag) kaydırmalı zaman çizgisi galerisi, aynı anda max 2 medya görünür
- 🔎 Fotoğraf/videoya tıklayınca büyüyüp ortada, sesli/kontrollü şekilde açılır (lightbox)
- 👤 Anı gönderebilmek için kullanıcı adı (3-10 karakter, benzersiz) + şifre ile kayıt/giriş zorunlu
- 🗓️ IP başına günde en fazla **2** anı gönderme limiti
- 📦 Fotoğraf **8.5MB**, video **40MB** boyut sınırı — göndermeden önce tarayıcıda otomatik sıkıştırılır
- ✨ Admin panelinden istediğin kullanıcının boyut sınırını kaldırma/geri getirme
- ❤️ Herkese açık beğeni sistemi + Önerilen / En Yeni / En Eski / En Çok Beğenilen sıralaması
- 🧠 "Önerilen" akışı: önce hiç görmediğin anıları (en çok beğenilenden başlayarak), sonra gördüklerinin en yenisini gösterir
- 🚫 Admin panelinden kural dışı içerik gönderen IP'yi yasaklama / yasağı kaldırma
- 🖼️ Sol üstte kanal logon favicon ve site logosu olarak kullanılıyor
- 🔐 İsim + şifre ile admin girişi — brute-force kilidi, zamanlama saldırısına karşı korumalı karşılaştırma, güvenli oturum çerezleri
- 🚫 Havalı, temaya uygun 404 sayfası
- ✨ Havalı bir açılış (intro) animasyonu
- 🔗 Sağ üstteki sembole gelince (veya tıklayınca) YouTube, Discord, Kick, Twitch ve bağış linkinin olduğu bir menü açılır — hepsi gerçek marka logolarıyla
- 🎨 Modern koyu tema, Space Grotesk + Inter fontları