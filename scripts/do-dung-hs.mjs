#!/usr/bin/env node
// scripts/do-dung-hs.mjs — Bộ đo độ đúng phân loại HS (issue #177, yêu cầu 5).
//
// Chạy từng ca của bộ đề qua ĐÚNG đường bot đang dùng (lõi core/ + gói hs, qua `runSingleScenario`
// của scripts/qa-that.mjs — không dựng đường riêng), rồi chấm trên TIN GỬI KHÁCH:
//   top-1 = mã ở dòng "✅ Mã HS đề xuất"; top-3 = mã đó + mục "🔁 Mã khác cần cân nhắc".
// Đo tám số: đúng 6 số đầu mà lệch 2 số cuối KHÔNG tính là đúng (chỉ ghi `dung6So` để biết lệch cấp nào).
//
// Bộ đề dựng từ VĂN BẢN PHÁP LUẬT (CEO 10/11: phân loại HS bám luật): tên dòng biểu thuế
// (hs-code-api `data/tax.json`) + Thông báo kết quả phân loại của Hải quan (`data/precedents.json`),
// mỗi ca kèm số hiệu văn bản và trích nguyên văn căn cứ. KHÔNG lấy từ `oz-gold-final.jsonl` hay tờ khai cũ.
//
// Dùng:
//   node scripts/do-dung-hs.mjs --mock           # giả lập: kiểm đường đo chạy được, KHÔNG ra số độ đúng thật
//   node scripts/do-dung-hs.mjs                  # Cổng OZ thật (cần OZ_MCP_TOKEN, GEMINI_API_KEY trong .env)
//   node scripts/do-dung-hs.mjs --n=10 --out=bao-cao/do-dung
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSingleScenario, loadDotEnv } from './qa-that.mjs';
import { vnDateKey, vnStamp } from '../core/time.js';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Bộ đề dựng từ văn bản pháp luật — đường dẫn tương đối gốc repo (test đọc lại tệp thô). */
export const DUONG_BO_DE = 'eval/bo-de/phan-loai-tu-luat.json';

/** Nguồn hợp lệ của một ca: chỉ văn bản pháp luật, không phải tờ khai hay bộ vàng nội bộ. */
const NGUON_HOP_LE = /^(TB-TCHQ|CBP-CROSS-RULING|ABF-TCO|BIEU_THUE)$/;

const chiSo = (s) => String(s ?? '').replace(/\D/g, '');

/** Đọc bộ đề và kiểm khuôn từng ca; sai khuôn thì ném lỗi chứ không chấm bừa. */
export function docBoDe(duong = join(ROOT_DIR, DUONG_BO_DE)) {
  const raw = JSON.parse(readFileSync(duong, 'utf8'));
  if (!Array.isArray(raw) || !raw.length) throw new Error('do-dung-hs: bộ đề rỗng');
  return raw.map((ca, i) => {
    const ma = chiSo(ca.ma);
    if (ma.length !== 8) throw new Error(`do-dung-hs: ca #${i + 1} mã đáp án không phải 8 số: ${ca.ma}`);
    const nguon = ca.nguon || {};
    if (!NGUON_HOP_LE.test(String(nguon.loai || ''))) {
      throw new Error(`do-dung-hs: ca ${ma} nguồn không phải văn bản pháp luật: ${nguon.loai}`);
    }
    return {
      ma,
      cauKhach: String(ca.cauKhach || '').trim(),
      maLan: (ca.maLan || []).map(chiSo).filter((m) => m.length === 8 && m !== ma),
      tenDongBieuThue: String(ca.tenDongBieuThue || '').trim(),
      nguon: {
        loai: String(nguon.loai || ''),
        soHieu: String(nguon.soHieu || ''),
        nam: nguon.nam ?? null,
        trich: String(nguon.trich || '').trim(),
        tepBieuThue: String(nguon.tepBieuThue || ''),
      },
    };
  });
}

