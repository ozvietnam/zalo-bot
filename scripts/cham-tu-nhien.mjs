// scripts/cham-tu-nhien.mjs — chấm ĐỘ TỰ NHIÊN câu trả lời của bot, thang 1–5 theo hồ sơ giọng Quyên.
// Nghiệm thu #168: trung bình phải ≥ 4, bảng điểm dán vào mô tả PR.
//
// Hai lớp đo, cố ý tách rời:
//   1. ĐO MÁY (doDeterministic) — số dòng, số emoji, xưng hô, lời nhắc "mã chỉ là gợi ý".
//      Chạy được mọi lúc, không cần khoá, không tốn tiền, kết quả lặp lại y nguyên.
//   2. CHẤM LLM (taoChamGemini) — phần "nghe có như người thật không" mà máy không đo được.
//      Không có `GEMINI_API_KEY` → trả null và báo rõ "CHƯA CHẠY", tuyệt đối không bịa điểm
//      (Hiến pháp IV: bằng chứng trước lời khai; VIII: thật thà).
//
// Dùng:  node scripts/cham-tu-nhien.mjs            (chấm các tin bot trong báo cáo qa-that mới nhất)
//        node scripts/cham-tu-nhien.mjs <tệp.md>   (chấm một báo cáo cụ thể)
// Không in khoá, không in token. Khoá đi ở header, không bao giờ nằm trong URL.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const NGUONG_DAT = 4;

/**
 * Thang chấm, bám `docs/hop-dong/luoc-do-nhan-vat.md` (nhóm `mucTheHienKenh`, `danhTinh.xungHo`)
 * và phần tiêu chí ghi ở đầu `packs/hs/giong-quyen.js`. Người chấm (LLM) đọc nguyên văn khối này.
 */
export const TIEU_CHI = [
  { ma: 'xung-ho', moTa: 'Xưng hô đúng hồ sơ: bot tự xưng "em", gọi khách "anh/chị" (mặc định khi chưa biết giới tính). Gọi cứng "anh nhé"/"Anh muốn" là lỗi.' },
  { ma: 'do-dai', moTa: 'Tin đầu ngắn gọn, khoảng 6–7 dòng trở xuống: ý chính trước, chi tiết chỉ khi khách hỏi thêm.' },
  { ma: 'emoji', moTa: 'Tối đa 2 emoji một tin; không rải emoji trang trí.' },
  { ma: 'giong-nguoi', moTa: 'Đọc như một bạn nhân viên thật nhắn Zalo: câu liền mạch, không dán nhãn kỹ thuật thô, không dồn tiêu đề in đậm, không chèn "(Tự động chọn gói N)".' },
  { ma: 'trach-nhiem', moTa: 'Nêu rõ mã HS và thuế chỉ là gợi ý tham khảo, và mời khách bước tiếp theo — không hứa chắc, không chốt giá.' },
];

const RE_EMOJI = /\p{Extended_Pictographic}/gu;

/** Số dòng có chữ của một tin. */
export function demDong(text = '') {
  const t = String(text).trim();
  return t ? t.split(/\r?\n/).length : 0;
}

/** Số emoji trong tin. */
export function demEmoji(text = '') {
  return (String(text).match(RE_EMOJI) || []).length;
}

/**
 * Phần đo được bằng máy. Không cần LLM, không cần khoá.
 * `\b` của JS vỡ với chữ có dấu nên dùng `(?!\p{L})` (xem `packs/hs/xung-ho.js:15`).
 */
export function doDeterministic(text = '') {
  const t = String(text);
  return {
    soDong: demDong(t),
    soEmoji: demEmoji(t),
    coXungHo: /(?:^|[^\p{L}])(anh\/chị|Anh\/chị)(?!\p{L})/u.test(t),
    // Gọi cứng một giới: "anh nhé", "Anh muốn", "anh ạ" — khách có thể là chị.
    anhNheCung: /(?:^|[^\p{L}])anh\s+(nhé|ạ|muốn|cần|xem)(?!\p{L})/iu.test(t),
    coNhacGoiY: /gợi ý tham khảo|chỉ là gợi ý/i.test(t),
  };
}

