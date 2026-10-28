// Hesap silme (KVKK: silme hakkı) ve veri dışa aktarma.
const supabase = require('../../supabaseClient');
const cloudinary = require('cloudinary').v2;
const likes = require('../../likes');
const viewsStore = require('../../views_store');
const rememberTokens = require('../../rememberTokens');
const users = require('../../users');

const safe = async (fn) => {
  try {
    await fn();
  } catch (e) {
    console.error('Hesap silme adımı atlandı:', e.message);
  }
};

// Kullanıcının her şeyini KALICI olarak siler (anılar Cloudinary'den de silinir).
async function deleteAccountPermanently(user) {
  const { data: items } = await supabase.from('items').select('id, public_id, type').eq('user_id', user.id);
  for (const it of items || []) {
    await safe(() => cloudinary.uploader.destroy(it.public_id, { resource_type: it.type === 'video' ? 'video' : 'image' }));
    await safe(() => likes.removeAllForItem(it.id));
    await safe(() => viewsStore.removeAllForItem(it.id));
    await safe(async () => {
      await supabase.from('comments').delete().eq('item_id', it.id);
      await supabase.from('reactions').delete().eq('item_id', it.id);
    });
  }
  await safe(() => supabase.from('items').delete().eq('user_id', user.id));
  if (user.avatarPublicId) await safe(() => cloudinary.uploader.destroy(user.avatarPublicId, { resource_type: 'image' }));

  await safe(() => supabase.from('comments').delete().eq('user_id', user.id));
  await safe(() => supabase.from('reactions').delete().eq('user_id', user.id));
  await safe(() => supabase.from('notifications').delete().eq('user_id', user.id));
  await safe(() => supabase.from('feedback').delete().eq('user_id', user.id));
  await safe(() => supabase.from('weekly_awards').delete().eq('user_id', user.id));
  await safe(() => supabase.from('likes').delete().eq('ip', 'u:' + user.id));
  await safe(() => supabase.from('submission_log').delete().eq('ip', 'u:' + user.id));
  await safe(() => rememberTokens.removeAllForSubject('user', user.id));
  await users.deleteUser(user.id);
}

async function exportUserData(user) {
  const pick = async (q) => {
    try {
      const { data } = await q;
      return data || [];
    } catch {
      return [];
    }
  };
  const [items, comments, reactions, feedback, nameChanges, awards] = await Promise.all([
    pick(supabase.from('items').select('id, url, type, caption, status, created_at, tags').eq('user_id', user.id)),
    pick(supabase.from('comments').select('item_id, body, created_at').eq('user_id', user.id)),
    pick(supabase.from('reactions').select('item_id, emoji, created_at').eq('user_id', user.id)),
    pick(supabase.from('feedback').select('message, status, created_at').eq('user_id', user.id)),
    pick(supabase.from('name_changes').select('old_name, new_name, changed_at').eq('user_id', user.id)),
    pick(supabase.from('weekly_awards').select('badge, week_end, submissions, likes, awarded_at').eq('user_id', user.id)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      bio: user.bio,
      badges: user.badges,
      badgeExpiry: user.badgeExpiry,
      theme: user.theme,
      avatarUrl: user.avatarUrl,
      nameStyle: user.nameStyle,
    },
    items,
    comments,
    reactions,
    feedback,
    nameChanges,
    weeklyAwards: awards,
  };
}

module.exports = { deleteAccountPermanently, exportUserData };
