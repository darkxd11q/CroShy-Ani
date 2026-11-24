// GÜNCELLEME DUYURULARI — yeni bir güncelleme geldiğinde BU DİZİNİN SONUNA yeni bir giriş ekle.
// Her kişi, siteye güncellemeden sonraki İLK girişinde bunu bir kez görür (hesabı varsa bir kez, tüm cihazlarda).
//
// Her slayt = bir özellik. aura: o özelliğe özgü renk/animasyon (aşağıdaki AURAS listesinden):
//   bookmark (üstten düşen), chat (balon gibi yükselen), draft (yana kayan), search (radar), bell (patlayan), spark (genel)
// particles: o slaytın arka planında uçuşan emojiler. short: üstteki menüde görünen kısa ad.
const AURAS = ['bookmark', 'chat', 'draft', 'search', 'bell', 'spark'];

const RELEASES = [
  {
    id: '2026-11-b',
    title: 'DEV GÜNCELLEME GELDİ! 🚀',
    subtitle: 'CroShy Anı bu hafta sonu resmen seviye atladı. 5 durak, hepsi bomba 💣',
    slides: [
      {
        id: 'koleksiyon', short: 'Koleksiyon', emoji: '🔖', aura: 'bookmark', particles: ['🔖', '✨', '📌'],
        title: 'KOLEKSİYONLAR: Anılar artık RAFTA!',
        text: 'Favoriler, Komik Anlar, Yaz Tatili… 20 özel listeye kadar, sadece sana görünür. Beğeniyle yetinen devir kapandı!',
        bullets: ['🔖 Her anıda tek tuşla kaydet', '📌 Profilinde VİTRİN ANISI: ziyaretçi önce gözbebeğini görür'],
      },
      {
        id: 'sohbet', short: 'Sohbet', emoji: '💬', aura: 'chat', particles: ['💬', '😂', '🔥', '👏', '🎉'],
        title: 'YORUMLAR artık tam bir SOHBET!',
        text: 'Yanıtla, zincir kur, anı sahibi en efsane yorumu 📌 tepeye çaksın. 16 emojili tepki seçici geldi; kartın köşesinde en çok verilen 2 emoji parlıyor.',
        bullets: ['↩ Yorum zinciri + 📌 sabit yorum', '😊 Bir tuşla tepki seçici', '⚡ Bir anıya tıkla → yorumlar & tepkiler DİREKT karşında'],
      },
      {
        id: 'taslak', short: 'Taslak', emoji: '📝', aura: 'draft', particles: ['📝', '✏️', '🏷️'],
        title: 'TASLAKLAR + ETİKETLER = kusursuz paylaşım',
        text: 'Hakkın mı bitti? Hazırla, taslağa at, sonra bas yayınla! Her anıya en az 1 etiket — sık kullanılanlar gerçek topluluktan geliyor.',
        bullets: ['💾 Taslak günlük hakkından düşmez', '🏷️ Etiketi seç ya da kendin yaz'],
      },
      {
        id: 'kesif', short: 'Keşfet', emoji: '🔍', aura: 'search', particles: ['🔍', '#️⃣', '📅', '🎁'],
        title: 'KEŞİF MODU: sonuna kadar AÇIK',
        text: 'Kişi, #etiket, açıklama… hepsini ara. Trend etiketler, "Geçen yıl bugün" şeridi ve sana özel paylaşılabilir YIL ÖZETİ kartı seni bekliyor!',
        bullets: ['🔍 Anında arama', '📅 Geçen yıl bugün nostaljisi', '🎁 Yıl özetin: hikayende paylaş'],
      },
      {
        id: 'bildirim', short: 'Bildirim', emoji: '📲', aura: 'bell', particles: ['📲', '🔔', '🌴', '🌅'],
        title: 'Telefonuna BİLDİRİM + GTA 6 TEMASI 🌴',
        text: 'Ana ekrana ekle; onay, yorum, etiket bildirimleri anında cebinde. Herkese açık GTA 6 gün batımı teması profilinde seni bekliyor!',
        bullets: ['📲 Cihaz başına aç/kapat (çanın içinden)', '🌴 Profil → Görünüm → GTA 6', '🔑 Şifreni mi unuttun? Kurtarma kodlarıyla e-postasız kurtar'],
      },
    ],
  },
];

const LATEST = RELEASES[RELEASES.length - 1];
module.exports = { RELEASES, LATEST, AURAS };
