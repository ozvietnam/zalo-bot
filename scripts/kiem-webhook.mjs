// Kiểm tra đường webhook từ Internet: node --env-file=.env scripts/kiem-webhook.mjs https://chatbot.uythacnhapkhau.com/webhook/zalo
const url = process.argv[2];
if (!url) throw new Error('Thiếu URL webhook');
const secret = process.env.ZALO_WEBHOOK_SECRET || '';
const thu = async (ten, headers) => {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
    const body = (await r.text()).replace(/\s+/g, ' ').slice(0, 120);
    console.log(`${ten.padEnd(28)} → HTTP ${r.status} | server: ${r.headers.get('server') || '?'} | ${body}`);
  } catch (e) { console.log(`${ten.padEnd(28)} → LỖI ${e.message}`); }
};
console.log(`Mã bí mật trong .env: ${secret ? `có (${secret.length} ký tự)` : 'TRỐNG'}`);
await thu('1. Đúng mã', { 'X-Bot-Api-Secret-Token': secret });
await thu('2. Đúng mã + giả Zalo (Java)', { 'X-Bot-Api-Secret-Token': secret, 'User-Agent': 'Java/17.0.2' });
await thu('3. Sai mã', { 'X-Bot-Api-Secret-Token': 'sai-ma-thu' });