// Các tiêu đề mở ra một vùng liệt kê mã, đúng như packs/hs/render.js đang in:
//   renderPhanLoaiDayDu: "✅ Mã HS đề xuất: 1208.10.00"  rồi  "🔁 Mã khác cần cân nhắc" + các dòng "• mã"
//   renderClassify:      "✅ Mã đề xuất:" / "Mã có thể (…):"  rồi các dòng "1. mã", "2. mã", "3. mã"
const DAU_MUC_MA = /Mã HS đề xuất|Mã đề xuất|Mã có thể|Mã khác cần cân nhắc/;
const DONG_LIET_KE = /^\s*(?:\d{1,2}[.)]|[•*\-+])\s/;
const MOT_MA = /(?<!\d)(\d{4})[.\s]?(\d{2})[.\s]?(\d{2})(?!\d)/;

// Khuôn thứ hai — GIỌNG QUYÊN (packs/hs/giong-quyen.js:67,70), là khuôn bot dùng ở chat riêng:
//   "Dạ máy xay sinh tố thì mã phù hợp nhất là {b}8509.40.00{/b} (máy chế biến thực phẩm) …"
//   "Dạ theo giả định xuất xứ Trung Quốc thì mã phù hợp nhất là {b}1208.10.00{/b} (…) …"
// Tin này KHÔNG có tiêu đề mục nào, nên vòng quét theo vùng liệt kê ở trên bỏ qua sạch. Thiếu
// khuôn này thì mọi ca giọng Quyên bị chấm "bot không ra mã" và độ đúng ra thấp giả (soát PR #204).
const MA_PHU_HOP_NHAT = /mã (?:HS )?(?:phù hợp nhất|đề xuất|chốt) (?:là|:)\s*(?:\{b\})?\s*(\d{4})[.\s]?(\d{2})[.\s]?(\d{2})(?!\d)/i;

/**
 * Mã bot đưa ra cho khách, THEO THỨ TỰ ưu tiên (mã chốt/mã số 1 trước, rồi các mã cân nhắc).
 * Chỉ đọc TIN GỬI KHÁCH, và chỉ ở vùng liệt kê mã — đo đúng thứ khách nhìn thấy, không đo dữ
 * liệu thô của Cổng (Cổng trả 3 mã nhưng bot có thể chỉ hiển thị 1), cũng không nhặt mã nằm
 * trong mục thuế/chính sách/văn bản (những mã đó không phải mã bot đề xuất).
 */
export function docMaTuTin(texts = []) {
  const ra = [];
  const them = (m) => { if (m && !ra.includes(m)) ra.push(m); };
  // Một dòng liệt kê chỉ mang MỘT mã bot đề xuất: render in "• 2106.10.00 — không phải
  // 2106.90.00 vì…", lấy cả hai thì mã bị loại trừ trong lý do lại được tính là mã bot đưa ra
  // và đẩy mã thật ra khỏi top-3. Nên chỉ lấy mã ĐẦU TIÊN của dòng.
  const nhat = (dong) => {
    const m = dong.match(MOT_MA);
    if (m) them(m[1] + m[2] + m[3]);
  };
  for (const t of texts) {
    let trongVung = false;
    for (const dong of String(t || '').split('\n')) {
      const quyen = dong.match(MA_PHU_HOP_NHAT);
      if (quyen) {
        // Câu chốt của giọng Quyên: lấy mã rồi đóng vùng — các dòng sau là thuế/chính sách/lưu ý,
        // mã trong đó (số hiệu văn bản, mức thuế) không phải mã bot đề xuất.
        them(quyen[1] + quyen[2] + quyen[3]);
        trongVung = false;
        continue;
      }
      if (DAU_MUC_MA.test(dong)) {
        trongVung = true;
        nhat(dong); // tiêu đề "Mã HS đề xuất: 1208.10.00" có mã ngay trên dòng
      } else if (trongVung && DONG_LIET_KE.test(dong)) {
        nhat(dong);
      } else if (trongVung && (!dong.trim() || /^\s/.test(dong))) {
        // Dòng trống hoặc dòng lý do thụt đầu ("   vì chưa khử béo…") vẫn thuộc vùng liệt kê,
        // nhưng KHÔNG nhặt mã trong đó: lý do hay nhắc mã bị loại trừ, nhặt vào là chấm sai.
      } else {
        trongVung = false; // hết vùng liệt kê (sang mục thuế/chính sách/căn cứ…)
      }
    }
  }
  return ra;
}

