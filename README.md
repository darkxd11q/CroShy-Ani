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
- 🔁 **Otomatik giriş ("beni hatırla")**: bir kere giriş yapınca 90 gün boyunca hatırlanır, bir sonraki ziyarette şifre istemeden otomatik giriş yapılır ve tik işaretli "Otomatik Giriş Yapıldı!" bildirimi gösterilir
- ✍️ Her anı için açıklama yazmak **zorunludur**
- 🎞️ Videolar için sınır (varsayılan 2:30, admin panelinden değiştirilebilir); daha uzun bir video seçilirse **başlangıç noktasını ve uzunluğu istediğin gibi** ayarlayabileceğin iki kaydırıcı çıkar (23 saniye, 1 dakika, 2 dakika… ne istersen)
- 🗓️ IP başına günde belirli sayıda anı gönderme limiti (varsayılan 2, admin panelinden değiştirilebilir)
- 📦 Fotoğraf/video boyutu sınırı — hem site geneli varsayılan hem **kullanıcıya özel** olarak admin panelinden ayarlanabilir; göndermeden önce tarayıcıda otomatik sıkıştırılır
- 🛡️ **İki farklı admin rolü**: Moderatör (sadece onay/red/IP yasaklama, IP adreslerini göremez) ve Süper Admin (tüm yetkiler — ayarlar, kullanıcı limitleri, IP görme/yasağı kaldırma)
- 👤 Modern, yeniden tasarlanmış profil sayfası: kendi anılarını görme/silme, "hakkımda" metni düzenleme, istatistikler, sınırların, şifre değiştirme
- 🔗 **Herkese açık profiller** (`/u/kullaniciadi`): galerideki her isme tıklayarak birinin paylaştığı onaylı anıları ve toplam beğenisini görebilirsin
- 🏅 **Rozetler** (süper admin panelinden verilir): 🏆 Site Kurucusu (sarı/lacivert) ve ❤️ CroShy (kırmızı/beyaz) rozeti sahibini **tüm sınırlardan** muaf tutar; ayrıca 👤 Üye, 🔥 Haftanın Aktifi, ⭐ Haftanın Beğenileni rozetleri — admin panelinde o haftanın en çok anı gönderen/en çok beğeni toplayan kullanıcıları gösteren bir liderlik tablosu bu rozetleri kime vereceğine karar vermene yardımcı olur
- ❤️ Herkese açık beğeni sistemi + Önerilen / En Yeni / En Eski / En Çok Beğenilen sıralaması
- 🧠 "Önerilen" akışı: önce hiç görmediğin anıları (en çok beğenilenden başlayarak), sonra gördüklerinin en yenisini gösterir
- 🚫 Admin panelinden kural dışı içerik gönderen IP'yi yasaklama / yasağı kaldırma
- 🖼️ Sol üstte kanal logon favicon ve site logosu olarak kullanılıyor
- 🔐 İsim + şifre ile admin girişi — brute-force kilidi, zamanlama saldırısına karşı korumalı karşılaştırma, güvenli oturum çerezleri
- 🚫 Havalı, temaya uygun 404 sayfası
- ✨ Havalı bir açılış (intro) animasyonu
- 🔗 Sağ üstteki sembole gelince (veya tıklayınca) YouTube, Discord, Kick, Twitch ve bağış linkinin olduğu bir menü açılır — hepsi gerçek marka logolarıyla
- 🎨 Modern koyu tema, Space Grotesk + Inter fontları

## 1. Cloudinary hesabı aç (medya depolama)

1. https://cloudinary.com/users/register_free adresinden ücretsiz hesap oluştur
   (kredi kartı istemez, ~25GB depolama + 25GB/ay trafik ücretsiz).
2. Dashboard sayfasında **Cloud Name**, **API Key**, **API Secret** bilgilerini kopyala.
3. Sol menüden **Settings → Upload → Upload presets → Add upload preset**
   - **Signing Mode**: `Unsigned` seç (tarayıcıdan doğrudan yükleme için gerekli)
   - İsmini not al (örn. `ani_defteri_unsigned`)
   - Kaydet.

## 2. Supabase projesi aç (veritabanı)

1. https://supabase.com adresinden ücretsiz hesap aç, **New project** ile bir
   proje oluştur (kredi kartı istemez; 500MB veritabanı ücretsiz ve kalıcıdır).
