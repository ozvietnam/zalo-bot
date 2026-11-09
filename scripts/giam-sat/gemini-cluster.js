// scripts/giam-sat/gemini-cluster.js
// Gom nhóm nhu cầu tuần qua Gemini AI Studio và kiểm tra đối chiếu turn_id thật (T708 — US3, FR-006, SC-006)
// Bắt buộc ẩn danh dữ liệu trước khi gửi (FR-004), không ném ngoại lệ khi AI lỗi (Hiến pháp VII, IX).
import { anDanhVanBan } from './an-danh.js';

export const REPOS_HOP_LE = new Set(['zalo-bot', 'ozplugin', 'hs-code-api']);
const DEFAULT_MODEL = 'gemini-1.5-flash';
const DEFAULT_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích chất lượng bot hỗ trợ khách hàng của OZ Việt Nam.
Nhiệm vụ: Đọc danh sách hội thoại tuần qua mà bot chưa giải quyết trọn vẹn, cần nhân viên hỗ trợ.
Gom các đoạn hội thoại này thành các nhóm nhu cầu thực tế của khách hàng.
Với mỗi nhóm, đề xuất công cụ mới hoặc cải tiến cho repo phù hợp:
- "zalo-bot": luồng bot, định tuyến, giao diện, kịch bản hội thoại, câu hỏi làm rõ.
- "ozplugin": công cụ nghiệp vụ Cổng OZ (cước vận chuyển, biểu thuế, chính sách, thủ tục).
- "hs-code-api": dữ liệu mã HS, biểu thuế xuất nhập khẩu, mô tả hàng hóa.

