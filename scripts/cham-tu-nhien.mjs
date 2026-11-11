// scripts/cham-tu-nhien.mjs — chấm độ tự nhiên câu trả lời của bot theo hồ sơ giọng Quyên (issue #168, phần 3;
// nghiệm thu #136: thang 1–5, trung bình ≥ 4).
//
// Nguồn câu: chạy các kịch bản `eval/qa-that/*.json` ở chế độ giả lập (lõi thật, Cổng giả, 0 lượt gọi Zalo),
// gom mọi tin bot gửi (bỏ trùng). Hai cách chấm:
//   --luat   (mặc định khi thiếu GEMINI_API_KEY) chấm bằng luật máy, không mạng — để CI và máy không khoá chạy được;
//   --llm    chấm bằng Gemini (cần GEMINI_API_KEY trong môi trường hoặc .env) theo cùng hồ sơ giọng.
// In bảng điểm Markdown ra stdout (dán vào PR). Thoát 1 khi trung bình < 4. Không in khoá.
//
// Dùng: node scripts/cham-tu-nhien.mjs [--luat|--llm] [--nguong 4]
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSingleScenario, loadDotEnv } from './qa-that.mjs';
import { plain } from '../packs/hs/style.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const HO_SO_GIONG = `Hồ sơ giọng "Quyên" — trợ lý hải quan của OZ trên Zalo:
- Xưng "em", gọi khách "anh/chị" (hoặc đúng xưng hô khách đã dùng); mở đầu "Dạ", kết câu lễ phép ("ạ", "nhé").
- Câu ngắn, ấm, như nhân viên thật nhắn tin; mỗi tin chỉ xử lý MỘT việc, tối đa 7 dòng.
- Không khối tiêu đề in đậm dày đặc, không markdown (**), không khoá kỹ thuật tiếng Anh (Reasons, Evidence, Status…).
- Tối đa 2 emoji. Không "(Tự động chọn gói N)", không chân "Gõ menu".
- Căn cứ pháp lý gọn trong ngoặc, không làm câu nặng nề.`;

const EMOJI = /\p{Extended_Pictographic}/gu;

/** Chấm bằng luật máy (1–5). Trả { diem, lyDo }. `choPhepDai`: khách tự xin "chi tiết"/"căn cứ" thì không trừ độ dài. */
export function chamLuat(text, { choPhepDai = false } = {}) {
  const s = plain(String(text ?? '')).replace(/^@[^\n]+\n/, '');
  const dong = s.split('\n').filter((l) => l.trim());
  let diem = 5;
  const tru = [];
  const bot = (n, ly) => { diem -= n; tru.push(ly); };
  if (dong.length > 7 && !choPhepDai) bot(1, `${dong.length} dòng (> 7)`);
  if (/\*\*/.test(s)) bot(1, 'còn dấu ** markdown');
  if (/\b(Reasons|Evidence|Scope|Sources|Disclaimer|Status|BLOCKING|Raw Text)\b/.test(s)) bot(1, 'lộ khoá kỹ thuật tiếng Anh');
  if ((s.match(EMOJI) || []).length > 2) bot(1, 'quá 2 emoji');
  if (/Tự động chọn gói|Gõ "menu"/.test(s)) bot(1, 'câu khuôn máy ("Tự động chọn gói"/"Gõ menu")');
  if (!/^(Dạ|Em |Chào)/.test(s.trim()) && !/\bạ\b/.test(s)) bot(1, 'thiếu lễ phép (Dạ/ạ)');
  if (!/anh\/chị|anh|chị/i.test(s)) bot(0.5, 'không gọi khách');
  return { diem: Math.max(1, diem), lyDo: tru.join('; ') || 'đúng hồ sơ giọng' };
}

/** Chấm bằng Gemini theo hồ sơ giọng. Lỗi mạng/khoá → null (người gọi tự xử). */
export async function chamLlm(text, { apiKey, model = 'gemini-flash-latest', fetchImpl = fetch } = {}) {
  const body = {
    systemInstruction: { parts: [{ text: `${HO_SO_GIONG}\nBạn là người chấm. Chấm độ tự nhiên của MỘT tin bot gửi khách theo thang 1–5 (5 = như nhân viên thật nhắn, đúng hồ sơ giọng). Chỉ trả JSON {"diem": <1-5>, "lyDo": "<một câu>"}.` }] },
    contents: [{ role: 'user', parts: [{ text: plain(String(text)) }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 200 },
  };
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const o = JSON.parse((j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''));
    const d = Number(o?.diem);
    return d >= 1 && d <= 5 ? { diem: d, lyDo: String(o.lyDo || '').slice(0, 160) } : null;
  } catch { return null; }
}

/** Gom mọi tin bot gửi trong các kịch bản QA (giả lập), bỏ trùng. */
export async function gomCau({ dir = join(ROOT, 'eval', 'qa-that') } = {}) {
  const cau = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const sc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const r = await runSingleScenario(sc, { isMock: true });
    for (const st of r.stepResults) {
      const choPhepDai = /chi tiết|căn cứ/i.test(String(st.input || ''));
      for (const t of st.sent) if (!cau.some((c) => c.text === t)) cau.push({ kichBan: sc.id, buoc: st.stepIndex, text: t, choPhepDai });
    }
  }
  return cau;
}

export function bangDiem(ketQua) {
  const tb = ketQua.reduce((s, x) => s + x.diem, 0) / (ketQua.length || 1);
  const dong = ['| # | Kịch bản · bước | Điểm | Lý do | Câu (đầu) |', '|---|---|---|---|---|'];
  ketQua.forEach((x, i) => dong.push(`| ${i + 1} | ${x.kichBan} · ${x.buoc} | ${x.diem} | ${x.lyDo.replace(/\|/g, '/')} | ${plain(x.text).replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 70)}… |`));
  dong.push('', `**Trung bình: ${tb.toFixed(2)} / 5** trên ${ketQua.length} câu.`);
  return { tb, md: dong.join('\n') };
}

async function main() {
  const argv = process.argv.slice(2);
  const env = { ...loadDotEnv(), ...process.env };
  const i = argv.indexOf('--nguong');
  const nguong = i >= 0 ? Number(argv[i + 1]) : 4;
  const llm = argv.includes('--llm') || (!argv.includes('--luat') && Boolean(env.GEMINI_API_KEY));
  if (llm && !env.GEMINI_API_KEY) { console.error('Thiếu GEMINI_API_KEY — chạy --luat để chấm bằng luật máy.'); process.exitCode = 2; return; }
  const cau = await gomCau();
  const ketQua = [];
  for (const c of cau) {
    const luat = chamLuat(c.text, c);
    const d = llm ? (await chamLlm(c.text, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined })) ?? { ...luat, lyDo: `(Gemini lỗi, chấm luật) ${luat.lyDo}` } : luat;
    ketQua.push({ ...c, ...d });
  }
  const { tb, md } = bangDiem(ketQua);
  console.log(`## Điểm độ tự nhiên (${llm ? 'Gemini' : 'luật máy'}) — hồ sơ giọng Quyên\n\n${md}`);
  process.exitCode = tb >= nguong ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
