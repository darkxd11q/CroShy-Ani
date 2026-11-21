require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const listeners = {};
  const shown = [];
  const opened = [];
  const self = {
    addEventListener: (t, f) => (listeners[t] = f),
    skipWaiting() {},
    location: { origin: 'https://site.test' },
    registration: { showNotification: async (t, o) => shown.push([t, o]) },
    clients: { claim() {}, matchAll: async () => [], openWindow: async (u) => opened.push(u) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8'), { self, URL });
  return { listeners, shown, opened };
}
const run = async (fn, ev) => { const waits = []; fn({ ...ev, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };

test('service worker: push bildirimi gösterir', async () => {
  const { listeners, shown } = load();
  await run(listeners.push, { data: { json: () => ({ title: 'T', body: 'Anın onaylandı', url: '/m/1', tag: 'approved' }) } });
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], 'T');
  assert.equal(shown[0][1].body, 'Anın onaylandı');
  assert.equal(shown[0][1].data.url, '/m/1');
  assert.equal(shown[0][1].tag, 'approved');
  await run(listeners.push, { data: { json: () => { throw new Error('bozuk'); }, text: () => 'düz metin' } });
  assert.equal(shown[1][1].body, 'düz metin'); // JSON olmayan yük de gösterilir
});

test('service worker: tıklamada yalnızca AYNI siteye gider (dış adres → ana sayfa)', async () => {
  const { listeners, opened } = load();
  const click = (url) => run(listeners.notificationclick, { notification: { close() {}, data: { url } } });
  await click('/m/42#comments');
  await click('https://evil.example/phish');
  await click('//evil.example/x');
  assert.deepEqual(opened, ['/m/42#comments', '/', '/']);
});
