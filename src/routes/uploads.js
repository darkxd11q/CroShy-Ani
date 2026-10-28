// İmzalı Cloudinary yüklemeleri: tarayıcı artık herkesin kullanabildiği "imzasız
// preset" ile değil, sunucunun verdiği kısa ömürlü imzayla yükler. Böylece giriş
// yapmamış / yasaklı / günlük hakkı dolmuş biri Cloudinary hesabına dosya yükleyemez.
const { app, cloudinary, createRateLimiter, effectiveLimitsFor, getSettingsSafe, logs, requireUserApi, users, asyncRoute } = require('../core');

const FORMATS = {
  image: 'jpg,jpeg,png,webp,gif,heic,heif,avif',
  video: 'mp4,mov,webm,m4v,avi,mkv,3gp,mpeg,mpg,wmv,flv',
  avatar: 'jpg,jpeg,png,webp,gif',
};

const signLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: 'Çok fazla yükleme denemesi yaptın. Lütfen biraz sonra tekrar dene.',
});

app.post(
  '/api/upload-signature',
  requireUserApi,
  signLimiter,
  asyncRoute(async (req, res) => {
    const kind = req.body.kind === 'avatar' ? 'avatar' : 'media';
    const resourceType = req.body.resourceType === 'video' ? 'video' : 'image';
    if (kind === 'avatar' && resourceType !== 'image') return res.status(400).json({ error: 'Geçersiz tür.' });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const secret = process.env.CLOUDINARY_API_SECRET;
    if (process.env.CLOUDINARY_SIGNED_UPLOADS === 'false' || !apiKey || !secret) {
      // Eski usul (imzasız preset) — sadece açıkça kapatıldıysa / anahtar yoksa
      return res.json({ signed: false, cloudName, uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '' });
    }

    const user = await users.findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Hesap bulunamadı.', loginRequired: true });
    if (user.banned) return res.status(403).json({ error: 'Hesabının yükleme yetkisi kaldırılmış.' });

    if (kind === 'media') {
      const [globalSettings, used] = await Promise.all([getSettingsSafe(), logs.countToday('u:' + user.id)]);
      const limits = effectiveLimitsFor(user, globalSettings);
      if (used >= limits.dailyLimit) {
        return res.status(429).json({ error: `Bugünkü gönderme hakkını doldurdun (günde en fazla ${limits.dailyLimit} anı).` });
      }
    }

    const timestamp = Math.round(Date.now() / 1000);
    const params = {
      folder: kind === 'avatar' ? 'croshy/avatars' : 'croshy/media',
      allowed_formats: kind === 'avatar' ? FORMATS.avatar : FORMATS[resourceType],
    };
    const signature = cloudinary.utils.api_sign_request({ timestamp, ...params }, secret);
    res.json({ signed: true, cloudName, apiKey, timestamp, signature, params });
  })
);