/**
 * Chấm một ca: so mã bot đưa ra với mã của văn bản pháp luật.
 * @param {{ma:string, maLan?:string[]}} ca
 * @param {string[]} maBotRa danh sách mã bot đưa ra, theo thứ tự ưu tiên
 */
export function chamMotCa(ca, maBotRa = []) {
  const dapAn = chiSo(ca.ma);
  const ds = (maBotRa || []).map(chiSo).filter((m) => m.length === 8);
  const top1 = ds[0] === dapAn;
  const top3 = ds.slice(0, 3).includes(dapAn);
  const maBot = ds[0] || null;
  const dung6So = Boolean(maBot) && !top1 && maBot.slice(0, 6) === dapAn.slice(0, 6);
  const maLan = (ca.maLan || []).map(chiSo);
  const roiVaoMaLan = maBot && !top1 && maLan.includes(maBot) ? maBot : null;

  // Thứ tự nhánh có ý nghĩa: `roiVaoMaLan` phải xét TRƯỚC `dung6So`. Mã dễ lẫn thường cùng 6 số
  // đầu với mã đúng (bộ đề có 6 ca như vậy: 2517.41.00 ↔ 2517.49.00…). Để `dung6So` chặn trước thì
  // lý do in ra là "lệch 2 số cuối" — nghe như sai nhỏ, trong khi bot đã rơi vào đúng cái mã văn
  // bản loại trừ, là lỗi nặng hơn và là chỗ cần sửa. Soát PR #204 điểm 3.
  let lyDo = '';
  if (!maBot) lyDo = 'bot không ra mã nào cho khách';
  else if (top1) lyDo = 'đúng ngay mã đầu';
  else if (top3) lyDo = `đúng nhưng không ở vị trí 1 (bot đưa ${maBot} trước)`;
  else if (roiVaoMaLan) lyDo = `rơi vào đúng mã dễ lẫn mà văn bản đã loại trừ (${maBot})${dung6So ? ', cùng 6 số đầu' : ''}`;
  else if (dung6So) lyDo = `đúng 6 số đầu, lệch 2 số cuối (bot ra ${maBot})`;
  else lyDo = `sai mã (bot ra ${maBot})`;

  return { ma: dapAn, maBot, maBotRa: ds, top1, top3, dung6So, roiVaoMaLan, lyDo };
}

/** Tổng hợp: top-1, top-3 tám số, thời gian trung bình một ca. */
export function tongHop(ketQua = []) {
  const tong = ketQua.length;
  const top1 = ketQua.filter((r) => r.top1).length;
  const top3 = ketQua.filter((r) => r.top3).length;
  const pct = (n) => (tong ? ((n / tong) * 100).toFixed(1) : '0.0');
  const tongMs = ketQua.reduce((s, r) => s + (r.msCho || 0), 0);
  return {
    tong,
    top1,
    top3,
    top1Pct: pct(top1),
    top3Pct: pct(top3),
    khongRaMa: ketQua.filter((r) => !r.maBot).length,
    dung6So: ketQua.filter((r) => r.dung6So).length,
    roiVaoMaLan: ketQua.filter((r) => r.roiVaoMaLan).length,
    msTrungBinh: tong ? Math.round(tongMs / tong) : 0,
  };
}