BẮT BUỘC trả về JSON theo schema:
[
  {
    "tenNhom": "Tên nhóm ngắn gọn",
    "soPhong": 5,
    "turnIds": ["turn_id_1", "turn_id_2"],
    "deXuatCongCu": "Mô tả công cụ hoặc giải pháp đề xuất",
    "repo": "zalo-bot" | "ozplugin" | "hs-code-api"
  }
]
LƯU Ý: Chỉ trích dẫn các turn_id có thật trong dữ liệu cung cấp. Tuyệt đối không bịa turn_id.`;

/**
 * Xác thực danh sách turn_id trong một nhóm:
 * Chỉ cần MỘT turn_id không có trong dbTurns là loại bỏ cả nhóm (Hiến pháp IV: Bằng chứng thắng lời khai).
 * @param {{ turnIds?: string[] }} nhom
 * @param {Set<string>} dbTurns
 * @returns {boolean}
 */
export function xacThucTurnIds(nhom, dbTurns) {
  if (!nhom || typeof nhom !== 'object') return false;
  if (!Array.isArray(nhom.turnIds) || nhom.turnIds.length === 0) return false;
  if (!dbTurns || !(dbTurns instanceof Set) || dbTurns.size === 0) return false;

  for (const tid of nhom.turnIds) {
    if (!tid || !dbTurns.has(tid)) return false;
  }
  return true;
}

/**
 * Ẩn danh đệ quy các trường văn bản trong dữ liệu trước khi gửi đi
 * @param {*} val
 * @param {Map<string, string>} mapKhach
 * @returns {*}
 */
function anDanhGiaTri(val, mapKhach) {
  if (typeof val === 'string') return anDanhVanBan(val, mapKhach);
  if (Array.isArray(val)) return val.map((v) => anDanhGiaTri(v, mapKhach));
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === 'turn_id' || k === 'turnId' || k === 'id') {
        out[k] = v;
      } else {
        out[k] = anDanhGiaTri(v, mapKhach);
      }
    }
    return out;
  }
  return val;
}

/**
 * Trích xuất mảng JSON từ phản hồi của Gemini
 * @param {*} data
 * @returns {Array<any>}
 */
function extractJsonFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.nhom)) return data.nhom;

  let text = '';
  if (data?.candidates?.[0]?.content?.parts) {
    text = data.candidates[0].content.parts.map((p) => p.text || '').join('');
  } else if (typeof data === 'string') {
    text = data;
  }

  if (!text) throw new Error('Dữ liệu phản hồi rỗng');

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const k of ['nhom', 'groups', 'danhSach', 'clusters']) {
      if (Array.isArray(parsed[k])) return parsed[k];
    }
  }
  return parsed;
}

/**
 * Gom nhóm nhu cầu tuần qua Gemini AI Studio
 * Gọi đúng 1 lần cho cả lô, yêu cầu JSON theo schema cố định, ẩn danh trước khi gửi và lọc qua xacThucTurnIds.
 * Thứ tự ưu tiên URL: tham số url > env GEMINI_API_URL > mặc định công khai.
 * Lỗi trả mã chung đã che (kebab-case), không trả nguyên message.
 *
 * @param {object} params
 * @param {Array<object|string>} params.hoiThoaiTuan - Danh sách hội thoại trong tuần cần gom nhóm
 * @param {Set<string>|Array<string>} [params.dbTurns] - Tập hợp turn_id hợp lệ từ database
 * @param {string} [params.apiKey] - Gemini API Key (mặc định lấy từ process.env.GEMINI_API_KEY)
 * @param {string} [params.model] - Tên mô hình (mặc định process.env.GEMINI_MODEL hoặc gemini-1.5-flash)
 * @param {Function} [params.fetcher] - Hàm fetch triển khai (mặc định globalThis.fetch)
 * @param {string} [params.url] - URL endpoint tuỳ biến
 * @param {number} [params.timeoutMs] - Thời gian chờ tối đa (ms)
 * @returns {Promise<{ nhom: Array<{ tenNhom: string, soPhong: number, turnIds: string[], deXuatCongCu: string, repo: string }>, loi: string|null }>}
 */
export async function gomNhomNhuCau({
  hoiThoaiTuan = [],
  dbTurns = new Set(),
  apiKey,
  model,
  fetcher = globalThis.fetch,
  url,
  timeoutMs = 60 * 1000,
} = {}) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    return { nhom: [], loi: 'gemini-thieu-api-key' };
  }

  const turnsSet = dbTurns instanceof Set ? dbTurns : new Set(dbTurns || []);
  const m = model || process.env.GEMINI_MODEL || DEFAULT_MODEL;

  // Thứ tự ưu tiên URL: tham số url > env GEMINI_API_URL > mặc định công khai
  const defaultUrl = `${DEFAULT_API_URL}/${encodeURIComponent(m)}:generateContent`;
  const endpoint = url || process.env.GEMINI_API_URL || defaultUrl;

  // 1. Bắt buộc ẩn danh toàn bộ dữ liệu trước khi gửi lên Gemini (FR-004)
  const mapKhach = new Map();
  const duLieuAnDanh = anDanhGiaTri(hoiThoaiTuan, mapKhach);

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: `DỮ LIỆU HỘI THOẠI TRONG TUẦN:\n${JSON.stringify(duLieuAnDanh, null, 2)}` }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  let res;
  let data;

  // 2. Gọi Gemini đúng 1 lần cho cả lô (SC-006)
  try {
    res = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    data = await res.json().catch(() => null);
  } catch {
    return { nhom: [], loi: 'gemini-loi-mang' };
  }

  if (!res || !res.ok) {
    return { nhom: [], loi: 'gemini-loi-http' };
  }

  // 3. Phân tích cú pháp JSON phản hồi
  let parsedList;
  try {
    parsedList = extractJsonFromResponse(data);
  } catch {
    return { nhom: [], loi: 'gemini-json-hong' };
  }

  if (!Array.isArray(parsedList)) {
    return { nhom: [], loi: 'gemini-sai-khuon' };
  }

  // 4. Thẩm định schema và lọc turn_id thật
  const nhomHopLe = [];
  for (const item of parsedList) {
    if (!item || typeof item !== 'object') continue;
    if (!item.tenNhom || typeof item.tenNhom !== 'string') continue;
    if (!REPOS_HOP_LE.has(item.repo)) continue;
    if (!Array.isArray(item.turnIds) || item.turnIds.length === 0) continue;

    // Loại bỏ nhóm nếu có bất kỳ turn_id nào không có trong database (Hiến pháp IV)
    if (!xacThucTurnIds(item, turnsSet)) continue;

    nhomHopLe.push({
      tenNhom: String(item.tenNhom).trim(),
      soPhong: Number(item.soPhong) || item.turnIds.length,
      turnIds: item.turnIds.map(String),
      deXuatCongCu: String(item.deXuatCongCu || '').trim(),
      repo: item.repo,
    });
  }

  return { nhom: nhomHopLe, loi: null };
}
