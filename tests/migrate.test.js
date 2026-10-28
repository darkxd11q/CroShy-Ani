require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runMigrations } = require('../src/migrate');

function fakeClient({ applied = [], failOn = null } = {}) {
  const log = [];
  return {
    log,
    connect: async () => {},
    end: async () => {},
    query: async (sql, params) => {
      log.push(String(sql).split('\n')[0].slice(0, 60));
      if (/select name from schema_migrations/.test(sql)) return { rows: applied.map((name) => ({ name })) };
      if (failOn && sql.includes(failOn)) throw new Error('boom');
      return { rows: [] };
    },
  };
}

test('migrations: gerçek dosyalar sırayla uygulanır, uygulanmış olanlar atlanır', async () => {
  const c = fakeClient({ applied: ['001_base.sql'] });
  const r = await runMigrations({ createClient: () => c });
  const all = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(r.applied, all.filter((f) => f !== '001_base.sql'));
  assert.ok(r.applied.includes('004_privacy.sql'));
  assert.ok(c.log.some((l) => l.startsWith('commit')));
});

test('migrations: hata olursa rollback yapılır ve durur', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  fs.writeFileSync(path.join(dir, '001_a.sql'), 'select 1;');
  fs.writeFileSync(path.join(dir, '002_b.sql'), 'select BOOM;');
  fs.writeFileSync(path.join(dir, '003_c.sql'), 'select 3;');
  const c = fakeClient({ failOn: 'BOOM' });
  await assert.rejects(runMigrations({ createClient: () => c, dir }), /002_b\.sql/);
  assert.ok(c.log.some((l) => l.startsWith('rollback')));
  assert.ok(!c.log.some((l) => l.includes('select 3')), '003 çalıştırılmamalı');
});

test('migrations: DATABASE_URL yoksa atlanır', async () => {
  delete process.env.DATABASE_URL;
  const r = await runMigrations();
  assert.equal(r.skipped, true);
});

test('migration dosyaları: numaralı ve boş değil', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter((f) => f.endsWith('.sql'));
  assert.ok(files.length >= 3);
  for (const f of files) assert.match(f, /^\d{3}_/);
});
