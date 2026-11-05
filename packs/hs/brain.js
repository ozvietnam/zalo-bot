// packs/hs/brain.js — não hiểu câu hỏi (Gemini function calling) cho chế độ TỰ ĐỘNG.
// Việc duy nhất: biến câu tự do của khách thành {gói con + dữ kiện có nhãn}, câu hỏi lại, hoặc câu xã giao;
// KHÔNG gọi Cổng OZ, KHÔNG soạn câu trả lời nghiệp vụ (Hiến chương I: AI định tuyến, code quyết).
// An toàn: kết quả phải qua chuanHoa (gói khả dụng, dữ kiện đúng khuôn, doChac ≥ 0.5) mới dùng;
// Gemini lỗi/quá tải → trả null để nơi gọi rơi về autoPick của router.js — bot vẫn trả lời như trước.
import { route } from './router.js';
import { countryCode } from './input.js';

const HE_THONG = `Bạn là bộ định tuyến của bot Zalo tra cứu hải quan OZ. Khách viết tiếng Việt tự nhiên, có thể thiếu dấu, nói vòng, trộn tiếng Anh/Trung.
Việc của bạn: đọc câu của khách và gọi ĐÚNG MỘT hàm — chọn gói tra cứu và chép dữ kiện khách đã cho, hoặc hỏi lại, hoặc trả lời xã giao.
Luật:
1. KHÔNG bịa dữ kiện. Chỉ điền những gì khách viết hoặc phần "Ngữ cảnh" nêu; mã HS chỉ khi khách/ngữ cảnh đã có số đó.
2. Thiếu dữ kiện bắt buộc của gói, hoặc chưa rõ khách muốn gì → gọi hoi_lai với MỘT câu hỏi ngắn.
3. Chào hỏi, cảm ơn, hỏi dịch vụ/giá/cước ngoài phạm vi tra cứu → gọi khac, câu ngắn thân thiện, dẫn về "menu".
4. Giữ nguyên cách khách gọi tên hàng; "nó", "cái đó", "mã vừa rồi" thường chỉ dữ kiện trong Ngữ cảnh.
5. Trả lời bằng function call, không viết chữ thường.
6. tenHang phải chép NGUYÊN VĂN mô tả hàng của khách (tối đa ~300 ký tự, chỉ bỏ lời xã giao) — tuyệt đối không tóm lại thành vài chữ, vì đây là dữ kiện cho việc phân loại.`;

const TAM_THOI = new Set([429, 500, 502, 503, 504]);

// tiện ích khuôn dữ kiện
const str = (v, n) => (typeof v === 'string' && v.trim().length >= n ? v.trim() : null);
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const maHsOk = (v, min = 4) => { const d = digits(v); return d.length >= min && d.length <= 8 ? d : null; };
const labeled = (pairs) => {
  const l = pairs.filter(([, v]) => v != null && String(v).trim() !== '').map(([k, v]) => `${k}: ${String(v).trim()}`);
  return l.length ? l.join('\n') : null;
};
const xx = (v) => { const c = countryCode(String(v ?? '')); return c || null; };

