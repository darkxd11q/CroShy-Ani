const supabase = require('./supabaseClient');

function fromRow(row) {
  return {
    code: row.code,
    badge: row.badge,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    redeemedBy: row.redeemed_by || null,
    redeemedAt: row.redeemed_at || null,
    durationDays: row.duration_days || null,
  };
}

async function create({ code, badge, createdAt, expiresAt, durationDays }) {
  const { error } = await supabase.from('redeem_codes').insert({
    code,
    badge,
    created_at: createdAt,
    expires_at: expiresAt,
    redeemed_by: null,
    redeemed_at: null,
    duration_days: durationDays || null,
  });
  if (error) throw error;
}

async function findByCode(code) {
  const { data, error } = await supabase.from('redeem_codes').select('*').eq('code', code).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// Tek kullanımlığı ATOMİK garanti eder: sadece henüz kullanılmamış (redeemed_by
// boş) satır güncellenir; aynı anda iki kişi denerse yalnızca biri "true" alır.
async function markRedeemed(code, username) {
  const { data, error } = await supabase
    .from('redeem_codes')
    .update({ redeemed_by: username, redeemed_at: Date.now() })
    .eq('code', code)
    .is('redeemed_by', null)
    .select();
  if (error) throw error;
  return (data || []).length > 0;
}

async function listRecent(limit = 25) {
  const { data, error } = await supabase
    .from('redeem_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(fromRow);
}

module.exports = { create, findByCode, markRedeemed, listRecent };
