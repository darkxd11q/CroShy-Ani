const supabase = require('./supabaseClient');

const DAY_MS = 24 * 60 * 60 * 1000;

// Bir gönderimi kaydet. Bu kayıt, ilgili anı reddedilse/silinse bile
// kalıcıdır — böylece bir kullanıcı "gönder, reddedilirse tekrar gönder"
// döngüsüyle günlük limiti aşamaz.
async function recordSubmission(ip) {
  const { error } = await supabase.from('submission_log').insert({ ip, ts: Date.now() });
  if (error) throw error;
}

async function countToday(ip) {
  const cutoff = Date.now() - DAY_MS;
  const { count, error } = await supabase
    .from('submission_log')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .gt('ts', cutoff);
  if (error) throw error;
  return count || 0;
}

module.exports = { recordSubmission, countToday };
