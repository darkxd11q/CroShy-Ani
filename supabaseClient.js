const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '⚠️  SUPABASE_URL ve/veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil (.env dosyasını kontrol et). ' +
      'Veritabanı işlemleri çalışana kadar hata dönecektir.'
  );
}

// service_role anahtarı SADECE sunucuda kullanılır, tarayıcıya asla gönderilmez.
// Bu yüzden Row Level Security politikaları önemli değil — tüm erişim kontrolü
// zaten bizim Express route'larımızda (requireAdmin, requireUserApi vb.) yapılıyor.
//
// Not: createClient, geçersiz bir URL formatı verilirse SENKRON olarak fırlatır
// (process'i çökertir). Yapılandırma eksikse bile sunucunun ayağa kalkabilmesi
// (ve statik sayfaların/health-check'in çalışabilmesi) için geçerli formatta
// ama işe yaramaz bir placeholder URL kullanıyoruz — gerçek istekler yine de
// anlamlı bir hatayla (fetch failed) başarısız olur ve asyncRoute bunu yakalar.
const safeUrl = supabaseUrl || 'https://not-configured.supabase.co';
const safeKey = supabaseKey || 'not-configured';

const supabase = createClient(safeUrl, safeKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = supabase;