/** Mỗi gói con một hàm Gemini: tên hàm = id gói (gạch chân), kèm cách dựng lại văn bản có nhãn mà gói đọc được. */
const GOI = [
  { ham: 'phan_loai', so: 1, moTa: 'Phân loại mã HS từ mô tả hàng (tên, chất liệu, công dụng, thông số)',
    fields: { tenHang: 'Tên hàng + mô tả đầy đủ như khách viết: giữ thông số, model, chất liệu, công dụng — KHÔNG rút gọn thành vài chữ', chatLieu: 'Chất liệu', congDung: 'Công dụng', thongSo: 'Thông số dạng "tên: giá trị, ..." (một chuỗi)', thuongHieu: 'Thương hiệu', model: 'Model/ký hiệu' },
    dung: (a) => (str(a.tenHang, 2) ? labeled([['Tên hàng', a.tenHang], ['Chất liệu', a.chatLieu], ['Công dụng', a.congDung], ['Thông số', a.thongSo], ['Thương hiệu', a.thuongHieu], ['Model', a.model]]) : null) },
  { ham: 'thue_thu_tuc', so: 2, moTa: 'Thuế & thủ tục nhập khẩu theo mã HS (cần mã khách đã có)',
    fields: { maHs: 'Mã HS 4–8 số khách đã nêu', xuatXu: 'Nước xuất xứ khách nêu (tên hoặc mã 2 chữ)' },
    dung: (a) => { const m = maHsOk(a.maHs); const c = xx(a.xuatXu); return m ? m + (c ? ` ${c}` : '') : null; } },
  { ham: 'viet_mo_ta', so: 3, moTa: 'Viết mô tả hàng hoá khai báo (cần mã HS + tên hàng)',
    fields: { maHs: 'Mã HS 4–8 số', tenHang: 'Tên hàng', thuongHieu: 'Thương hiệu', model: 'Model', xuatXu: 'Nước xuất xứ', thongSo: 'Thông số dạng "tên: giá trị, ..."', tinhTrang: 'Tình trạng (mới/cũ...)' },
    dung: (a) => (maHsOk(a.maHs) && str(a.tenHang, 2) ? labeled([['Mã HS', maHsOk(a.maHs)], ['Tên hàng', a.tenHang], ['Thương hiệu', a.thuongHieu], ['Model', a.model], ['Xuất xứ', a.xuatXu], ['Thông số', a.thongSo], ['Tình trạng', a.tinhTrang]]) : null) },
  { ham: 'kiem_tra', so: 4, moTa: 'Soát/kiểm tra mô tả hoặc tờ khai (cần mã HS + mô tả như sẽ khai)',
    fields: { maHs: 'Mã HS 4–8 số', moTa: 'Mô tả hàng như sẽ khai', xuatXu: 'Nước xuất xứ', kiemSau: 'TRUE nếu khách muốn AI so mô tả với mã (kiểm sâu)' },
    dung: (a) => (maHsOk(a.maHs) && str(a.moTa, 3) ? labeled([['Mã HS', maHsOk(a.maHs)], ['Mô tả', a.moTa], ['Xuất xứ', a.xuatXu], ...(a.kiemSau === true || a.kiemSau === 'true' ? [['Kiểm sâu', 'có']] : [])]) : null) },
  { ham: 'phap_luat', so: 5, moTa: 'Hiệu lực văn bản, chú giải mã HS, tiền lệ phân loại',
    fields: { soHieu: 'Số hiệu văn bản, nhiều cái cách nhau bằng dấu phẩy', maHs: 'Mã HS 4–8 số', moTa: 'Mô tả hàng để tìm tiền lệ' },
    dung: (a) => { const parts = [str(a.soHieu, 3), maHsOk(a.maHs), str(a.moTa, 3)].filter(Boolean); return parts.length ? parts.join(' ') : null; } },
  { ham: 'kiem_shtt', so: 6, moTa: 'Kiểm tra nhãn hiệu/sở hữu trí tuệ (cần tên nhãn hiệu)',
    fields: { tenNhan: 'Tên nhãn hiệu', maHs: 'Mã HS 4–8 số nếu có', xuatXu: 'Nước xuất xứ' },
    dung: (a) => (str(a.tenNhan, 2) ? labeled([['Nhãn hiệu', a.tenNhan], ['Mã HS', maHsOk(a.maHs)], ['Xuất xứ', a.xuatXu]]) : null) },
  { ham: 'giai_trinh', so: 7, moTa: 'Soạn hồ sơ giải trình khi Hải quan áp mã khác (cần mã đã khai + mô tả hàng)',
    fields: { maKhai: 'Mã HS khách đã khai', maHaiQuan: 'Mã HS Hải quan áp', moTaHang: 'Mô tả hàng', lyDoHaiQuan: 'Lý do Hải quan nêu', taiLieu: 'Tài liệu khách có, cách nhau bằng dấu phẩy' },
    dung: (a) => (maHsOk(a.maKhai) && str(a.moTaHang, 3) ? labeled([['Mã khai', maHsOk(a.maKhai)], ['Mã hải quan áp', maHsOk(a.maHaiQuan)], ['Mô tả hàng', a.moTaHang], ['Lý do hải quan', a.lyDoHaiQuan], ['Tài liệu có', a.taiLieu]]) : null) },
];

/** FunctionDeclarations cho Gemini: chỉ gói khả dụng theo công cụ Cổng, cộng hoi_lai/khac. */
function declarations(pkgs) {
  const ds = GOI.filter((g) => pkgs.some((p) => p.so === g.so)).map((g) => ({
    name: g.ham,
    description: `${g.moTa}. Chỉ điền dữ kiện khách đã nêu (hoặc Ngữ cảnh); thiếu dữ kiện thì gọi hoi_lai.`,
    parameters: {
      type: 'OBJECT',
      properties: { ...Object.fromEntries(Object.entries(g.fields).map(([k, d]) => [k, { type: 'STRING', description: d }])),
        ...(g.ham === 'kiem_tra' ? { kiemSau: { type: 'BOOLEAN', description: 'TRUE nếu khách yêu cầu kiểm sâu (so AI mô tả với mã)' } } : {}),
        doChac: { type: 'NUMBER', description: 'Độ tin cậy 0.0–1.0 rằng đây là đúng ý định và đúng dữ kiện của khách' } },
      required: ['doChac'],
    },
  }));
  ds.push({ name: 'hoi_lai', description: 'Chưa rõ ý khách hoặc thiếu dữ kiện bắt buộc → hỏi lại MỘT câu ngắn, tiếng Việt.',
    parameters: { type: 'OBJECT', properties: { cauHoi: { type: 'STRING', description: 'Câu hỏi lại, ≤ 1 câu, tiết kiệm chữ' } }, required: ['cauHoi'] } });
  ds.push({ name: 'khac', description: 'Chào hỏi, cảm ơn, câu ngoài phạm vi tra cứu → trả lời ngắn, dẫn về "menu".',
    parameters: { type: 'OBJECT', properties: { cauDan: { type: 'STRING', description: 'Câu trả lời ngắn, thân thiện, tiếng Việt' } }, required: ['cauDan'] } });
  return ds;
}

