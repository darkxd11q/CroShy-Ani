// Yönetici işlem kaydı: kim, ne zaman, neyi yaptı. Kayıt yazmak asıl işlemi ASLA bozmaz.
const supabase = require('../supabaseClient');

const LABELS = [
  [/\/approve\//, 'Anıyı onayladı'],
  [/\/reject\//, 'Anıyı reddetti'],
  [/\/delete-approved\//, 'Yayındaki anıyı kaldırdı'],
  [/\/restore\//, 'Silinen anıyı geri aldı'],
  [/\/api\/admin\/ban\//, 'Anı sahibini yasakladı'],
  [/\/unban$/, 'IP yasağını kaldırdı'],
  [/\/settings$/, 'Genel ayarları değiştirdi'],
  [/\/user-limits\/reset$/, 'Kullanıcı limitini sıfırladı'],
  [/\/user-limits$/, 'Kullanıcıya özel limit tanımladı'],
  [/\/badges\/grant$/, 'Rozet verdi'],
  [/\/badges\/revoke$/, 'Rozeti geri aldı'],
  [/\/redeem-codes\/create$/, 'Rozet kodu oluşturdu'],
  [/\/feedback\//, 'Geri bildirimi değerlendirdi'],
  [/\/users\/rename$/, 'Kullanıcı adını değiştirdi'],
  [/\/users\/delete$/, 'Hesabı sildi'],
  [/\/users\/ban$/, 'Hesabı yasakladı / yasağı kaldırdı'],
  [/\/users\/reset-password$/, 'Kullanıcı şifresini sıfırladı'],
  [/\/admins\//, 'Yönetici hesabı işlemi'],
  [/\/me\/2fa\//, '2 adımlı doğrulama ayarı'],
  [/\/me\/password$/, 'Kendi şifresini değiştirdi'],
  [/\/reports\//, 'Şikayeti değerlendirdi'],
];

function labelFor(path) {
  for (const [re, label] of LABELS) if (re.test(path)) return label;
  return 'Admin işlemi';
}

const SECRET_KEY = /pass|secret|token|totp|code/i;
function redact(body) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) out[k] = SECRET_KEY.test(k) ? '***' : v;
  return JSON.stringify(out).slice(0, 300);
}

async function record({ actor, role, action, label, target, details, status }) {
  try {
    const { error } = await supabase.from('audit_log').insert({
      actor: String(actor || '?').slice(0, 60),
      role: role || null,
      action,
      label: label || null,
      target: target ? String(target).slice(0, 120) : null,
      details: details ? String(details).slice(0, 300) : null,
      status: status || null,
      created_at: Date.now(),
    });
    if (error) throw error;
  } catch (e) {
    console.error('İşlem kaydı yazılamadı:', e.message);
  }
}

// /api/admin altındaki DEĞİŞTİREN (GET olmayan) tüm istekler otomatik kaydedilir.
function auditMiddleware(req, res, next) {
  if (req.method === 'GET' || !(req.session && req.session.isAdmin)) return next();
  const path = req.originalUrl.split('?')[0];
  const body = req.body || {};
  res.on('finish', () => {
    const idMatch = path.match(/\/(?:approve|reject|ban|restore|delete-approved)\/([^/]+)$/) || path.match(/\/feedback\/(\d+)\//);
    const target = body.username || (idMatch && `#${idMatch[1]}`) || body.itemId || null;
    record({
      actor: req.session.username,
      role: req.session.adminRole,
      action: path.replace('/api/admin/', ''),
      label: labelFor(path),
      target,
      details: redact(body),
      status: res.statusCode,
    });
  });
  next();
}

async function listRecent(limit = 150) {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, createdAt: Number(r.created_at) }));
}

async function purgeOld(maxAgeMs) {
  const { error } = await supabase.from('audit_log').delete().lt('created_at', Date.now() - maxAgeMs);
  if (error) throw error;
}

module.exports = { record, auditMiddleware, listRecent, purgeOld, labelFor, redact };
