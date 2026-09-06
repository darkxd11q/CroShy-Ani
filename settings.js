const supabase = require('./supabaseClient');

const DEFAULTS = {
  dailySubmitLimit: 2,
  maxImageBytes: 8.5 * 1024 * 1024,
  maxVideoBytes: 40 * 1024 * 1024,
  maxVideoDurationSec: 150,
};

function fromRow(row) {
  return {
    dailySubmitLimit: row.daily_submit_limit,
    maxImageBytes: Number(row.max_image_bytes),
    maxVideoBytes: Number(row.max_video_bytes),
    maxVideoDurationSec: row.max_video_duration_sec,
  };
}

async function getSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULTS };
  return fromRow(data);
}

async function updateSettings({ dailySubmitLimit, maxImageBytes, maxVideoBytes, maxVideoDurationSec }) {
  const patch = { updated_at: Date.now() };
  if (dailySubmitLimit != null) patch.daily_submit_limit = dailySubmitLimit;
  if (maxImageBytes != null) patch.max_image_bytes = maxImageBytes;
  if (maxVideoBytes != null) patch.max_video_bytes = maxVideoBytes;
  if (maxVideoDurationSec != null) patch.max_video_duration_sec = maxVideoDurationSec;

  const { data, error } = await supabase.from('app_settings').update(patch).eq('id', 1).select().maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

module.exports = { getSettings, updateSettings, DEFAULTS };
