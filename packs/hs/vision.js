// packs/hs/vision.js — đọc thông số hàng hoá từ ẢNH bằng Gemini (Google AI Studio), CHỈ để chép ra chữ.
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

export function createVision({ apiKey, model = 'gemini-flash-latest', fetchImpl = fetch, maxBytes = 8_000_000 } = {}) {
  if (!apiKey) return null;

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
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Gemini lỗi ${res.status}: ${j?.error?.message?.slice(0, 120) || ''}`);
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    try { return JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')); } catch { throw new Error('Gemini trả kết quả không đọc được'); }
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