2. Proje hazır olunca sol menüden **SQL Editor → New query** aç, bu repodaki
   **`supabase-schema.sql`** dosyasının tüm içeriğini yapıştırıp **Run** de.
   Bu, gereken tabloları (`items`, `app_users`, `bans`, `submission_log`,
   `likes`, `media_views`, `remember_tokens`, `app_settings`) oluşturur.
   Daha önce eski bir sürümünü çalıştırdıysan endişelenme — script'i tekrar
   çalıştırmak güvenlidir, sadece eksik olan tabloları/sütunları ekler.
3. Sol menüden **Project Settings → API** sayfasına git:
   - **Project URL** → `.env` içindeki `SUPABASE_URL`
   - **service_role** anahtarı (⚠️ "anon" değil, "service_role" — gizli tut!)
     → `.env` içindeki `SUPABASE_SERVICE_ROLE_KEY`

## 3. Kurulum

Bu paket `.env` dosyasını senin verdiğin Cloudinary bilgileri, session secret ve
admin şifresiyle **hazır halde** içeriyor. Sadece **Supabase bilgilerini**
doldurman ve bağımlılıkları kurman yeterli:

```bash
npm install
```

`.env` dosyasını aç, en alttaki iki satırı kendi Supabase bilgilerinle değiştir:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

(`.env.example` dosyası, boş bir referans olarak ayrıca duruyor.)

## 4. Çalıştır

```bash
npm start
```

Site: http://localhost:3000
Admin panel: http://localhost:3000/admin — iki farklı admin hesabıyla girilebilir:
- **Moderatör**: `.env` içindeki `ADMIN_USERNAME` / `ADMIN_PASSWORD` — sadece anı
  onaylama, reddetme ve IP yasaklama yetkisi vardır; IP adreslerini göremez.
- **Süper Admin**: `.env` içindeki `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD`
  — tüm yetkilere sahiptir (IP'leri görme, yasağı kaldırma, genel ayarlar,
  kullanıcıya özel limitler).

## Nasıl çalışır?

- Bir ziyaretçi anı paylaşmak istediğinde önce `/register` ile kayıt olur ya
  da `/login` ile giriş yapar. Giriş yapmadan `/upload` sayfasına erişilemez
  (otomatik olarak `/login`'e yönlendirilir) ve `/api/submit` uç noktası da
  oturumsuz istekleri reddeder. Kullanıcı adları **benzersizdir** (aynı ismi
  iki kişi kullanamaz) ve **3-10 karakter** ile sınırlıdır.
- **Otomatik giriş**: Bir kere giriş yapan (admin ya da normal kullanıcı)
  tarayıcıya 90 günlük, hash'lenmiş bir "hatırlama" token'ı bırakılır.
  Oturum süresi (8 saat) dolsa bile bu token geçerliyse bir sonraki
  ziyarette sessizce yeni bir oturum açılır ve tik işaretli "Otomatik Giriş
  Yapıldı!" bildirimi gösterilir. Token her kullanımda yenilenir (tek
  kullanımlıktır); çıkış yapınca (Çıkış Yap butonu) hem oturum hem bu token
  geçersiz kılınır.
- Ziyaretçi `/upload` sayfasından fotoğraf/video seçer, **bir açıklama
  yazmak zorundadır** (boş bırakılamaz) → dosya tarayıcıdan doğrudan
  Cloudinary'e yüklenir → bağlantı bilgisi, oturumdaki kullanıcı adı ile
  birlikte Supabase'e `pending` (onay bekliyor) durumuyla kaydedilir.
- **Video süresi sınırlıdır (varsayılan 2 dakika 30 saniye, admin panelinden
  değiştirilebilir).** Seçilen video sınırdan uzunsa, yükleme sayfasında
  otomatik olarak iki kaydırıcı belirir: **başlangıç noktası** ve
  **uzunluk** — istersen 23 saniyelik, istersen 1 dakikalık, istersen
  sınıra kadar herhangi bir uzunlukta, videonun istediğin bölümünü
  seçebilirsin. Gönderim sırasında sadece o bölüm kırpılıp yüklenir.
  Sunucu, Cloudinary'nin döndürdüğü gerçek video süresini de ayrıca doğrular.
- **Her IP adresi günde belirli sayıda anı gönderebilir** (varsayılan 2,
  admin panelinden değiştirilebilir). Bu sayaç, öğe reddedilse/silinse bile
  sıfırlanmaz (ayrı bir gönderim kaydı tutulur).
