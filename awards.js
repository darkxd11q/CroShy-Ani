const supabase = require('./supabaseClient');

function fromRow(r) {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    badge: r.badge,
    weekEnd: Number(r.week_end),
    submissions: r.submissions,
    likes: r.likes,
    awardedAt: Number(r.awarded_at),
    themeExpiresAt: Number(r.theme_expires_at),
    seen: !!r.seen,
  };
}

async function record({ userId, username, badge, weekEnd, submissions, likes, awardedAt, themeExpiresAt }) {
  const { error } = await supabase.from('weekly_awards').insert({
    user_id: userId,
    username,
    badge,
    week_end: weekEnd,
    submissions,
    likes,
    awarded_at: awardedAt,
    theme_expires_at: themeExpiresAt,
    seen: false,
  });
  if (error) throw error;
}

async function getUnseenForUser(userId) {
  const { data, error } = await supabase
    .from('weekly_awards')
    .select('*')
    .eq('user_id', userId)
    .eq('seen', false)
    .order('awarded_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

async function markSeenForUser(userId) {
  const { error } = await supabase.from('weekly_awards').update({ seen: true }).eq('user_id', userId).eq('seen', false);
  if (error) throw error;
}

// Ödül temalarının (Aurora/Kraliyet) hâlâ geçerli olduğu en geç bitiş zamanı
// (yoksa 0). Ödülden sonra 15 gün boyunca geçerlidir.
async function getRewardExpiry(userId) {
  if (!userId) return 0;
  try {
    const { data, error } = await supabase
      .from('weekly_awards')
      .select('theme_expires_at')
      .eq('user_id', userId)
      .gt('theme_expires_at', Date.now())
      .order('theme_expires_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data.length ? Number(data[0].theme_expires_at) : 0;
  } catch (e) {
    // Tablo henüz yoksa (şema güncellenmemişse) profil sayfası bozulmasın
    return 0;
  }
}

async function deleteForUser(userId) {
  const { error } = await supabase.from('weekly_awards').delete().eq('user_id', userId);
  if (error) throw error;
}

// [from, to) aralığında onaylı anıları üzerinden haftanın kazananlarını hesaplar.
async function computeWinners(from, to) {
  const [itemsRes, likesRes] = await Promise.all([
    supabase
      .from('items')
      .select('id, user_id, uploader_name')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gte('created_at', from)
      .lt('created_at', to),
    supabase.from('likes').select('item_id'),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (likesRes.error) throw likesRes.error;

  const likeMap = {};
  for (const row of likesRes.data || []) likeMap[row.item_id] = (likeMap[row.item_id] || 0) + 1;

  const byUser = new Map();
  for (const item of itemsRes.data || []) {
    if (!item.user_id) continue;
    if (!byUser.has(item.user_id)) {
      byUser.set(item.user_id, { userId: item.user_id, username: item.uploader_name, submissions: 0, likes: 0 });
    }
    const u = byUser.get(item.user_id);
    u.submissions += 1;
    u.likes += likeMap[item.id] || 0;
  }

  const all = [...byUser.values()];
  const best = (cmp) => (all.length ? [...all].sort(cmp)[0] : null);
  const topSubmitter = best(
    (a, b) => b.submissions - a.submissions || b.likes - a.likes || a.username.localeCompare(b.username)
  );
  let topLiked = best(
    (a, b) => b.likes - a.likes || b.submissions - a.submissions || a.username.localeCompare(b.username)
  );
  if (topLiked && topLiked.likes < 1) topLiked = null;

  return { topSubmitter, topLiked };
}

module.exports = { record, getUnseenForUser, markSeenForUser, getRewardExpiry, computeWinners, deleteForUser };
