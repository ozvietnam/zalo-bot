// Gửi bản tin giám sát qua Telegram cho CEO — spec 007 mở rộng
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (lấy từ @userinfobot)
// Không bắt buộc — nếu thiếu env thì im lặng bỏ qua.

/**
 * @param {string} banTin — nội dung bản tin (markdown thuần)
 * @param {object} opts — { dryRun?: boolean }
 * @returns {boolean} — true nếu gửi thành công
 */
export async function guiTelegram(banTin, { dryRun = false } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false; // chưa cấu hình — im lặng
  if (dryRun) { console.log('[giám sát] (dry-run) Telegram sẽ gửi:', banTin.slice(0, 100)); return true; }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: banTin,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const d = await r.json();
    return d.ok === true;
  } catch {
    return false;
  }
}

/** Dựng bản tin giám sát từ phát hiện + kết quả issue */
export function dungBanTin({ ngay, phatHien, ketQua }) {
  const icon = phatHien.length === 0 ? '✅' : phatHien.length <= 3 ? '⚠️' : '🔴';
  const lines = [
    `<b>${icon} Giám sát bot — ${ngay}</b>`,
    '',
    `Phát hiện: <b>${phatHien.length}</b>`,
  ];
  if (phatHien.length > 0) {
    lines.push('');
    for (const p of phatHien) {
      const e = p.ma.startsWith('GATE') ? '🚫' : p.ma.startsWith('TOOL') ? '🔧' : '💬';
      lines.push(`${e} <code>${p.ma}</code>${p.cheDo ? `/${p.cheDo}` : ''}: ${p.soDo} → ${p.repo}`);
    }
  }
  if (ketQua?.moi?.length) lines.push('', `↗ Issue mới: ${ketQua.moi.length}`);
  if (ketQua?.comment?.length) lines.push(`↗ Comment cũ: ${ketQua.comment.length}`);
  if (ketQua?.boViGioiHan?.length) lines.push(`⊘ Bỏ giới hạn: ${ketQua.boViGioiHan.length}`);
  if (ketQua?.loi) lines.push('', `⚠️ ${ketQua.loi}`);
  return lines.join('\n');
}
