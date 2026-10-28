// Giriş noktası: önce veritabanı güncellemelerini uygular, sonra dinlemeye başlar.
const app = require('./src/app');
const { runMigrations } = require('./src/migrate');
const { startJobs } = require('./src/jobs');

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await Promise.race([
      runMigrations(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('zaman aşımı (30 sn)')), 30 * 1000)),
    ]);
  } catch (e) {
    console.error('Veritabanı güncellemesi çalıştırılamadı:', e.message);
  }

  app.listen(PORT, () => {
    console.log(`✨ CroShy Anı http://localhost:${PORT} adresinde çalışıyor`);
    startJobs();
  });
}

main();
