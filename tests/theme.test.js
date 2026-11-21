require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../src/core');

test('GTA 6 teması: premium olmayan sıradan üye de seçebilir; diğer temalar kilitli kalır', () => {
  const member = core.allowedThemesFor({ badges: ['member'] }, 0);
  assert.ok(member.includes('gta'));
  for (const t of ['ocean', 'sunset', 'emerald', 'aurora', 'royal']) assert.ok(!member.includes(t), t + ' herkese açılmamalı');
  assert.ok(core.allowedThemesFor({ badges: [] }, 0).includes('gta'));
  assert.ok(core.allowedThemesFor({ badges: ['plus'] }, 0).includes('gta'));
  assert.deepEqual(core.FREE_THEMES, ['gta']);
});

test('tema kimliği çerez betiğinin kabul ettiği biçimde (yalnızca küçük harf)', () => {
  for (const t of core.FREE_THEMES) assert.match(t, /^[a-z]+$/);
});

test('GTA 6 teması CSS\'i tam palete sahip ve kök değişkenleri tanımlıyor', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
  const start = css.indexOf(':root.theme-gta {');
  assert.ok(start > 0, ':root.theme-gta yok');
  const block = css.slice(start, css.indexOf('}', start)).toLowerCase();
  // değişkenler: arka plan koyu, vurgu üçlüsü palette
  assert.match(block, /--accent-1:\s*#c9349b/);
  assert.match(block, /--accent-2:\s*#f36a78/);
  assert.match(block, /--accent-3:\s*#ffb458/);
  assert.match(block, /--bg-soft:\s*#3b146b/);
  // tüm palet (7 renk) temanın CSS'inde kullanılıyor
  const all = css.slice(css.indexOf('GTA 6 teması')).toLowerCase();
  for (const hex of ['#3b146b', '#7b208f', '#c9349b', '#f36a78', '#f87572', '#ff9b55', '#ffb458']) {
    assert.ok(all.includes(hex), 'palette eksik: ' + hex);
  }
});

test('profil sayfasında GTA 6 seçeneği herkese açık, 7 renkli önizleme ile', () => {
  const ejs = require('ejs');
  const html = ejs.render(fs.readFileSync(path.join(__dirname, '..', 'views', 'profile.ejs'), 'utf8'), {
    username: 'ayse', bio: '', BADGE_INFO: {}, BADGE_ORDER: [], badges: ['member'], createdAt: Date.now(), totalCount: 0, approvedCount: 0, pendingCount: 0, totalLikes: 0, items: [],
    limits: { imageBytes: 1, videoBytes: 1, videoDurationSec: 150, unlimited: false, premium: false }, hasCustomLimits: false, error: null, success: null, theme: null,
    renderName: (n) => n, premium: false, canThemes: false, allowedThemes: ['gta'], rewardExpiry: 0, avatarUrl: null, canGif: false,
    nameChange: { used: 0, remaining: 2, nextAt: null }, nameStyle: null, canStyleName: false,
  }, { filename: path.join(__dirname, '..', 'views', 'profile.ejs') });
  const gta = html.match(/<button[^>]*value="gta"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(gta, 'GTA seçeneği yok');
  assert.ok(!/disabled/.test(gta[0].split('>')[0]), 'GTA kilitli görünüyor');
  assert.equal((gta[0].match(/<span style="background:/g) || []).length, 7);
  const ocean = html.match(/<button[^>]*value="ocean"[^>]*>/)[0];
  assert.ok(/disabled/.test(ocean), 'Okyanus kilitli olmalı');
  assert.ok(html.includes('Diğer temalar'));
});
