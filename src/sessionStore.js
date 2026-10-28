// Oturumları Supabase'de saklar: Render uyuyup uyansa ya da yeniden başlasa
// kimse çıkış yapmış olmaz. Hız için bellekte kısa süreli önbellek tutar
// (her istekte veritabanına gitmez); yazmalar arka planda yapılır.
const session = require('express-session');
const supabase = require('../supabaseClient');

const DAY = 24 * 60 * 60 * 1000;

class SupabaseSessionStore extends session.Store {
  constructor({ cacheMs = 60 * 1000, defaultTtlMs = 8 * 60 * 60 * 1000 } = {}) {
    super();
    this.cacheMs = cacheMs;
    this.defaultTtlMs = defaultTtlMs;
    this.cache = new Map(); // sid -> { sess, at, dbAt }
    this.lastErrLog = 0;
    setInterval(() => this.pruneCache(), 5 * 60 * 1000).unref();
  }

  logErr(where, e) {
    if (Date.now() - this.lastErrLog > 10 * 60 * 1000) {
      this.lastErrLog = Date.now();
      console.error(`Oturum deposu (${where}) hatası:`, e && e.message ? e.message : e);
    }
  }

  expireOf(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isFinite(exp) ? exp : Date.now() + this.defaultTtlMs;
  }

  pruneCache() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [sid, v] of this.cache) if (v.at < cutoff) this.cache.delete(sid);
  }

  get(sid, cb) {
    const hit = this.cache.get(sid);
    if (hit && Date.now() - hit.at < this.cacheMs) {
      if (this.expireOf(hit.sess) < Date.now()) {
        this.cache.delete(sid);
        return cb(null, null);
      }
      return cb(null, JSON.parse(JSON.stringify(hit.sess)));
    }
    Promise.resolve(supabase.from('sessions').select('sess, expire').eq('sid', sid).maybeSingle())
      .then(({ data, error }) => {
        if (error) throw error;
        if (!data || Number(data.expire) < Date.now()) {
          this.cache.delete(sid);
          return cb(null, null);
        }
        this.cache.set(sid, { sess: data.sess, at: Date.now(), dbAt: Date.now() });
        cb(null, JSON.parse(JSON.stringify(data.sess)));
      })
      .catch((e) => {
        this.logErr('get', e);
        // tablo yoksa vb.: önbellekteki (eski de olsa) kopyaya düş
        if (hit) return cb(null, JSON.parse(JSON.stringify(hit.sess)));
        cb(null, null);
      });
  }

  set(sid, sess, cb) {
    const plain = JSON.parse(JSON.stringify(sess));
    this.cache.set(sid, { sess: plain, at: Date.now(), dbAt: Date.now() });
    if (cb) cb(null); // giriş/yönlendirme veritabanı yazmasını beklemesin
    Promise.resolve(supabase.from('sessions').upsert({ sid, sess: plain, expire: this.expireOf(plain) }))
      .then(({ error }) => {
        if (error) throw error;
      })
      .catch((e) => this.logErr('set', e));
  }

  touch(sid, sess, cb) {
    const hit = this.cache.get(sid);
    if (hit) {
      hit.sess.cookie = JSON.parse(JSON.stringify(sess.cookie));
      hit.at = Date.now();
      // veritabanındaki bitiş süresini en fazla 5 dakikada bir tazele
      if (Date.now() - hit.dbAt > 5 * 60 * 1000) {
        hit.dbAt = Date.now();
        Promise.resolve(supabase.from('sessions').update({ expire: this.expireOf(sess) }).eq('sid', sid))
          .then(({ error }) => {
            if (error) throw error;
          })
          .catch((e) => this.logErr('touch', e));
      }
    }
    if (cb) cb(null);
  }

  destroy(sid, cb) {
    this.cache.delete(sid);
    Promise.resolve(supabase.from('sessions').delete().eq('sid', sid))
      .then(({ error }) => {
        if (error) throw error;
      })
      .catch((e) => this.logErr('destroy', e));
    if (cb) cb(null);
  }

  // Süresi dolmuş oturumları veritabanından temizle (saatlik iş)
  async purgeExpired() {
    try {
      const { error } = await supabase.from('sessions').delete().lt('expire', Date.now() - DAY);
      if (error) throw error;
    } catch (e) {
      this.logErr('purge', e);
    }
  }
}

module.exports = { SupabaseSessionStore, sessionStore: new SupabaseSessionStore() };
