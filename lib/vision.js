// lib/vision.js — đọc thông số hàng hoá từ ẢNH bằng Gemini (Google AI Studio), CHỈ để chép ra chữ.
// Cổng OZ nhận mô tả bằng chữ; nguyên tắc: thông số lấy từ ảnh phải được người dùng XÁC NHẬN trước khi tra.
// Bot không tự phân loại từ ảnh; người dùng gõ "ok" (hoặc sửa rồi gửi lại) thì mới gọi phan_loai_hs.

const PROMPT = `Bạn là trợ lý chép thông số hàng hoá nhập khẩu từ ảnh (tem nhãn, bao bì, catalogue, ảnh sản phẩm).
CHỈ ghi những gì ĐỌC ĐƯỢC hoặc NHÌN THẤY RÕ trong ảnh; không đoán mã HS, không bịa thông số.
Trả JSON đúng khuôn:
{"tenHang": "tên hàng tiếng Việt ngắn gọn (dịch nếu chữ trong ảnh là tiếng Trung/Anh)",
 "thuongHieu": "nhãn hiệu in trên hàng hoặc null",
 "model": "model/ký hiệu hoặc null",
 "chatLieu": "chất liệu nếu ghi rõ hoặc nhìn rõ, ngược lại null",
 "congDung": "công dụng nếu ghi trên nhãn, ngược lại null",
 "thongSo": {"tên thông số": "giá trị kèm đơn vị"},
 "chuTrongAnh": "các dòng chữ quan trọng đọc được, giữ nguyên văn, tối đa 300 ký tự",
 "khongChac": ["điểm nào đọc không chắc"]}`;

/** Lỗi tạm của Gemini (quá tải / giới hạn lượt) → nên thử lại hoặc đổi mẫu. */
const TAM_THOI = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Câu báo cho khách khi đọc ảnh lỗi — KHÔNG lộ lỗi gốc (tiếng Anh của Gemini, stack, địa chỉ nội bộ).
 * Lỗi tạm (503 "high demand") → nói rõ quá tải, mời gửi lại sau.
 */
export function loiAnhChoKhach(e) {
  const raw = String(e?.message || '');
  const tamThoi = e?.tamThoi || TAM_THOI.has(e?.status) || /\b(429|500|502|503|504)\b/.test(raw);
  if (tamThoi) {
    return 'Dịch vụ đọc ảnh đang quá tải, bạn gửi lại ảnh sau ít phút';
  }
  return 'Bot chưa đọc được ảnh này';
}

export function createVision({ apiKey, model = 'gemini-flash-latest', models, fetchImpl = fetch, maxBytes = 8_000_000, retryDelaysMs = [2000, 5000] } = {}) {
  if (!apiKey) return null;
  // Danh sách mẫu thử lần lượt: mẫu chính trước, mẫu nhẹ dự phòng sau.
  const dsMau = (models && models.length ? models : [model, 'gemini-flash-lite-latest'])
    .map((m) => String(m).trim()).filter((m, i, a) => m && a.indexOf(m) === i);

  async function download(url) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`không tải được ảnh (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error('ảnh quá lớn');
    const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return { data: buf.toString('base64'), mime: /^image\//.test(type) ? type : 'image/jpeg' };
  }

  /** → { tenHang, thuongHieu, model, chatLieu, congDung, thongSo, chuTrongAnh, khongChac } */
  async function readSpecs(imageUrl, caption = '') {
    const img = await download(imageUrl);
    const body = {
      contents: [{ parts: [
        { text: PROMPT + (caption ? `\nNgười gửi ghi chú kèm ảnh: "${String(caption).slice(0, 300)}"` : '') },
        { inline_data: { mime_type: img.mime, data: img.data } },
      ] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    };
    let loiCuoi = null;
    for (const m of dsMau) {
      for (let lan = 0; lan <= retryDelaysMs.length; lan++) {
        let res; let j = null;
        try {
          res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60000),
          });
          j = await res.json().catch(() => null);
        } catch (e) {
          loiCuoi = Object.assign(new Error(`Gemini không phản hồi (${e.name === 'TimeoutError' ? 'quá thời gian' : e.message})`), { tamThoi: true });
          if (lan < retryDelaysMs.length) { await sleep(retryDelaysMs[lan]); continue; }
          break;
        }
        if (res.ok) {
          const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
          try { return JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')); } catch { throw new Error('Gemini trả kết quả không đọc được'); }
        }
        loiCuoi = Object.assign(new Error(`Gemini lỗi ${res.status} (${m}): ${j?.error?.message?.slice(0, 120) || ''}`), { status: res.status, tamThoi: TAM_THOI.has(res.status) });
        if (res.status === 404) break;                      // mẫu không tồn tại → sang mẫu kế
        if (!loiCuoi.tamThoi) throw loiCuoi;                // lỗi khoá/đầu vào → dừng hẳn
        if (lan < retryDelaysMs.length) await sleep(retryDelaysMs[lan]);
      }
    }
    throw loiCuoi || new Error('Gemini lỗi không rõ');
  }

  return { readSpecs };
}

/** Thông số đọc từ ảnh → mẫu chữ cho gói 1 (người dùng sửa được rồi gửi lại). */
export function specsToText(s) {
  const l = [];
  if (s?.tenHang) l.push(`Tên hàng: ${s.tenHang}`);
  if (s?.thuongHieu) l.push(`Thương hiệu: ${s.thuongHieu}`);
  if (s?.model) l.push(`Model: ${s.model}`);
  if (s?.chatLieu) l.push(`Chất liệu: ${s.chatLieu}`);
  if (s?.congDung) l.push(`Công dụng: ${s.congDung}`);
  const ts = s?.thongSo && typeof s.thongSo === 'object' ? Object.entries(s.thongSo).filter(([, v]) => v) : [];
  if (ts.length) l.push(`Thông số: ${ts.map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  return l.join('\n');
}
