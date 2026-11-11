// packs/hs/editor.js — não biên tập: Gemini viết lại kết quả dài thành bản chốt ngắn cho khách Zalo.
// Hiến chương III (số tiền/thuế do code tra): mọi dãy số trong bản chốt phải có sẵn trong bản gốc —
// code kiểm lại TỪNG số (soDungChuan); không khớp → bỏ bản chốt, trả null để nơi gọi giữ bản đầy đủ.
// Gemini lỗi/quá tải → khoá dự phòng (llm2.js, nếu có cấu hình). Kết quả dị → null. Không bao giờ ném lỗi.
import { b } from './style.js';
import { soHieuLa } from './can-cu.js';

const HE_THONG = `Bạn là biên tập viên của bot tra cứu hải quan OZ trên Zalo.
Phần "KẾT QUẢ GỐC" dưới là kết quả thật từ công cụ tra cứu (mã HS, lý do, thuế, thủ tục).
Viết lại thành bản chốt cho khách, 4–7 dòng:
- Dòng 1: "✅ Mã: <mã HS> — <lý do ngọn nhất theo dữ kiện khách mô tả>".
- Các dòng sau: thuế suất (MFN/ACFTA/VAT nếu có), thủ tục/giấy phép, đèn rủi ro nhãn hiệu (nếu có), MỘT cảnh báo quan trọng nhất nếu có.
Luật cứng:
1. CHỈ dùng số và dữ kiện có sẵn trong KẾT QUẢ GỐC — không thêm, không đổi, không tự tính lại con số nào.
2. Không lời chào, không hỏi lại, không rao gói khác, không markdown, không gạch đầu dòng bằng ký tự lạ.
3. Tiếng Việt tự nhiên, ngắn gọn, từng ý xuống dòng. Chỉ trả bản chốt, không giải thích gì thêm.`;

const TAM_THOI = new Set([429, 500, 502, 503, 504]);

/** Chuẩn hoá một số về dạng so sánh được.
 *  - Mã HS 8 số có dấu chấm ("8414.59.49") → "84145949" (dấu chấm là dấu ngăn nhóm, KHÔNG phải thập phân).
 *  - Số thập phân ("2.5", "2,5") → "2.5" (dấu phẩy là thập phân kiểu Việt Nam).
 *  - Phân số ("8/10") → giữ nguyên "8/10" (phải khớp CẢ tử và mẫu). */
function chuanSo(chuoi) {
  const s = String(chuoi).trim();
  const hs = /^(\d{4})[.\s](\d{2})[.\s](\d{2})$/.exec(s);
  if (hs) return `${hs[1]}${hs[2]}${hs[3]}`;
  if (/^\d+\s*\/\s*\d+$/.test(s)) return s.replace(/\s+/g, '');
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? String(n) : s;
}

/** Các "con số" trong một đoạn chữ, đã chuẩn hoá. */
function laySo(s) {
  const out = [];
  const re = /(\d{4}[.\s]?\d{2}[.\s]?\d{2}|\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?)/g;
  for (const m of String(s ?? '').match(re) ?? []) {
    const c = chuanSo(m);
    if (c) out.push(c);
  }
  return out;
}

/** Mọi dãy số trong bản chốt phải có mặt trong bản gốc, so theo GIÁ TRỊ chứ không theo chuỗi chữ:
 *  "2.5" ≠ "25" (lệch 10 lần) và "8/10" ≠ "8" (nửa thuế suất) — so chuỗi rời rạc sẽ cho qua hai lỗi này. */
export function soDungChuan(chot, goc) {
  const co = new Set(laySo(goc));
  return laySo(chot).every((x) => co.has(x));
}

/** Làm đậm mã HS 8 số trong bản chốt (Gemini trả chữ thường, không thẻ). */
const lamDam = (s) => String(s).replace(/(?<!\d)(\d{4}\.\d{2}\.\d{2}|\d{8})(?!\d)/g, (m) => b(m));