const HE_THONG = `Bạn là người soát chất lượng tin nhắn của bot Zalo công ty OZ Việt Nam.
Nhân vật bot: tên Quyên, tự xưng "em", gọi khách "anh/chị", nhắn tin Zalo tiếng Việt.
Việc của bạn: cho MỘT điểm từ 1 đến 5 về ĐỘ TỰ NHIÊN của tin nhắn (1 = như máy đọc bảng dữ liệu, 5 = như bạn nhân viên thật nhắn tin), theo đúng các tiêu chí sau:
${TIEU_CHI.map((t, i) => `${i + 1}. [${t.ma}] ${t.moTa}`).join('\n')}
Chỉ chấm cách DIỄN ĐẠT. KHÔNG chấm đúng/sai nghiệp vụ (mã HS, thuế suất, số hiệu văn bản) — phần đó đã có kiểm máy riêng.
Trả lời DUY NHẤT một đối tượng JSON: {"diem": <số 1..5, cho phép .5>, "nhanXet": "<một câu ngắn tiếng Việt>"}. Không viết gì khác.`;

/**
 * Người chấm bằng Gemini. KHÔNG có khoá → trả `null` để nơi gọi báo rõ "chưa chạy".
 * Mọi lỗi (HTTP, mạng, JSON sai khuôn, điểm ngoài thang 1–5) → `cham()` trả `null`:
 * không chấm được thì để trống, không kẹp về biên và không đoán điểm.
 */
export function taoChamGemini({
  apiKey,
  model = 'gemini-flash-latest',
  fetchImpl = fetch,
  timeoutMs = 20_000,
  log = { info() {}, error() {} },
} = {}) {
  if (!apiKey) return null;

  async function cham(text) {
    const cau = String(text ?? '').slice(0, 4000).trim();
    if (!cau) return null;
    try {
      // Khoá đi ở header `x-goog-api-key`, KHÔNG bao giờ nối vào URL (URL hay bị ghi vào log).
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: HE_THONG }] },
          contents: [{ role: 'user', parts: [{ text: `Tin nhắn bot cần chấm:\n"""\n${cau}\n"""` }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        log.error?.(`[cham] LLM lỗi HTTP ${res.status}`);
        return null;
      }
      const j = await res.json().catch(() => null);
      const raw = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join('');
      const o = JSON.parse(String(raw).replace(/^```(?:json)?|```$/g, '').trim());
      const diem = typeof o?.diem === 'number' ? o.diem : NaN;
      if (!Number.isFinite(diem) || diem < 1 || diem > 5) return null;
      return { diem, nhanXet: String(o.nhanXet ?? '').slice(0, 200) };
    } catch (e) {
      log.error?.(`[cham] ${e?.name === 'TimeoutError' ? 'quá giờ' : e?.message || 'lỗi'}`);
      return null;
    }
  }

  return { cham, model };
}

/** Trung bình các tin CHẤM ĐƯỢC. Tin chưa chấm được không bị tính thành 0 — nó bị loại khỏi phép chia. */
export function tongHop(ketQua = []) {
  const diem = ketQua.map((r) => r?.diem).filter((d) => typeof d === 'number' && Number.isFinite(d));
  const soTinDaCham = diem.length;
  const soTinChuaCham = ketQua.length - soTinDaCham;
  if (!soTinDaCham) return { trungBinh: null, dat: false, soTinDaCham: 0, soTinChuaCham, nguong: NGUONG_DAT };
  const tb = Math.round((diem.reduce((s, d) => s + d, 0) / soTinDaCham) * 100) / 100;
  return { trungBinh: tb, dat: tb >= NGUONG_DAT, soTinDaCham, soTinChuaCham, nguong: NGUONG_DAT };
}

