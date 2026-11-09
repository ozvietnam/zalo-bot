// scripts/trai-nghiem-bot.mjs — chạy bot với dữ liệu giả và in ra ĐÚNG những gì khách nhận.
// Dùng để soi trình bày (độ dài, cấu trúc, giọng, thông tin thừa/thiếu) mà không cần Zalo thật.
// Chạy: node --disable-warning=ExperimentalWarning scripts/trai-nghiem-bot.mjs
import { createBot } from '../test/helpers/legacy-bot.mjs';
import { plain } from '../packs/hs/style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le',
  'kiem_tra_shtt', 'soan_ho_so_giai_trinh', 'bo_sung_du_kien'];

const THUE = { ok: true, data: {
  hsCode: '84137090', nameVi: '- - Loại khác', unitVi: 'chiếc',
  taxNkPreferential: '0', taxNkTt: '15', taxVat: '8/10',
  acfta: { forOrigin: { origin: 'CN', eligible: false, rate: null } },
  warnings: { summary: 'Kiểm tra hiệu suất năng lượng.', severity: 'MEDIUM' },
}, chiPhi: { diem: 2 } };

const THU_TUC = { ok: true, data: { ketQua: [
  { ten: 'Giấy chứng nhận phù hợp quy chuẩn', vanBan: 'QCVN 01/2019/BNMT', conHieuLuc: true },
  { ten: 'Kiểm tra chất lượng nhập khẩu', vanBan: 'Luật Hải quan 2014', conHieuLuc: true },
] } };

const PHAN_LOAI = { ok: true, trangThai: 'XONG', data: {
  maDeXuat: '84137090',
  lyDo: 'Bơm ly tâm dùng cho nước, công suất 1.5HP, điện áp 220V, vật liệu gang',
  results: [{ hs: '84137090', reason: 'Bơm ly tâm dùng cho nước, công suất 1.5HP, điện áp 220V', confidence: 0.86 }],
} };

const MO_TA = { ok: true, data: { moTaEcus: 'Bơm ly tâm nước, công suất 1.5HP, điện áp 220V, vật liệu gang, dùng cho hộ gia đình, mới 100%' } };

function mcp() {
  let n = 0;
  return {
    calls: [],
    async listTools() { return ALL.map((name) => ({ name })); },
    async callTool(name, args) {
      this.calls.push({ name, args });
      if (name === 'phan_loai_hs') return { ok: true, maLuot: '11111111-2222-4333-8444-555555555555', trangThai: 'DANG_XU_LY' };
      if (name === 'ket_qua_phan_loai') return (++n < 2 ? { ok: true, trangThai: 'DANG_XU_LY' } : PHAN_LOAI);
      if (name === 'tra_thue') return THUE;
      if (name === 'tra_thu_tuc_nhap_khau') return THU_TUC;
      if (name === 'sinh_mo_ta_khai_bao') return MO_TA;
      if (name === 'tra_chu_giai') return { ok: true, data: { ketQua: 'Giải thích chương 8413' } };
      if (name === 'tra_tien_le') return { ok: true, data: { ketQua: [] } };
      if (name === 'tim_ma_hs') return { ok: true, data: { ketQua: { maDeXuat: '84137090' } } };
      if (name === 'kiem_tra_shtt') return { ok: true, data: { ketQua: [{ ten: 'PENTAX', den: 'XANH' }] } };
      return { ok: true, data: { ketQua: 'kết quả ' + name } };
    },
  };
}

const dm = (text, id) => ({
  ok: true,
  result: { event_name: 'message.text.received', message: {
    message_id: id, text, chat: { id: 'u1', chat_type: 'PRIVATE' }, from: { id: 'u1' },
  } },
});

async function kichBan({ ten, gui, brain = null }) {
  const sent = [];
  const zalo = { sendText: async (c, t) => sent.push(t), sendChatAction: () => {} };
  const bot = createBot({ zalo, mcp: mcp(), brain, log: { info: () => {}, error: () => {} } });
  for (const [i, tin] of gui.entries()) {
    await bot.handleUpdate(dm(tin, `m${i}`));
    await bot.drain();
  }
  console.log(`\n${'═'.repeat(74)}\n▶ ${ten}\n${'─'.repeat(74)}`);
  if (!sent.length) console.log('(không có tin nào gửi đi)');
  sent.forEach((s, i) => {
    const p = plain(s);
    console.log(`\n[${i + 1}] (${p.length} ký tự)\n${'┌' + '─'.repeat(72)}`);
    console.log(p.split('\n').map((l) => '│ ' + l).join('\n'));
    console.log('└' + '─'.repeat(72));
  });
  return sent;
}

// Não giả: trả về lời hỏi lại / câu chào để xem phần trình bày của lớp AI.
const brainHoiLai = { hieu: async () => ({ kind: 'hoi-lai', cauHoi: 'Bạn muốn tra mã HS của hàng nào, hay tra thuế theo mã đã có?' }) };
const brainChao = { hieu: async () => ({ kind: 'khac', cauDan: 'Dạ em là bot tra cứu hải quan của OZ đây ạ. Anh cứ gõ mã HS hoặc mô tả hàng, em tra giúp.' }) };
const brainChon = { hieu: async () => ({ kind: 'chay', goi: 2, text: '84137090 JP' }) };

await kichBan({ ten: '1. Chào hỏi lúc mới vào', gui: ['xin chào'] });
await kichBan({ ten: '2. Gửi mô tả hàng (gói 1 → việc nền → kết quả)', gui: ['Tên hàng: máy bơm nước ly tâm\nChất liệu: gang\nThông số: công suất 1.5HP, điện áp 220V'] });
await kichBan({ ten: '3. Gửi mã HS 8 số (gói 2: thuế + thủ tục)', gui: ['84137090'] });
await kichBan({ ten: '4. Hỏi thuế bằng câu tự do (não chọn gói 2)', gui: ['thuế cái máy bơm vừa rồi với hàng Nhật là bao nhiêu'], brain: brainChon });
await kichBan({ ten: '5. Câu mơ hồ → não hỏi lại MỘT câu', gui: ['cho em hỏi cái này'], brain: brainHoiLai });
await kichBan({ ten: '6. Chào hỏi có não → trả lời ngắn, dẫn về menu', gui: ['chào bạn'], brain: brainChao });
await kichBan({ ten: '7. Gõ "menu"', gui: ['menu'] });
await kichBan({ ten: '8. Gõ "chi tiết" khi chưa có gì', gui: ['chi tiết'] });
