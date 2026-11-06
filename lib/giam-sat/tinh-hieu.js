// Tính 9 tín hiệu giám sát từ dữ liệu bot — spec 007 User Story 1
// Mỗi tín hiệu: đọc messages/outbox/jobs/audit của 1 ngày → phát hiện có bằng chứng.
// KHÔNG gọi AI, KHÔNG gọi mạng — thuần code đo được (spec: "Script tính mọi số đo bằng code").

export const NGUONG = {
  'GATE-LEAK':    { min: 1,  repo: 'zalo-bot' },
  'GATE-MONEY':   { min: 1,  repo: 'zalo-bot' },
  'TOOL-ERR':     { min: 3,  repo: 'ozplugin' },
  'TOOL-EMPTY':   { min: 3,  repo: 'ozplugin' },
  'JOB-EXPIRED':  { min: 1,  repo: 'ozplugin' },
  'HOI-LAI':      { min: 3,  repo: 'zalo-bot' },
  'NGUOI-THAY':   { min: 3,  repo: 'zalo-bot' },
  'KHACH-BUC':    { min: 2,  repo: 'zalo-bot' },
  'XIN-LOI-TAY':  { min: 1,  repo: 'zalo-bot' },
};

// ═══ Jaccard similarity cho HOI-LAI ═══
function tokens(s) {
  return new Set(String(s || '').toLowerCase().split(/\s+/).filter(w => w.length > 1));
}
export function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ═══ Từ khoá khách bực ═══
const BUC_PATTERN = /chả hiểu|cha hieu|không hiểu|ko hiểu|lần thứ \d|bot à|người hay máy|thật sự|gtgt|!!!{2,}/i;

/**
 * Tính phát hiện từ dữ liệu 1 ngày.
 * @param {{messages:Array, outbox:Array, jobs:Array, audit:Array, ngay:string, hienTai?:string}} duLieu
 * @returns {Array<{ma:string, cheDo?:string, soDo:string, repo:string, bangChung:Array, moTa:string}>}
 */
