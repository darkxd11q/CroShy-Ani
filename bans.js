const supabase = require('./supabaseClient');

function fromRow(row) {
  return {
    ip: row.ip,
    bannedAt: row.banned_at,
    reason: row.reason || '',
    usernames: row.usernames || [],
  };
}

async function isBanned(ip) {
  if (!ip) return false;
  const { data, error } = await supabase.from('bans').select('ip').eq('ip', ip).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function banIp(ip, { username, reason } = {}) {
  const { data: existing, error: selErr } = await supabase.from('bans').select('*').eq('ip', ip).maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const usernames = existing.usernames || [];
    if (username && !usernames.includes(username)) {
      const { error } = await supabase
        .from('bans')
        .update({ usernames: [...usernames, username] })
        .eq('ip', ip);
      if (error) throw error;
    }
    return;
  }

  const { error } = await supabase.from('bans').insert({
    ip,
    banned_at: Date.now(),
    reason: reason || '',
    usernames: username ? [username] : [],
  });
  if (error) throw error;
}

async function unbanIp(ip) {
  const { error } = await supabase.from('bans').delete().eq('ip', ip);
  if (error) throw error;
}

async function listBans() {
  const { data, error } = await supabase.from('bans').select('*').order('banned_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

module.exports = { isBanned, banIp, unbanIp, listBans };