/** Một ca thành kịch bản của bộ QA: khách gõ form có nhãn nên bot tra luôn, không hỏi lại. */
function kichBanCuaCa(ca, i) {
  return {
    id: `do-dung-${ca.ma}`,
    dich: 'ĐO',
    ten: `Đo độ đúng ca ${i + 1} — ${ca.ma}`,
    chatId: `do_dung_${i + 1}`,
    userId: `do_dung_user_${i + 1}`,
    steps: [{
      mieuTa: `phân loại: ${ca.cauKhach.slice(0, 60)}`,
      text: `Tên hàng: ${ca.cauKhach}`,
      phanLoai: true,
      kyVong: {},
    }],
  };
}

/**
 * Chạy bộ đo. `isMock` chỉ kiểm đường đo chạy được, KHÔNG ra số độ đúng thật.
 * `customMcp` để test tự kiểm cái thước: Cổng kịch bản trả đúng mã thì bộ đo phải chấm đạt.
 */
export async function chayBoDo({ env = process.env, isMock = false, n = 0, boDe = null, customMcp = null, im = false, now = () => new Date() } = {}) {
  const mergedEnv = { ...loadDotEnv(), ...env };
  if (!isMock && !customMcp && !mergedEnv.OZ_MCP_TOKEN) {
    return { ok: false, thieuEnv: true };
  }
  const cases = (boDe || docBoDe()).slice(0, n > 0 ? n : undefined);
  const ketQua = [];
  for (const [i, ca] of cases.entries()) {
    const batDau = Date.now();
    let maBotRa = [];
    let loi = null;
    try {
      const res = await runSingleScenario(kichBanCuaCa(ca, i), { env: mergedEnv, isMock, customMcp, now });
      maBotRa = docMaTuTin(res.stepResults.flatMap((s) => s.sent || []));
      if (res.lyDo && /Lỗi thực thi/.test(res.lyDo)) loi = res.lyDo;
    } catch (err) {
      loi = `lỗi chạy ca: ${err?.message || err}`;
    }
    const cham = chamMotCa(ca, maBotRa);
    const r = { ...cham, msCho: Date.now() - batDau, cauKhach: ca.cauKhach, nguon: ca.nguon, loi };
    if (loi) r.lyDo = loi;
    ketQua.push(r);
    if (!im) {
      const dau = r.top1 ? '✓' : (r.top3 ? '~' : '✗');
      console.log(`${dau} [${i + 1}/${cases.length}] ${ca.ma} ← ${r.maBot || '(không có mã)'} (${(r.msCho / 1000).toFixed(1)}s)`);
    }
  }
  return { ok: true, ketQua, tomTat: tongHop(ketQua), isMock };
}