/**
 * → { chot: async ({ text, loai }) => string | null }. null = giữ bản đầy đủ (nơi gọi tự xử).
 * Bản gốc dưới 80 ký tự là đã ngắn, không tốn lượt Gemini.
 */
export function createEditor({ apiKey, model = 'gemini-flash-latest', models, fetchImpl = fetch, timeoutMs = 15_000,
  toiDa = 1200, toiThieuGoc = 80, off = false, duPhong = null, uuTien = 'gemini', log = console } = {}) {
  if ((!apiKey && !duPhong) || off) return null;
  // uuTien 'llm2' (LLM_CHINH=llm2): biên tập bằng llm2 trước, Gemini chỉ cứu khi llm2 lỗi.
  const llm2Truoc = uuTien === 'llm2' && !!duPhong;
  // Có khoá dự phòng (llm2.js) thì chỉ thử 1 mẫu Gemini rồi chuyển.
  const dsMau = !apiKey ? [] : (models && models.length ? models : [model, 'gemini-flash-lite-latest'])
    .map((m) => String(m).trim()).filter((m, i, a) => m && a.indexOf(m) === i)
    .slice(0, duPhong ? 1 : undefined);

  /** Bản chốt thô (Gemini hay dự phòng) → lược thẻ, kiểm độ dài, kiểm TỪNG số khớp gốc, làm đậm mã. */
  function xuLy(t, goc) {
    t = String(t ?? '').trim().replace(/\{\/?[a-z0-9]{1,10}\}/gi, '');   // mô hình có thả thẻ định dạng → lược
    if (!t || t.length > toiDa) return null;
    if (!soDungChuan(t, goc)) { log.info?.('[bienTap] bỏ bản chốt: có số không khớp bản gốc'); return null; }
    // Số hiệu văn bản cũng phải có trong bản gốc (issue #168, chống bịa căn cứ pháp lý). `soDungChuan`
    // không bắt được: "38/2015/TT-BTC" tách ra 38 và 2015 — hai số có thể tình cờ có trong bản gốc.
    if (soHieuLa(t, goc).length) { log.info?.('[bienTap] bỏ bản chốt: có số hiệu văn bản không có trong bản gốc'); return null; }
    return lamDam(t);
  }

  async function chot({ text, loai = 'kết quả tra cứu' } = {}) {
    const goc = String(text ?? '').trim();
    if (goc.length < toiThieuGoc) return null;
    const noiDung = `Loại: ${loai}\nKẾT QUẢ GỐC:\n${goc.slice(0, 6000)}`;
    const body = {
      systemInstruction: { parts: [{ text: HE_THONG }] },
      contents: [{ role: 'user', parts: [{ text: noiDung }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
    };
    /** Hỏi llm2: undefined = lỗi (cho bên kia cứu); còn lại là bản chốt đã kiểm số (có thể null). */
    async function quaLlm2() {
      const r = await duPhong.chat({ system: HE_THONG, user: noiDung, temperature: 0.1, maxTokens: 400 });
      if (!r) return undefined;
      return r.text ? xuLy(r.text, goc) : null;
    }
    if (llm2Truoc) {
      const kq = await quaLlm2();
      if (kq !== undefined) return kq;
    }
    for (const m of dsMau) {
      try {
        const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          log.error?.(`[bienTap] Gemini lỗi ${res.status} (${m})`);
          if (TAM_THOI.has(res.status)) continue;   // quá tải → thử mẫu kế
          break;                                    // lỗi khoá/đầu vào → bỏ Gemini (sang dự phòng hoặc giữ bản đầy đủ)
        }
        return xuLy((j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''), goc);
      } catch (e) {
        log.error?.(`[bienTap] ${e.name === 'TimeoutError' ? `quá ${Math.round(timeoutMs / 1000)} giây` : e.message}`);
      }
    }
    // Gemini không trả lời được → khoá dự phòng, cùng luật kiểm số.
    if (!duPhong || llm2Truoc) return null;
    return (await quaLlm2()) ?? null;
  }

  return { chot };
}
