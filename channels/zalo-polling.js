// channels/zalo-polling.js — chế độ polling của kênh Zalo: gọi getUpdates liên tục, nghỉ tối thiểu giữa 2 lần, backoff khi lỗi/429.
// Tách khỏi server.js (spec 001, T016): đọc tin là việc của KÊNH, không phải của lõi; server.js chỉ nối dây (≤ 120 dòng).
import { createZaloClient, kiemTruocPolling } from './zalo-bot.js';

/**
 * Bật chế độ polling (ZALO_MODE=polling). Trả { ok, url, lyDo }.
 * ok=false ⇒ bot đang có webhook nên DỪNG an toàn (không xoá webhook production) — caller tự quyết định thoát.
 */
export async function batDauPolling({ token, baseUrl, engine, env = process.env, debug = false }) {
  const zalo = createZaloClient({ token, baseUrl });
  const g = await kiemTruocPolling(zalo, { force: /^(1|true|yes)$/i.test(env.ZALO_FORCE_POLLING || '') });
  if (!g.ok) {
    console.error(`[polling] DỪNG: ${g.lyDo}`);
    return { ok: false, lyDo: g.lyDo };
  }
  if (g.url) console.warn(`[polling] ZALO_FORCE_POLLING bật: sẽ xoá webhook ${g.url} — nhớ đặt lại: npm run webhook:set -- ${g.url}`);
  void vongLap({ zalo, engine, env, debug });
  return { ok: true, url: g.url };
}

/** Vòng lặp getUpdates: nghỉ tối thiểu giữa 2 lần, backoff khi lỗi/429, không bao giờ thoát. */
async function vongLap({ zalo, engine, env, debug }) {
  try { await zalo.deleteWebhook(); } catch { /* chưa đặt webhook */ }
  console.log(`[polling] bắt đầu getUpdates${debug ? ' (DEBUG bật)' : ''}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MIN_GAP = Number(env.POLL_GAP_MS) || 1500;   // nghỉ tối thiểu giữa 2 lần getUpdates
  let backoff = 0;                                   // tăng dần khi bị 429 / lỗi
  for (;;) {
    const t0 = Date.now();
    try {
      const r = await zalo.getUpdates(30);
      const list = Array.isArray(r) ? r : r ? [r] : [];
      if (debug) console.log('[debug] getUpdates:', JSON.stringify(r ?? null).slice(0, 800));
      for (const u of list) engine.process(u)
        .then((x) => { if (debug || x?.skipped) console.log('[bot] kết quả:', JSON.stringify(x)); })
        .catch((e) => console.error('[polling]', e.message));
      if (backoff) console.log('[polling] kết nối lại bình thường');
      backoff = 0;
    } catch (e) {
      if (debug) console.log(`[debug] getUpdates lỗi: ${e.name}: ${e.message}`);
      if (/timeout|408/i.test(e.message)) backoff = 0;   // hết 30 s không có tin: bình thường
      else {
        backoff = Math.min(backoff ? backoff * 2 : (e.status === 429 ? 10000 : 3000), 120000);
        console.error(`[polling] ${e.message} — thử lại sau ${Math.round(backoff / 1000)} s`);
      }
    }
    const wait = Math.max(backoff, MIN_GAP - (Date.now() - t0));
    if (wait > 0) await sleep(wait);
  }
}