/** Kết quả function call → dạng router dùng được; sai khuôn/không chắc → null (rơi về regex). */
function chuanHoa(name, a, pkgs, doChacToiThieu) {
  a = (a && typeof a === 'object') ? a : {};
  if (name === 'hoi_lai') return str(a.cauHoi, 2) ? { kind: 'hoi-lai', cauHoi: a.cauHoi.trim().slice(0, 300) } : null;
  if (name === 'khac') return str(a.cauDan, 2) ? { kind: 'khac', cauDan: a.cauDan.trim().slice(0, 500) } : null;
  const g = GOI.find((x) => x.ham === name);
  const dc = Number(a.doChac);
  if (!g || !(dc >= doChacToiThieu) || dc > 1 || !pkgs.some((p) => p.so === g.so)) return null;
  const text = g.dung(a);
  return text ? { kind: 'chay', goi: g.so, text } : null;
}

/**
 * Não hiểu câu hỏi. → { kind: 'chay', goi, text } | { kind: 'hoi-lai', cauHoi } | { kind: 'khac', cauDan } | null.
 * Không bao giờ ném lỗi: mọi lỗi Gemini/mạng đều → null để nơi gọi rơi về autoPick.
 */
export function createBrain({ apiKey, model = 'gemini-flash-lite-latest', models, fetchImpl = fetch, timeoutMs = 15_000,
  doChacToiThieu = 0.5, off = false, log = console } = {}) {
  if (!apiKey || off) return null;
  const dsMau = (models && models.length ? models : [model, 'gemini-flash-latest'])
    .map((m) => String(m).trim()).filter((m, i, a) => m && a.indexOf(m) === i);

  async function hieu({ text, last = null, pkgs = [] }) {
    const cau = String(text ?? '').slice(0, 1000).trim();
    if (!cau) return null;
    const canh = last && (last.tenHang || last.maHs)
      ? `Ngữ cảnh: khách vừa tra ${[last.tenHang ? `tên hàng "${String(last.tenHang).slice(0, 120)}"` : null, last.maHs ? `mã HS ${last.maHs}` : null].filter(Boolean).join(', ')}. "Nó/cái đó" có thể chỉ dữ kiện này.\n`
      : '';
    const body = {
      systemInstruction: { parts: [{ text: HE_THONG }] },
      contents: [{ role: 'user', parts: [{ text: `${canh}Câu của khách: "${cau}"` }] }],
      tools: [{ functionDeclarations: declarations(pkgs) }],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      generationConfig: { temperature: 0 },
    };
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
          log.error?.(`[nao] Gemini lỗi ${res.status} (${m})`);
          if (TAM_THOI.has(res.status)) continue;   // quá tải → thử mẫu kế
          return null;                              // lỗi khoá/đầu vào → dừng, rơi về regex
        }
        const call = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.functionCall).find(Boolean);
        if (!call?.name) return null;
        const kq = chuanHoa(call.name, call.args, pkgs, doChacToiThieu);
        log.info?.(`[nao] ${kq ? (kq.kind === 'chay' ? `gói ${kq.goi}` : kq.kind) : `bỏ ${call.name} (sai khuôn hoặc không chắc)`}`);
        return kq;
      } catch (e) {
        log.error?.(`[nao] ${e.name === 'TimeoutError' ? 'quá 15 giây' : e.message}`);
        // timeout/mạng → thử mẫu kế rồi bỏ
      }
    }
    return null;
  }

  return { hieu };
}

/**
 * Định tuyến có não: route() của router.js lo fast-path (menu, chọn gói, hỏi kết quả, gói đang mở);
 * chỉ kết quả "chay" ở chế độ TỰ ĐỘNG mới hỏi não. Não null → giữ nguyên kết quả regex.
 * typing: gọi một lần trước khi hỏi não (bot hiện "đang nhập" trong lúc chờ).
 */
export async function routeThongMinh(text, { session = {}, pkgs = [], brain = null, typing = null } = {}) {
  const r = route(text, { session, pkgs });
  if (!brain || r.kind !== 'chay' || !r.tuDong) return r;
  typing?.();
  const b = await brain.hieu({ text, last: session.last || null, pkgs });
  if (!b) return r;
  if (b.kind === 'hoi-lai') return { kind: 'hoi-lai', cauHoi: b.cauHoi };
  if (b.kind === 'khac') return { kind: 'khac', cauDan: b.cauDan };
  const pkg = pkgs.find((p) => p.so === b.goi);
  return pkg ? { kind: 'chay', pkg, text: b.text, tuDong: true } : r;
}