export function tinhHieu({ messages = [], outbox = [], jobs = [], audit = [], ngay, hienTai }) {
  const now = hienTai || `${ngay}T23:59:59Z`;
  const ketQua = [];
  const push = (ma, cheDo, soDo, bangChung, moTa) => {
    const n = NGUONG[ma];
    ketQua.push({ ma, cheDo, soDo, repo: n.repo, bangChung, moTa });
  };

  // ── GATE-LEAK + GATE-MONEY: từ outbox decision=block ──
  const leak = outbox.filter(o => o.decision === 'block' && String(o.reason || '').startsWith('leak:'));
  if (leak.length >= NGUONG['GATE-LEAK'].min)
    push('GATE-LEAK', null, `${leak.length} lần`, leak.slice(0, 5).map(o => ({ chat_id: o.chat_id, reason: o.reason })),
      `Cửa gửi chặn ${leak.length} tin vì lộ thông tin nội bộ`);

  const money = outbox.filter(o => o.decision === 'block' && String(o.reason || '').startsWith('money'));
  if (money.length >= NGUONG['GATE-MONEY'].min)
    push('GATE-MONEY', null, `${money.length} lần`, money.slice(0, 5).map(o => ({ chat_id: o.chat_id, reason: o.reason })),
      `Cửa gửi chặn ${money.length} tin vì số tiền không có căn cứ`);

  // ── TOOL-ERR + TOOL-EMPTY: từ audit type=tool_error / tool_empty ──
  const toolErr = {};
  for (const a of audit) {
    if (a.type === 'tool_error') {
      let d = {}; try { d = JSON.parse(a.data); } catch {}
      const t = d.tool || 'unknown';
      (toolErr[t] ||= []).push(a);
    }
  }
  for (const [tool, list] of Object.entries(toolErr)) {
    if (list.length >= NGUONG['TOOL-ERR'].min)
      push('TOOL-ERR', tool, `${list.length} lần`, list.slice(0, 5).map(a => ({ at: a.at, chat_id: a.chat_id, error: 'đã che' })),
        `Công cụ ${tool} lỗi ${list.length} lần trong ngày`);
  }

  const toolEmpty = {};
  for (const a of audit) {
    if (a.type === 'tool_empty') {
      let d = {}; try { d = JSON.parse(a.data); } catch {}
      const t = d.tool || 'unknown';
      (toolEmpty[t] ||= []).push(a);
    }
  }
  for (const [tool, list] of Object.entries(toolEmpty)) {
    if (list.length >= NGUONG['TOOL-EMPTY'].min)
      push('TOOL-EMPTY', tool, `${list.length} lần`, list.slice(0, 5).map(a => ({ at: a.at })),
        `Công cụ ${tool} trả rỗng ${list.length} lần cho đầu vào hợp lệ`);
  }

  // ── JOB-EXPIRED: job quá expires_at vẫn pending ──
  const expired = jobs.filter(j => j.status === 'pending' && j.expires_at < now);
  if (expired.length >= NGUONG['JOB-EXPIRED'].min)
    push('JOB-EXPIRED', null, `${expired.length} việc`, expired.slice(0, 5).map(j => ({ pack: j.pack, ma_luot: j.ma_luot, expires_at: j.expires_at })),
      `${expired.length} việc nền quá hạn không có kết quả`);

  // ── HOI-LAI: khách hỏi lại gần giống trong 30 phút sau bot trả lời ──
  const hoiLaiPhong = new Set();
  const hoiLaiBangChung = [];
  const byChat = {};
  for (const m of messages) (byChat[m.chat_id] ||= []).push(m);
  for (const [chat, msgs] of Object.entries(byChat)) {
    msgs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.speaker !== 'user' || !m.text) continue;
      // tìm bot trả lời sau đó
      let botReply = null;
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j].speaker === 'bot') { botReply = msgs[j]; break; }
        if (msgs[j].speaker === 'user') break;
      }
      if (!botReply) continue;
      // tìm user hỏi lại trong 30 phút (botIdx = vị trí bot trả lời)
      const botIdx = msgs.indexOf(botReply);
      for (let j = botIdx + 1; j < msgs.length; j++) {
        const m2 = msgs[j];
        if (m2.speaker !== 'user') continue;
        const dt = new Date(m2.at) - new Date(botReply.at);
        if (dt > 30 * 60_000) break;
        if (jaccard(m.text, m2.text) >= 0.8) {
          hoiLaiPhong.add(chat);
          hoiLaiBangChung.push({ chat_id: chat, turn_1: m.text?.slice(0, 80), turn_2: m2.text?.slice(0, 80) });
          break;
        }
      }
    }
  }
  if (hoiLaiPhong.size >= NGUONG['HOI-LAI'].min)
    push('HOI-LAI', null, `${hoiLaiPhong.size} phòng`, hoiLaiBangChung.slice(0, 5),
      `Khách hỏi lại gần giống câu trước ở ${hoiLaiPhong.size} phòng — câu trả lời chưa giải quyết`);

  // ── NGUOI-THAY: staff vào trong 15 phút sau bot trả lời ──
  const nguoiThayPhong = new Set();
  const nguoiThayBangChung = [];
  for (const [chat, msgs] of Object.entries(byChat)) {
    msgs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].speaker !== 'bot') continue;
      for (let j = i + 1; j < msgs.length; j++) {
        const m = msgs[j];
        if (m.speaker === 'staff') {
          const dt = new Date(m.at) - new Date(msgs[i].at);
          if (dt >= 0 && dt <= 15 * 60_000) {
            nguoiThayPhong.add(chat);
            nguoiThayBangChung.push({ chat_id: chat, bot_at: msgs[i].at, staff_at: m.at });
          }
          break;
        }
        if (m.speaker === 'user') break;
      }
    }
  }
  if (nguoiThayPhong.size >= NGUONG['NGUOI-THAY'].min)
    push('NGUOI-THAY', null, `${nguoiThayPhong.size} phòng`, nguoiThayBangChung.slice(0, 5),
      `Nhân viên vào phòng trong 15 phút sau bot trả lời ở ${nguoiThayPhong.size} phòng — bot trả lời chưa đủ`);

  // ── KHACH-BUC: khách bực ở ≥2 phòng ──
  const bucPhong = new Set();
  const bucBangChung = [];
  for (const m of messages) {
    if (m.speaker === 'user' && m.text && BUC_PATTERN.test(m.text)) {
      bucPhong.add(m.chat_id);
      bucBangChung.push({ chat_id: m.chat_id, text: m.text.slice(0, 80) });
    }
  }
  if (bucPhong.size >= NGUONG['KHACH-BUC'].min)
    push('KHACH-BUC', null, `${bucPhong.size} phòng`, bucBangChung.slice(0, 5),
      `Kh khách bực / khó hiểu ở ${bucPhong.size} phòng`);

  // ── XIN-LOI-TAY: staff gõ xin lỗi / gửi nhầm ngay sau tin bot ──
  const xinLoi = [];
  for (const [chat, msgs] of Object.entries(byChat)) {
    msgs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].speaker === 'staff' && /xin lỗi|gửi nhầm|sorry/i.test(msgs[i].text || '')
          && msgs[i - 1].speaker === 'bot') {
        xinLoi.push({ chat_id: chat, staff_text: msgs[i].text?.slice(0, 80) });
      }
    }
  }
  if (xinLoi.length >= NGUONG['XIN-LOI-TAY'].min)
    push('XIN-LOI-TAY', null, `${xinLoi.length} lần`, xinLoi.slice(0, 5),
      `Nhân viên xin lỗi / gửi nhầm ngay sau tin bot ${xinLoi.length} lần — bot có thể đã gửi sai`);

  return ketQua;
}