- **Dosya boyutu**: varsayılan olarak fotoğraflar 8.5MB, videolar 40MB ile
  sınırlıdır — ama bunlar sabit değil: **admin panelinden hem site geneli
  varsayılan değerler hem de belirli bir kullanıcı için özel değerler**
  ayarlanabilir (örn. bir kullanıcıya 50MB video hakkı, bir diğerine
  varsayılan 40MB). Yükleme sayfası, göndermeden önce tarayıcıda otomatik
  olarak sıkıştırma dener (fotoğraf için Canvas tabanlı kalite/çözünürlük
  küçültme; video için desteklenen tarayıcılarda düşük bitrate ile yeniden
  kayıt — desteklenmeyen tarayıcılarda ya da başarısız olursa orijinal
  dosya olduğu gibi denenir).
  Sıkıştırma sonrası bile sınırı aşan dosyalar reddedilir. Sunucu, Cloudinary'nin
  döndürdüğü gerçek boyutu da ayrıca doğrular — client tarafı atlatılsa bile
  sınır korunur.
- Admin `/admin` panelinden bekleyenleri görür, **Onayla**, **Reddet** ya da
  **IP Yasakla** der. Bu üç işlem hem **moderatör** hem **süper admin**
  hesabıyla yapılabilir.
  - Onaylanan anı anında ana sayfa galerisinde görünür.
  - Reddedilen anı hem Supabase'den hem Cloudinary'den silinir.
  - **IP Yasakla**, o gönderiyi gönderen IP adresini kalıcı olarak yasaklar
    (aynı IP'den bekleyen diğer tüm gönderiler de otomatik temizlenir) ve o
    IP bir daha anı gönderemez — ta ki **süper admin** panelinden "Yasağı
    Kaldır" denene kadar. Yasak sadece gönderimi engeller, siteyi
    görüntülemeyi değil. **Moderatör hesabı IP adresini hiçbir zaman görmez**
    — sadece "IP Yasakla" butonuna basabilir, gerçek adres sunucu tarafında
    kalır ve response'da asla dönmez.
  - **Genel Ayarlar** ve **Kullanıcıya Özel Limitler** bölümleri (günlük
    limit, boyut/süre sınırları, yasaklı IP listesi/kaldırma) **sadece süper
    admin hesabına** görünür ve açıktır.
- **İki admin rolü**: `.env` içindeki `ADMIN_USERNAME`/`ADMIN_PASSWORD` ile
  giren **moderatör** kısıtlıdır (yalnızca onay/red/IP-yasaklama).
  `SUPERADMIN_USERNAME`/`SUPERADMIN_PASSWORD` ile giren **süper admin** tüm
  yetkilere sahiptir. İkisi de aynı `/admin/login` sayfasından, aynı isim+şifre
  güvenlik önlemleriyle (brute-force kilidi, genel hata mesajı) giriş yapar.
- Her kullanıcının kendine ait bir **`/profile`** sayfası vardır: "hakkımda"
  metnini düzenleyebilir, **kendi gönderdiği tüm anıları (bekleyen dahil)**
  küçük bir galeri halinde görüp istediğini **silebilir**, istatistiklerini
  (onaylı/bekleyen sayısı, toplam beğeni) ve kendisi için geçerli sınırları
  görür, şifresini değiştirebilir.
- **Herkese açık profiller**: ana sayfadaki her anının altında gönderenin adı
  bir bağlantıdır — tıklayınca `/u/kullaniciadi` adresinde o kişinin herkese
  açık profiline gidilir: kullanıcı adı, rozetleri, katılma tarihi, "hakkımda"
  metni (varsa), sadece **onaylı** anıları ve toplam beğenisi gösterilir.
  Bekleyen anılar, sınırlar ve IP gibi özel bilgiler bu sayfada asla görünmez.
- **Rozetler**: süper admin panelindeki "Rozetler" bölümünden bir kullanıcı
  adına şu rozetlerden biri verilebilir: 🏆 **Site Kurucusu**, ❤️ **CroShy**,
  👤 **Üye**, 🔥 **Haftanın Aktifi**, ⭐ **Haftanın Beğenileni**. İlk iki
  rozet (Site Kurucusu, CroShy) sahibini dosya boyutu, video süresi ve
  günlük gönderim limiti dahil **tüm sınırlardan tamamen muaf tutar** —
  profilinde bunun yerine "✨ sınırsız" bir bilgi kutusu görünür. Aynı
  bölümde son 7 günün en çok anı gönderen ve en çok beğeni toplayan
  kullanıcılarını gösteren bir liderlik tablosu vardır; bu tabloyu
  "Haftanın Aktifi"/"Haftanın Beğenileni" rozetini kime vereceğine karar
  vermek için referans olarak kullanabilirsin (rozetler otomatik verilmez,
  sen seçip verirsin). Rozetler hem kendi profilinde hem herkese açık
  profilinde renkli birer etiket olarak görünür.
- Ana sayfa `GET /api/approved?sort=algorithm|newest|oldest|likes` isteğinde
  onaylı anıları çeker. **Varsayılan ("Önerilen") akış**: önce o ziyaretçinin
  (IP bazlı) hiç görmediği anılar — aralarında en çok beğenilen önde — sonra
  görmediği kalmadıysa daha önce gördüklerinin en yenisi. Üstteki "Önerilen /
  En Yeni / En Eski / En Çok Beğenilen" butonlarıyla sıralama değiştirilebilir.
  Kartlar sırayla sola/sağa yaslanmış olarak bir zaman çizgisine yerleştirilir
  ve ekrana girdikçe (scroll ile) belirir; kart boyutu ekranda aynı anda ~2
  tanenin sığacağı şekilde ayarlanmıştır.
- Her kartın sağ altındaki kalp butonuyla herkes bir anıyı beğenebilir
  (IP başına 1 beğeni, tekrar tıklayınca geri alınır).
- Bir fotoğraf/videoya tıklandığında ortada büyüyerek açılan bir pencere (lightbox)
  gelir; videolar burada sesli ve kontrollerle oynatılır (küçük önizlemeler,
  tarayıcı kuralları gereği sessiz otomatik oynatılır — bu normaldir).
- Sağ üstteki sembole mouse ile gelince (veya tıklayınca — dokunmatik cihazlar
  için) YouTube, Discord, Kick, Twitch ve bağış linkinin olduğu bir menü açılır.

## Sorun Giderme

**"Sunucuda beklenmeyen bir hata oluştu" (özellikle admin girişi sonrası)**

Bu mesaj, sunucunun Supabase'e bir sorgu atıp başarısız olduğu her yerde
görünür (asıl hata sunucu konsoluna/loglarına yazılır, kullanıcıya sadece bu
genel mesaj gösterilir — güvenlik gereği). En sık sebepleri:

1. **`supabase-schema.sql` güncel değil.** Bu proje zaman içinde yeni tablolar
   (`remember_tokens`, `app_settings`) ve yeni sütunlar (`app_users` tablosuna
   `custom_image_bytes`, `bio` vb.) kazandı. Eğer Supabase SQL Editor'de bu
   dosyayı daha önce çalıştırdıysan ama en son güncellendikten sonra tekrar
   çalıştırmadıysan, sunucu var olmayan bir tabloya/sütuna sorgu atmaya
   çalışıp hata alır. **Çözüm**: `supabase-schema.sql`'in güncel halini
   SQL Editor'de tekrar çalıştır (tamamen güvenli, sadece eksikleri ekler).
2. **`.env` içindeki `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` yanlış veya
   eksik.** Project Settings > API sayfasından tekrar kontrol et; "anon" değil
   "service_role" anahtarını kullandığından emin ol.
3. **Supabase projesi duraklatılmış (paused).** Ücretsiz planda uzun süre
   kullanılmayan projeler otomatik duraklatılabilir; Supabase Dashboard'dan
   projeyi tekrar başlat.

Gerçek hatayı görmek için sunucunun çalıştığı terminaldeki (ya da Render'da
"Logs" sekmesindeki) çıktıya bak — `Sunucu hatası:` ile başlayan satır, asıl
Supabase/Postgres hata mesajını içerir.

## Veri nerede saklanıyor?

- **Medya** (fotoğraf/video dosyalarının kendisi): Cloudinary.
- **Her şeyin geri kalanı** (kullanıcılar, anı kayıtları/durumları, beğeniler,
  yasaklı IP'ler, günlük gönderim sayaçları, "görüldü" takibi, otomatik giriş
  token'ları): Supabase (Postgres).
- Sunucuda **hiçbir yerel dosya yazılmaz** — bu yüzden Render gibi platformların
  ücretsiz planında bile (kalıcı disk olmadan) veri kaybı yaşanmaz.

## Güvenlik

Hem admin girişi hem de normal kullanıcı girişi **kullanıcı adı + şifre**
ister ve şu korumalarla güçlendirilmiştir:

- **Brute-force kilidi**: aynı IP'den 15 dakika içinde 5 başarısız denemeden
  sonra o IP 15 dakika boyunca kilitlenir (admin ve kullanıcı girişleri için
  ayrı ayrı sayaçlar).
- **Zamanlama saldırısına karşı koruma**: kullanıcı adı sabit uzunluklu hash
  üzerinden (`crypto.timingSafeEqual`), şifre ise `bcrypt` ile karşılaştırılır.
- **Belirsiz hata mesajı**: "kullanıcı adı yanlış" / "şifre yanlış" ayrımı
  yapılmaz, ikisi için de aynı genel mesaj gösterilir.
- **Kullanıcı şifreleri hash'lenerek saklanır** (`bcrypt`, Supabase'de düz
  metin şifre asla tutulmaz).
- **Güvenli oturum çerezi**: `httpOnly`, `sameSite: strict` (CSRF koruması),
  canlı ortamda `secure` (sadece HTTPS), 8 saatte otomatik sona erme.
- **Oturum sabitleme koruması**: girişte/kayıtta oturum kimliği yeniden
  üretilir (`session.regenerate`).
- **Güvenlik başlıkları**: `helmet` ile clickjacking, MIME sniffing gibi
  yaygın saldırılara karşı ek HTTP başlıkları.
- **İstek sınırlama (rate limiting)**: giriş, kayıt ve anı gönderme uçları
  IP bazlı sınırlıdır.
- **Kaynak doğrulama**: `/api/submit`, yalnızca Cloudinary'nin kendi
  alan adından gelen medya bağlantılarını kabul eder.
- **Yükleme yalnızca giriş yapmış kullanıcılara açık**: `/upload` sayfası ve
  `/api/submit` uç noktası oturumsuz erişime tamamen kapalı; isim bilgisi
  formdan değil, her zaman oturumdan alınır (sahte isimle gönderim yapılamaz).
- **IP başına günlük gönderim limiti (2)** ve **admin panelinden IP yasaklama**
  spam/istismarı sınırlar.
- **Doğru IP tespiti**: `trust proxy` sadece üretimde (Render'ın tek katmanlı
  proxy'si arkasında, `NODE_ENV=production` ile) açılır. Yerelde kapalıdır —
  aksi halde herkes sahte bir `X-Forwarded-For` başlığıyla admin panelindeki
  IP'sini değiştirebilir, IP yasağını/günlük limiti atlatabilirdi.
- **Otomatik giriş ("beni hatırla") güvenliği**: ham token asla saklanmaz
  (sadece sha256 hash'i), çerez `httpOnly` + `sameSite: strict` + üretimde
  `secure`'dur, her kullanımda token yenilenir (rotasyon) ve çıkış yapınca
  hem oturum hem bu token geçersiz kılınır.
- **Supabase `service_role` anahtarı sadece sunucuda kullanılır**, tarayıcıya
  asla gönderilmez; bu yüzden Supabase tarafında ek bir "Row Level Security"
  politikası kurmana gerek yok — tüm erişim kontrolü zaten Express route'larında
  (`requireAdmin`, `requireUserApi` vb.) yapılıyor.

`.env` dosyanı, admin şifreni ve Supabase `service_role` anahtarını kimseyle
paylaşma. `.gitignore` zaten `.env` dosyasını Git'e eklemeyecek şekilde ayarlı.

## GitHub'a yükleme

1. Bu klasörde bir Git deposu başlat (eğer daha önce başlatmadıysan):
   ```bash
   git init
   git add .
   git commit -m "İlk sürüm: CroShy Anı"
   ```
   `.gitignore` sayesinde `.env` dosyası (tüm şifreler ve API anahtarları
   dahil) **asla** Git'e eklenmez — sırların GitHub'da görünmeyeceğinden
   emin olabilirsin.
2. GitHub'da yeni, boş bir repo oluştur (README/gitignore eklemeden).
3. Yerel depoyu o repoya bağlayıp gönder:
   ```bash
   git remote add origin https://github.com/KULLANICI_ADIN/REPO_ADIN.git
   git branch -M main
   git push -u origin main
   ```

## Render'da deploy etme

Bu proje artık tamamen **stateless** (hiçbir şey yerel diske yazmıyor, her şey
Cloudinary + Supabase'de), bu yüzden **kalıcı disk eklemene gerek yok** —
Render'ın ücretsiz planı yeterli.

**Yöntem A — Blueprint ile tek adımda (önerilen):**
Repoda hazır bir `render.yaml` var. Render Dashboard → **New** → **Blueprint**
→ GitHub reponu seç → Render servisi otomatik tanımlar. Sadece "sync: false"
işaretli ortam değişkenlerini (aşağıdaki liste) Render'ın sorduğu formda
dolduracaksın.

**Yöntem B — Manuel:**
1. Render Dashboard → **New** → **Web Service** → GitHub reponu bağla.
2. Build command: `npm install`
3. Start command: `npm start`
4. **Environment** sekmesinden şu değişkenleri ekle (`.env` dosyandakiyle aynı):
   `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
   `CLOUDINARY_UPLOAD_PRESET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Not:** Render'ın ücretsiz planı, bir süre trafik almayınca servisi
uyutur; ilk istekte birkaç saniye "uyanma" gecikmesi olabilir. Bu normaldir
ve verilerini etkilemez (veriler Supabase'de, Render'ın uyumasından bağımsız).

Deploy tamamlandıktan sonra: siten `https://SENIN-SERVIS-ADIN.onrender.com`
adresinde, admin paneli ise `.../admin` adresinde olur.

## Dosya yapısı

```
server.js               → Express backend, tüm rotalar
auth.js                 → şifre hash/karşılaştırma, brute-force koruması, rate limiter
supabaseClient.js       → Supabase istemcisi (tüm veri modülleri bunu kullanır)
supabase-schema.sql     → Supabase'de bir kere çalıştırılacak tablo oluşturma script'i
db.js                   → anı kayıtları (Supabase "items" tablosu)
users.js                → kullanıcı hesapları (Supabase "app_users" tablosu)
bans.js                 → yasaklı IP listesi (Supabase "bans" tablosu)
logs.js                 → IP başına günlük gönderim sayacı (Supabase "submission_log")
likes.js                → beğeniler (Supabase "likes" tablosu)
views_store.js          → ziyaretçi başına "görüldü" takibi (Supabase "media_views")
rememberTokens.js       → otomatik giriş token'ları (Supabase "remember_tokens")
settings.js             → site geneli ayarlar (Supabase "app_settings")
render.yaml             → Render Blueprint (tek adımda deploy tanımı)
protected/upload.html   → sadece giriş yapmış kullanıcıların erişebildiği yükleme sayfası
public/index.html       → ana sayfa + galeri
public/404.html         → özel 404 sayfası
public/img/             → favicon, marka rozeti, sosyal menü logoları
public/css/style.css    → tüm site stilleri
public/js/main.js       → açılış animasyonu + çapraz kaydırmalı galeri + sıralama/beğeni
public/js/lightbox.js   → tıklayınca medyayı büyütüp sesli oynatan ortak modül
public/js/social-menu.js→ sağ üstteki bağlantılar menüsü (hover + tıklama)
public/js/auto-login-badge.js → tik animasyonlu "Otomatik Giriş Yapıldı!" bildirimi
public/js/compress.js   → fotoğraf/video sıkıştırma + video süre tespiti/kırpma
public/js/upload.js     → giriş kontrolü, kota bilgisi, Cloudinary'e yükleme
public/js/admin.js      → admin onay/red/yasaklama/muafiyet işlemleri + medya büyütme
views/admin.ejs         → admin panel (onay/red/yasakla + yasaklı IP + boyut muafiyeti)
views/admin-login.ejs   → admin giriş ekranı
views/login.ejs         → kullanıcı giriş ekranı
views/register.ejs      → kullanıcı kayıt ekranı
views/profile.ejs       → kendi profilim (bio, anı galerisi+silme, sınırlar, şifre değiştirme)
views/public-profile.ejs→ herkese açık profil (/u/kullaniciadi)
```

## Notlar / geliştirme fikirleri

- Artık iki admin rolü var (moderatör + süper admin); üçüncü bir rol ya da
  daha ince yetkiler gerekirse `req.session.adminRole` mantığı `server.js`'de
  kolayca genişletilebilir.
- Video süresini sınırlamak istersen Cloudinary upload preset ayarlarından
  **Eager transformations** veya **Max video duration** kuralı ekleyebilirsin.
- `submission_log` ve `media_views` tabloları zamanla büyür; çok yoğun trafik
  olursa Supabase'de eski kayıtları temizleyen (örn. 30 günden eski) basit bir
  zamanlanmış SQL görevi (Supabase'in "Database → Cron Jobs" özelliği) eklenebilir.
- Profil sayfaları şimdilik metin/istatistik odaklı; ileride profil fotoğrafı
  yükleme (Cloudinary ile), takip sistemi gibi özellikler eklenebilir.
