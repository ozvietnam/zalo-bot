// Đăng ký / xem / xoá webhook với Zalo.
//   node scripts/set-webhook.mjs set https://zalo-bot.ten-mien.vn/webhook/zalo
//   node scripts/set-webhook.mjs info
//   node scripts/set-webhook.mjs delete
// Cần biến môi trường ZALO_BOT_TOKEN (và ZALO_WEBHOOK_SECRET cho "set").
import { createZaloClient } from '../channels/zalo-bot.js';

const [cmd = 'info', url] = process.argv.slice(2);
const zalo = createZaloClient({ token: process.env.ZALO_BOT_TOKEN, baseUrl: process.env.ZALO_API_BASE || undefined });

if (cmd === 'set') {
  if (!url?.startsWith('https://')) throw new Error('URL webhook phải là https://…');
  const secret = process.env.ZALO_WEBHOOK_SECRET || '';
  if (secret.length < 8) throw new Error('ZALO_WEBHOOK_SECRET phải dài 8–256 ký tự');
  console.log(JSON.stringify(await zalo.setWebhook(url, secret), null, 2));
} else if (cmd === 'delete') {
  console.log(JSON.stringify(await zalo.deleteWebhook(), null, 2));
} else {
  console.log(JSON.stringify(await zalo.getWebhookInfo(), null, 2));
}