/** Bảng Markdown dán thẳng vào mô tả PR. */
export function bangMarkdown(ketQua = []) {
  const t = tongHop(ketQua);
  const l = [
    '| Tin | Điểm tự nhiên (1–5) | Dòng | Emoji | Xưng hô anh/chị | Nhận xét |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of ketQua) {
    const d = r.do || doDeterministic('');
    const diem = typeof r.diem === 'number' ? String(r.diem) : '— *(chưa chấm được)*';
    const nx = String(r.nhanXet || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    l.push(`| ${r.nhan} | ${diem} | ${d.soDong} | ${d.soEmoji} | ${d.coXungHo ? '✔' : '—'} | ${nx} |`);
  }
  l.push('');
  l.push(t.trungBinh == null
    ? `**Trung bình: CHƯA CHẠY** — không chấm được tin nào (thiếu \`GEMINI_API_KEY\` hoặc LLM lỗi). Ngưỡng đạt: ≥ ${t.nguong}.`
    : `**Trung bình: ${t.trungBinh}/5** trên ${t.soTinDaCham} tin${t.soTinChuaCham ? ` (${t.soTinChuaCham} tin chưa chấm được)` : ''} — ngưỡng ≥ ${t.nguong} → ${t.dat ? '**ĐẠT**' : '**CHƯA ĐẠT**'}.`);
  return l.join('\n');
}

/** Bóc các tin bot (khối ```text) kèm nhãn bước từ một báo cáo `qa-that/ket-qua-*.md`. */
export function bocTinTuBaoCao(md = '') {
  const ra = [];
  let kichBan = '';
  let buoc = '';
  const dong = String(md).split(/\r?\n/);
  for (let i = 0; i < dong.length; i++) {
    const d = dong[i];
    const mKb = d.match(/^### (.+)$/);
    if (mKb) { kichBan = mKb[1].split('·').pop().trim().slice(0, 40); continue; }
    const mB = d.match(/^#### (Bước \d+)/);
    if (mB) { buoc = mB[1]; continue; }
    if (d.trim() === '```text') {
      const than = [];
      for (i += 1; i < dong.length && dong[i].trim() !== '```'; i++) than.push(dong[i]);
      const text = than.join('\n').trim();
      if (text) ra.push({ nhan: `${kichBan} — ${buoc}`.trim(), text });
    }
  }
  return ra;
}

/** Chạy chấm trên một báo cáo qa-that. */
export async function chamBaoCao(filePath, { env = process.env } = {}) {
  const md = readFileSync(filePath, 'utf8');
  const tin = bocTinTuBaoCao(md);
  const nguoiCham = taoChamGemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined, log: console });

  const ketQua = [];
  for (const t of tin) {
    const llm = nguoiCham ? await nguoiCham.cham(t.text) : null;
    ketQua.push({
      nhan: t.nhan,
      diem: llm?.diem ?? null,
      nhanXet: llm?.nhanXet ?? (nguoiCham ? 'LLM không chấm được tin này' : 'CHƯA CHẠY: thiếu GEMINI_API_KEY'),
      do: doDeterministic(t.text),
    });
  }
  return { ketQua, tongHop: tongHop(ketQua), bang: bangMarkdown(ketQua), coNguoiCham: Boolean(nguoiCham) };
}

/** Báo cáo qa-that mới nhất trong `qa-that/`. */
function baoCaoMoiNhat() {
  const dir = join(ROOT_DIR, 'qa-that');
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).filter((x) => /^ket-qua-.*\.md$/.test(x)).sort();
  return f.length ? join(dir, f[f.length - 1]) : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  const file = arg || baoCaoMoiNhat();
  if (!file || !existsSync(file)) {
    console.error('Không thấy báo cáo để chấm. Chạy `node scripts/qa-that.mjs --mock` trước, hoặc truyền đường dẫn tệp .md.');
    process.exit(1);
  }
  const r = await chamBaoCao(file);
  if (!r.coNguoiCham) {
    console.error('\n⚠️  CHƯA CHẤM ĐƯỢC ĐỘ TỰ NHIÊN: thiếu GEMINI_API_KEY.');
    console.error('   Phần đo máy (số dòng, emoji, xưng hô) vẫn in dưới đây; điểm 1–5 để TRỐNG, không bịa.\n');
  }
  console.log(`Nguồn: ${file}  (${r.ketQua.length} tin)\n`);
  console.log(r.bang);
  const out = join(ROOT_DIR, 'qa-that', 'diem-tu-nhien.md');
  writeFileSync(out, `# Điểm độ tự nhiên — nguồn \`${file.replace(ROOT_DIR + '/', '')}\`\n\n${r.bang}\n`, 'utf8');
  console.log(`\n📄 Đã ghi ${out}`);
  if (!r.tongHop.dat) process.exit(1);
}
