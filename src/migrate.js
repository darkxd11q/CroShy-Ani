// Otomatik veritabanı güncellemeleri: migrations/*.sql dosyalarını sırayla, her
// birini yalnızca bir kez uygular (schema_migrations tablosunda takip eder).
// Böylece "SQL'i elle çalıştırmayı unuttum → sunucu hatası" dönemi biter.
// DATABASE_URL (Supabase > Project Settings > Database > Connection string) gerekir;
// tanımlı değilse atlanır ve eski usul (elle) devam edilir.
const fs = require('fs');
const path = require('path');

const LOCK_KEY = 7190001;

async function runMigrations({ createClient, dir } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url && !createClient) {
    console.warn('ℹ️  DATABASE_URL tanımlı değil — veritabanı güncellemeleri otomatik uygulanmayacak (supabase-schema.sql dosyasını elle çalıştırabilirsin).');
    return { skipped: true, applied: [] };
  }

  const migrationsDir = dir || path.join(__dirname, '..', 'migrations');
  const client = createClient
    ? createClient()
    : new (require('pg').Client)({ connectionString: url, ssl: { rejectUnauthorized: false } });

  const applied = [];
  await client.connect();
  try {
    // Aynı anda birden fazla örnek açılırsa sırayla çalışsın
    try {
      await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    } catch {}

    await client.query('create table if not exists schema_migrations (name text primary key, applied_at bigint not null)');
    const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(migrationsDir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();

    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (name, applied_at) values ($1, $2)', [f, Date.now()]);
        await client.query('commit');
        applied.push(f);
        console.log('✅ Veritabanı güncellemesi uygulandı:', f);
      } catch (e) {
        try {
          await client.query('rollback');
        } catch {}
        throw new Error(`Migration ${f} başarısız: ${e.message}`);
      }
    }
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
    } catch {}
    try {
      await client.end();
    } catch {}
  }
  return { skipped: false, applied };
}

module.exports = { runMigrations };
