const supabase = require('./supabaseClient');
const { startOfTodayTR } = require('./src/lib/time');

// Günlük gönderim sayacı. Anahtar HESAP kimliğidir ("u:<id>"). "Bugün" = Türkiye saatiyle
// gece yarısından beri (kayan 24 saat DEĞİL): hak her gece 00:00'da yenilenir.
async function countToday(key) {
  const { count, error } = await supabase
    .from('submission_log')
    .select('*', { count: 'exact', head: true })
    .eq('ip', key)
    .gte('ts', startOfTodayTR());
  if (error) throw error;
  return count || 0;
}

async function recordSubmission(key) {
  const { error } = await supabase.from('submission_log').insert({ ip: key, ts: Date.now() });
  if (error) throw error;
}

module.exports = { countToday, recordSubmission };