/** Báo cáo Markdown — dán vào PR làm bằng chứng. */
export function dungBaoCao({ ketQua, tomTat, isMock, startedAt = new Date() }) {
  const l = [];
  l.push('# Bộ đo độ đúng phân loại HS');
  l.push('');
  l.push(`> Chạy: ${vnStamp(startedAt)} (giờ VN) · ${isMock ? '**chế độ `--mock`**' : 'Cổng OZ thật'}`);
  l.push('');
  if (isMock) {
    l.push('⚠️ Chế độ `--mock` chỉ kiểm **đường đo chạy được** (bộ đề → lõi → tin gửi khách → chấm).');
    l.push('Cổng OZ giả chỉ biết vài món nên **mọi con số dưới đây KHÔNG phải độ đúng thật của bot**.');
    l.push('Số thật phải chạy không có `--mock`, cần `OZ_MCP_TOKEN`.');
    l.push('');
  }
  l.push('## Bộ đề');
  l.push('');
  l.push(`- Nguồn: tên dòng biểu thuế + Thông báo kết quả phân loại của Hải quan (\`${DUONG_BO_DE}\`).`);
  l.push('- Không lấy từ `oz-gold-final.jsonl` hay tờ khai cũ (CEO 10/11: phân loại HS bám luật).');
  l.push(`- Số ca chạy: **${tomTat.tong}**.`);
  l.push('');
  l.push('## Kết quả');
  l.push('');
  l.push('| Chỉ số | Số ca | Tỉ lệ |');
  l.push('|---|---|---|');
  l.push(`| Đúng tám số ở vị trí 1 (top-1) | ${tomTat.top1}/${tomTat.tong} | **${tomTat.top1Pct}%** |`);
  l.push(`| Đúng tám số trong 3 mã đầu (top-3) | ${tomTat.top3}/${tomTat.tong} | **${tomTat.top3Pct}%** |`);
  l.push(`| Bot không ra mã nào | ${tomTat.khongRaMa}/${tomTat.tong} | ${((tomTat.khongRaMa / (tomTat.tong || 1)) * 100).toFixed(1)}% |`);
  l.push(`| Đúng 6 số, lệch 2 số cuối | ${tomTat.dung6So}/${tomTat.tong} | ${((tomTat.dung6So / (tomTat.tong || 1)) * 100).toFixed(1)}% |`);
  l.push(`| Rơi vào mã dễ lẫn văn bản đã loại trừ | ${tomTat.roiVaoMaLan}/${tomTat.tong} | ${((tomTat.roiVaoMaLan / (tomTat.tong || 1)) * 100).toFixed(1)}% |`);
  l.push('');
  l.push(`Thời gian trung bình một ca: **${(tomTat.msTrungBinh / 1000).toFixed(1)}s**.`);
  l.push('');
  l.push('## Từng ca');
  l.push('');
  l.push('| # | Mã đúng (văn bản) | Bot ra | top-1 | top-3 | Giây | Căn cứ |');
  l.push('|---|---|---|---|---|---|---|');
  ketQua.forEach((r, i) => {
    l.push(`| ${i + 1} | ${r.ma} | ${r.maBot || '—'} | ${r.top1 ? '✓' : '✗'} | ${r.top3 ? '✓' : '✗'} | ${(r.msCho / 1000).toFixed(1)} | ${r.nguon?.soHieu || ''} |`);
  });
  l.push('');
  l.push('## Ca trượt — đọc để biết sửa gì');
  l.push('');
  const truot = ketQua.filter((r) => !r.top1);
  if (!truot.length) l.push('Không có ca trượt top-1.');
  for (const r of truot) {
    l.push(`- **${r.ma}** (${r.nguon?.soHieu || 'không rõ văn bản'}): ${r.lyDo}.`);
    l.push(`  - Khách gõ: ${r.cauKhach.slice(0, 180)}`);
    if (r.nguon?.trich) l.push(`  - Căn cứ văn bản: ${r.nguon.trich.slice(0, 260)}`);
  }
  l.push('');
  return l.join('\n');
}

const docCo = (argv, ten, md = null) => {
  const hit = argv.find((a) => a === `--${ten}` || a.startsWith(`--${ten}=`));
  if (!hit) return md;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const isMock = Boolean(docCo(argv, 'mock', false));
  const n = Number(docCo(argv, 'n', 0)) || 0;
  const outDir = join(ROOT_DIR, String(docCo(argv, 'out', 'bao-cao/do-dung')));

  const res = await chayBoDo({ isMock, n });
  if (res.thieuEnv) {
    console.error('\ndo-dung-hs: thiếu OZ_MCP_TOKEN nên KHÔNG đo được độ đúng thật.');
    console.error('  - Cấu hình .env (xem .env.example), hoặc');
    console.error('  - chạy thử đường đo: node scripts/do-dung-hs.mjs --mock\n');
    process.exit(1);
  }
  const startedAt = new Date();
  mkdirSync(outDir, { recursive: true });
  const duong = join(outDir, `${vnDateKey(startedAt)}${isMock ? '-mock' : ''}.md`);
  writeFileSync(duong, dungBaoCao({ ...res, startedAt }), 'utf8');
  const t = res.tomTat;
  console.log(`\n📄 Báo cáo: ${duong}`);
  console.log(`📊 top-1 ${t.top1}/${t.tong} (${t.top1Pct}%) · top-3 ${t.top3}/${t.tong} (${t.top3Pct}%) · trung bình ${(t.msTrungBinh / 1000).toFixed(1)}s\n`);
}
