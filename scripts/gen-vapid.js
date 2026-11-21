// Bildirim (web push) için anahtar çifti üretir. Çıktıyı Render > Environment'a yapıştır. Çalıştır: npm run vapid
const webpush = require('web-push');
const k = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + k.publicKey);
console.log('VAPID_PRIVATE_KEY=' + k.privateKey);
console.log('VAPID_SUBJECT=mailto:senin-epostan@ornek.com');
