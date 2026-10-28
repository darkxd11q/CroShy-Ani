// Gizlilik / KVKK, Kullanım Şartları, Çerez Politikası metinleri.
// NOT: Bu metinler genel bir şablondur; yayına almadan önce bir hukuk danışmanına gözden geçirtmeni öneririz.
const UPDATED = '1 Kasım 2026';

module.exports = {
  gizlilik: {
    title: 'Gizlilik ve KVKK Aydınlatma Metni',
    updated: UPDATED,
    intro: 'CroShy Anı olarak kişisel verilerini 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında, şeffaf ve yalnızca gerektiği kadar işliyoruz. Bu metin hangi verileri, neden ve ne kadar süreyle işlediğimizi anlatır.',
    sections: [
      { h: 'Veri sorumlusu', p: ['CroShy Anı sitesinin yöneticisi, KVKK kapsamında veri sorumlusudur. Bize sitedeki "Geri Bildirim" düğmesinden ulaşabilirsin.'] },
      {
        h: 'Hangi verileri işliyoruz?',
        ul: [
          'Hesap bilgileri: kullanıcı adı, şifrenin geri döndürülemez özeti (şifreni asla düz metin olarak saklamayız), kayıt tarihi, profil bilgileri (hakkımda yazısı, profil fotoğrafı, tema ve isim rengi tercihleri).',
          'Paylaştıkların: fotoğraf/video, açıklama, etiketler, yorumlar, tepkiler, beğeniler ve geri bildirimler.',
          'Teknik veriler: IP adresi ve oturum bilgileri (yalnızca güvenlik ve kötüye kullanımı önleme amacıyla).',
          'Bildirimler ve rozet/ödül kayıtların.',
        ],
      },
      {
        h: 'Amaçlar ve hukuki sebepler',
        ul: [
          'Hesabını oluşturmak ve siteyi sunmak (sözleşmenin kurulması ve ifası).',
          'Güvenliği sağlamak, spam ve kötüye kullanımı önlemek (meşru menfaat).',
          'Yasal yükümlülüklerin yerine getirilmesi.',
        ],
      },
      { h: 'Verilerin aktarıldığı taraflar', p: ['Siteyi çalıştırmak için şu hizmet sağlayıcıları kullanırız: Supabase (veritabanı), Cloudinary (fotoğraf/video depolama) ve Render (barındırma). Bu sağlayıcıların sunucuları yurt dışında olabilir; aktarım KVKK madde 9 çerçevesinde yapılır. Verilerini reklam amacıyla üçüncü kişilerle paylaşmayız veya satmayız.'] },
      {
        h: 'Saklama süreleri',
        ul: [
          'IP adresleri en fazla 30 gün tutulur, sonra silinir. Günlük paylaşım kayıtları 3 gün sonra silinir.',
          'Silinen anılar 24 saat boyunca geri alınabilir bekletilir, sonra kalıcı olarak silinir.',
          'Hesabını silersen kişisel verilerin ve paylaştığın içerikler kalıcı olarak silinir.',
        ],
      },
      {
        h: 'Haklarını nasıl kullanırsın? (KVKK madde 11)',
        p: ['Verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltme, silme ve itiraz haklarına sahipsin.'],
        ul: ['Profil sayfandaki "Verilerimi indir" ile verilerinin kopyasını alabilirsin.', 'Profil sayfandaki "Hesabımı sil" ile hesabını ve içeriklerini kalıcı olarak silebilirsin.', 'Diğer talepler için "Geri Bildirim" düğmesini kullanabilirsin.'],
      },
      { h: 'Çocukların gizliliği', p: ['Site 13 yaşından küçük çocuklara yönelik değildir. 13 yaşından küçük birinin hesap açtığını fark edersek hesabı sileriz.'] },
    ],
  },
  kosullar: {
    title: 'Kullanım Şartları',
    updated: UPDATED,
    intro: 'CroShy Anı\'nı kullanarak aşağıdaki şartları kabul etmiş olursun.',
    sections: [
      { h: 'Hesabın', p: ['Hesabından ve şifrenden sen sorumlusun. Şifreni kimseyle paylaşma. Başkası adına hesap açma ve başkasını taklit etme.'] },
      {
        h: 'İçerik kuralları',
        ul: [
          'Yasa dışı, nefret söylemi içeren, taciz eden, müstehcen veya şiddeti öven içerik paylaşma.',
          'Başkalarının telif haklarını, kişilik haklarını ve gizliliğini ihlal eden içerik paylaşma. Başkasının rızası olmadan onun kişisel bilgilerini/fotoğrafını paylaşma.',
          'Spam yapma, sistemi kötüye kullanmaya veya yetki dışı erişmeye çalışma.',
        ],
      },
      { h: 'Moderasyon', p: ['Paylaşımlar yayına girmeden önce incelenir. Kurallara aykırı içerikleri reddetme/kaldırma, hesapları kısıtlama veya kapatma hakkımızı saklı tutarız. Bir içerik reddedildiğinde nedeni sana bildirim olarak gösterilir.'] },
      { h: 'İçeriğin ve lisans', p: ['Paylaştığın içeriğin sahibi sensin. İçeriği sitede göstermemiz, saklamamız ve (profilinde/paylaşım bağlantılarında) sunmamız için bize sınırlı, münhasır olmayan bir kullanım izni vermiş olursun. Bu izin, içeriğini sildiğinde sona erer.'] },
      { h: 'ÖZEL, Plus ve diğer roller', p: ['Kodla kazanılan roller kişiye özeldir, devredilemez ve satılamaz; bazıları süreli olabilir. Roller ve ayrıcalıklar önceden haber verilerek değiştirilebilir. Kodlar tek kullanımlıktır ve 1 gün geçerlidir.'] },
      { h: 'Sorumluluk', p: ['Site "olduğu gibi" sunulur; kesintisiz çalışacağı garanti edilmez. Kullanıcıların paylaştığı içeriklerden ilgili kullanıcı sorumludur.'] },
      { h: 'Değişiklikler', p: ['Bu şartlar zaman zaman güncellenebilir. Güncel hali her zaman bu sayfadadır.'] },
    ],
  },
  cerezler: {
    title: 'Çerez Politikası',
    updated: UPDATED,
    intro: 'CroShy Anı yalnızca siteyi çalıştırmak için gerekli çerezleri kullanır. Reklam, analiz veya takip çerezi kullanmayız.',
    sections: [
      {
        h: 'Kullandığımız çerezler',
        table: [
          ['croshy.sid', 'Oturumunu açık tutar', '8 saat (oturum)', 'Zorunlu'],
          ['croshy_remember', '"Beni hatırla" dediysen seni otomatik giriş yaptırır', '90 gün', 'Yalnızca işaretlersen'],
          ['croshy_theme', 'Seçtiğin site temasını hatırlar', '1 yıl / ödül süresi', 'Tercih'],
          ['croshy_next', 'Giriş sonrası geldiğin sayfaya döndürür', '15 dakika', 'Zorunlu'],
          ['croshy_cookie_ok', 'Bu bildirimi tekrar göstermemek için', '1 yıl', 'Tercih'],
        ],
      },
      { h: 'Üçüncü taraflar', p: ['Fotoğraf ve videolar Cloudinary üzerinden yüklenir; tarayıcın bu medyaları getirmek için Cloudinary sunucularına istek yapar.'] },
      { h: 'Çerezleri yönetme', p: ['Tarayıcı ayarlarından çerezleri silebilir veya engelleyebilirsin; ancak zorunlu çerezleri engellersen giriş yapamazsın.'] },
    ],
  },
};
