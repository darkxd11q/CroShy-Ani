const supabase = require('./supabaseClient');

// Tarayıcı/telefon bildirim abonelikleri (cihaz başına bir kayıt)
async function upsert({ userId, endpoint, p256dh, auth, userAgent }) {
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint, p256dh, auth, user_agent: userAgent ? String(userAgent).slice(0, 200) : null, created_at: Date.now() },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
  // Kullanıcı başına en fazla 10 cihaz: en eskileri sil
  const { data } = await supabase.from('push_subscriptions').select('id').eq('user_id', userId).order('created_at', { ascending: false });
  const extra = (data || []).slice(10).map((r) => r.id);
  if (extra.length) await supabase.from('push_subscriptions').delete().in('id', extra);
}

async function listForUser(userId) {
  const { data, error } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

async function removeByEndpoint(endpoint, userId) {
  let q = supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (userId) q = q.eq('user_id', userId);
  const { error } = await q;
  if (error) throw error;
}

async function removeForUser(userId) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId);
  if (error) throw error;
}

module.exports = { upsert, listForUser, removeByEndpoint, removeForUser };
