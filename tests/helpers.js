// Testler gerçek veritabanına/ağa bağlanmaz: sahte (kullanılmayan) adresler kullanır.
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.ADMIN_USERNAME = 'testmod';
process.env.ADMIN_PASSWORD = 'testpass';
process.env.SUPERADMIN_USERNAME = 'testsuper';
process.env.SUPERADMIN_PASSWORD = 'testsuperpass';
process.env.CLOUDINARY_CLOUD_NAME = 'c';
process.env.CLOUDINARY_API_KEY = 'k';
process.env.CLOUDINARY_API_SECRET = 'secret';
process.env.SESSION_SECRET = 'test';
