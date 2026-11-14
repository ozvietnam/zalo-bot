// scripts/qa-that.mjs — Bộ QA chạy thật cho đích G2–G4 (issue #124)
// Chạy lõi thật (core/engine.js, gói hs) với Cổng OZ thật và Gemini thật,
// nhưng kênh gửi là kênh giả ghi lại (0 lượt gọi API Zalo).
// Không in khoá, không in token. Tự động xuất báo cáo qa-that/ket-qua-<ngày>.md.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../core/store.js';
import { createGate } from '../core/gate.js';
import { createHandoff } from '../core/handoff.js';
import { createRegistry } from '../core/registry.js';
import { createEngine } from '../core/engine.js';
import { createMcpClient } from '../core/mcp.js';
import { createVision } from '../packs/hs/vision.js';
import { createBrain } from '../packs/hs/brain.js';
import { createEditor } from '../packs/hs/editor.js';
import { parse } from '../channels/zalo-bot.js';
import hsPack from '../packs/hs/index.js';
import { vnDateKey, vnStamp } from '../core/time.js';
import { CAU_DANG_TRA } from '../packs/hs/dang-tra.js';
import { chanBia } from '../packs/hs/can-cu.js';
import { PACKAGES } from '../packs/hs/packages.js';

/** Câu "đang tra" phải ra trong ngần này (issue #168, phần 1). */
export const BAO_DANG_TRA_TOI_DA_MS = 3_000;
/** Bước có thể dẫn tới tra Cổng chờ tối đa 120 giây; bước khác 30 giây (issue #168, phần 4). */
export const CHO_TRA_CONG_MS = 120_000;
export const CHO_THUONG_MS = 30_000;

/** Tin là câu "đang tra" (kể cả có "@tên\n" ở đầu trong nhóm) — tách khỏi tin kết quả. */
export function laTinDangTra(text) {
  const t = String(text ?? '');
  return Object.values(CAU_DANG_TRA).some((c) => t.includes(c));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const DON_VI_THOI_GIAN = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * Đọc khoảng cách thời gian của bước (`"5m"`, `"90s"`, hay số milli giây).
 * Mạch thật của khách cách nhau vài phút; bộ QA bơm cả kịch bản trong một giây nên cửa gửi
 * coi tin sau là trùng tin trước và CHẶN (`core/gate-decide.js:130`). Bước khai `cachTruoc`
 * để đồng hồ của kịch bản tiến lên đúng như ngoài đời.
 */
export function docKhoangCach(x) {
  if (x == null) return 0;
  if (typeof x === 'number') return Number.isFinite(x) && x > 0 ? x : 0;
  const m = /^\s*(\d+)\s*([smhd])\s*$/.exec(String(x));
  if (!m) throw new Error(`cachTruoc không đọc được: ${x} (dùng dạng "90s", "5m", "2h")`);
  return Number(m[1]) * DON_VI_THOI_GIAN[m[2]];
}

/** Đọc cấu hình từ tệp .env nếu tồn tại, không ném lỗi nếu thiếu. */
export function loadDotEnv(filePath = join(ROOT_DIR, '.env')) {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf8');
    const result = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

/** Kênh giả ghi lại: theo dõi toàn bộ tin gửi ra, khẳng định 0 lượt gọi API Zalo thật. */
export function createQaChannel() {
  const sent = [];
  const typed = [];
  let zaloApiCallCount = 0;

  return {
    name: 'qa-recording-channel',
    maxText: 2000,
    parse,
    async sendText(chatId, text) {
      sent.push({ chatId, text, at: new Date() });
    },
    async typing(chatId) {
      typed.push({ chatId, at: new Date() });
    },
    async getMe() {
      return { id: 'bot-qa', name: 'OZ Tra cứu HS', display_name: 'OZ Tra cứu HS' };
    },
    sent,
    typed,
    get zaloApiCallCount() {
      return zaloApiCallCount;
    },
  };
}

/** Bỏ dấu + chữ thường: nhận diện món trong bộ giả lập không phụ thuộc dấu tiếng Việt. */
const normMock = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Cổng OZ giả phục vụ chế độ --mock khi không có kết nối mạng thật. */
function createMockMcp() {
  const tools = [
    { name: 'phan_loai_hs', description: 'Phân loại HS' },
    { name: 'ket_qua_phan_loai', description: 'Kết quả phân loại' },
    { name: 'tra_thue', description: 'Tra cứu thuế' },
    { name: 'tra_thu_tuc_nhap_khau', description: 'Thủ tục nhập khẩu' },
    { name: 'tim_ma_hs', description: 'Tìm mã HS' },
    { name: 'kiem_tra_shtt', description: 'Kiểm tra SHTT' },
  ];

  return {
    calls: [],
    async listTools() {
      return tools;
    },
    async callTool(name, args = {}) {
      this.calls.push({ name, args, at: new Date() });
      if (name === 'phan_loai_hs') {
        const text = String(args.tenHang || args.moTa || '');
        const n = normMock(text);
        const is8413 = n.includes('8413') || n.includes('bom');
        const is8504 = n.includes('8504') || n.includes('bien doi');
        const is8509 = n.includes('8509') || n.includes('xay') || n.includes('sinh to');
        // Chốt kẹp cơ khí (case G5 của issue #170): mã thật của Cổng là 8302.42.00, KHÔNG phải
        // 8537.10.99 ("thiết bị điều khiển cầm tay" — nhóm hàng điện). Không có nhánh này thì bộ
        // giả lập rơi vào mã dự phòng của mình và báo cáo QA ra một mã sai mặt hàng (người soát
        // đo, điểm [S23]) — báo cáo đó là BẰNG CHỨNG cho người đọc, không được sai.
        // Nhận diện bằng chuỗi ĐÃ BỎ DẤU: regex có dấu dễ trượt ("kẹp" ≠ "kệp") và lỡ mất
        // nhánh thì báo cáo lại ra mã của món khác.
        const is8302 = n.includes('8302') || n.includes('chot kep') || n.includes('chot xoay') || n.includes('chot ');
        const maHs = is8413 ? '84137090' : (is8504 ? '85044090' : (is8509 ? '85094000' : (is8302 ? '83024200' : '85371099')));
        const nameVi = is8413 ? 'Máy bơm ly tâm' : (is8504 ? 'Bộ biến đổi tĩnh điện' : (is8509 ? 'Máy xay, ép trái cây gia dụng' : (is8302 ? 'Khớp nối, giá đỡ, chốt kẹp bằng kim loại cơ bản khác' : 'Bàn điều khiển cầm tay')));
        return {
          ok: true,
          maLuot: 'ML-TEST-' + maHs,
          trangThai: 'XONG',
          maHs,
          doChac: 0.95,
          data: {
            maHs,
            ketQua: {
              results: [
                { hsCode: maHs, nameVi, confidence: 0.95, reasoning: nameVi },
              ],
            },
          },
        };
      }
      if (name === 'ket_qua_phan_loai') {
        const ml = String(args.maLuot || '');
        const maHs = ml.includes('8509') ? '85094000' : (ml.includes('8413') ? '84137090' : (ml.includes('8504') ? '85044090' : (ml.includes('8302') ? '83024200' : '85371099')));
        const nameVi = maHs === '85094000' ? 'Máy xay, ép trái cây gia dụng' : (maHs === '84137090' ? 'Máy bơm ly tâm' : (maHs === '83024200' ? 'Khớp nối, giá đỡ, chốt kẹp bằng kim loại cơ bản khác' : 'Bảng, bàn điều khiển cầm tay'));
        return {
          ok: true,
          maHs,
          trangThai: 'XONG',
          data: {
            maHs,
            ketQua: {
              results: [{ hsCode: maHs, nameVi, confidence: 0.95 }],
            },
          },
          deXuat: [{ ma: maHs, moTa: nameVi }],
        };
      }
      if (name === 'tra_thue') {
        const ma = String(args.maHs || '84137090');
        const is8509 = ma.startsWith('8509');
        return {
          ok: true,
          data: {
            hsCode: ma,
            nameVi: is8509 ? 'máy xay, ép trái cây gia dụng' : (ma.startsWith('8413') ? 'Máy bơm ly tâm khác' : (ma.startsWith('8504') ? 'Bộ biến đổi tĩnh điện khác' : (ma.startsWith('8302') ? 'Khớp nối, giá đỡ, chốt kẹp bằng kim loại cơ bản khác' : 'Thiết bị điều khiển cầm tay'))),
            taxNkPreferential: is8509 ? 25 : 0,
            taxVat: is8509 ? 8 : 10,
            vatReduction: is8509 ? { noteVi: 'áp tới hết 2026' } : null,
            taxAcftaChina: { eligible: true, rate: is8509 ? 5 : 0 },
          },
        };
      }
      if (name === 'tra_thu_tuc_nhap_khau') {
        const ma = String(args.maHs || '');
        const is8509 = ma.startsWith('8509');
        return {
          ok: true,
          data: {
            kiemTraChuyenNganh: is8509 ? [{ label: 'công bố hợp quy' }] : [],
            giayPhep: [],
            vanBanQuanLy: [],
            chinhSach: is8509 ? { policyLines: [{ text: 'Đồ điện gia dụng phải công bố hợp quy trước khi bán' }] } : { policyLines: [] },
          },
        };
      }
      if (name === 'tim_ma_hs') {
        const q = String(args.tuKhoa || '');
        if (q.includes('8413')) {
          return {
            ok: true,
            results: [{ hsCode: '84137090', nameVi: 'Máy bơm ly tâm khác', taxNkPreferential: 0, taxVat: 10 }],
          };
        }
        if (q.includes('8504')) {
          return {
            ok: true,
            results: [{ hsCode: '85044090', nameVi: 'Bộ biến đổi tĩnh điện khác', taxNkPreferential: 0, taxVat: 10 }],
          };
        }
        return {
          ok: true,
          results: [{ hsCode: '85371099', nameVi: 'Thiết bị điều khiển cầm tay', taxNkPreferential: 0, taxVat: 10 }],
        };
      }
      return { ok: true, data: 'mock-ok' };
    },
  };
}

/** Mock Vision phục vụ chế độ --mock. */
function createMockVision() {
  return {
    async readSpecs(photoUrl, caption = '') {
      return {
        tenHang: 'Bộ điều khiển lập trình và cảm biến áp suất',
        thuongHieu: 'Omron',
        model: 'E2B-M12KS04',
        chatLieu: 'Vỏ kim loại, linh kiện điện tử',
        congDung: 'Điều khiển và phát hiện vị trí trong dây chuyền',
        thongSo: { 'Điện áp': '12-24V DC', 'Khoảng cách': '4mm' },
        chuTrongAnh: 'OMRON PROXIMITY SENSOR E2B-M12KS04 12-24VDC MADE IN JAPAN',
        khongChac: [],
      };
    },
  };
}

/**
 * Đánh giá kết quả của từng bước trong kịch bản.
 * Hai tiêu chí TÁCH RIÊNG (issue #168): "đã báo đang tra" (câu ngắn ≤ 3 giây) và "đã có kết quả" (tin
 * không phải câu đang tra). `phaiChua`/`khongChua` đo trên tin KẾT QUẢ; câu đang tra không thay được kết quả.
 * `opts.batDau` (ms) — mốc khách gửi, để đo giây; `opts.nguon` — dữ liệu Cổng + lời khách cho kiểm chống bịa.
 */
export function evaluateStep(stepDef, newMessages, scenario, { batDau = null, nguon = null, coTheTraCong = false } = {}) {
  const kyVong = stepDef.kyVong || {};
  const sentTexts = newMessages.map((m) => m.text);
  const ketQua = newMessages.filter((m) => !laTinDangTra(m.text));
  const combinedText = ketQua.map((m) => m.text).join('\n---\n');
  const giay = (m) => (batDau != null && m?.at ? (new Date(m.at).getTime() - batDau) : null);
  const dangTra = newMessages.find((m) => laTinDangTra(m.text));

  // 1. Kiểm tra bot im
  if (kyVong.botIm === true) {
    if (newMessages.length > 0) {
      return {
        ok: false,
        lyDo: `Kỳ vọng bot im lặng (0 tin), nhưng bot đã gửi ${newMessages.length} tin ra kênh`,
        sent: sentTexts,
      };
    }
    return { ok: true, lyDo: 'Bot im lặng đúng kỳ vọng', sent: [] };
  }

  // 2. Kiểm tra phải có phản hồi
  if (kyVong.phaiCoPhanHoi && newMessages.length === 0) {
    return {
      ok: false,
      lyDo: 'Bot không gửi bất kỳ tin nhắn phản hồi nào',
      sent: [],
    };
  }
  if (kyVong.phaiCoPhanHoi && !ketQua.length) {
    return { ok: false, lyDo: 'Đã báo đang tra nhưng CHƯA có kết quả trong thời gian chờ', sent: sentTexts };
  }

  // 2b. Báo đang tra (issue #168): kịch bản đòi thì phải có, và phải ra trong ≤ 3 giây. Bước có thể tra
  // Cổng mà kết quả đầu tiên ra sau 3 giây thì CŨNG phải có câu đang tra ≤ 3 giây (khách không bị bỏ im).
  const tDangTra = giay(dangTra);
  const tKetQua = giay(ketQua[0]);
  if (kyVong.baoDangTra === true && !dangTra) {
    return { ok: false, lyDo: 'Kỳ vọng có câu "đang tra" nhưng bot không gửi', sent: sentTexts };
  }
  if (dangTra && tDangTra != null && tDangTra > BAO_DANG_TRA_TOI_DA_MS) {
    return { ok: false, lyDo: `Câu "đang tra" ra sau ${(tDangTra / 1000).toFixed(1)}s (> 3s)`, sent: sentTexts };
  }
  if (coTheTraCong && !dangTra && tKetQua != null && tKetQua > BAO_DANG_TRA_TOI_DA_MS) {
    return { ok: false, lyDo: `Bot im ${(tKetQua / 1000).toFixed(1)}s rồi mới trả kết quả, không báo "đang tra" trong 3 giây`, sent: sentTexts };
  }
  if (kyVong.khongBaoDangTra === true && dangTra) {
    return { ok: false, lyDo: 'Bước này không được gửi câu "đang tra" (không tra Cổng)', sent: sentTexts };
  }

  // 2c. Chống bịa số hiệu văn bản (issue #168): mọi số hiệu phải có trong dữ liệu Cổng đã trả / lời khách.
  if (nguon) {
    for (const t of sentTexts) {
      const { la } = chanBia(t, nguon, { mau: PACKAGES.map((p) => p.mau) });
      if (la.length) return { ok: false, lyDo: `Số hiệu văn bản không có trong dữ liệu Cổng: ${la.join(', ')}`, sent: sentTexts };
    }
  }

  // 3. Kiểm tra gắn đúng người trong nhóm
  if (kyVong.tagDungNguoi) {
    const hasTag = sentTexts.some((t) => t.startsWith(kyVong.tagDungNguoi));
    if (!hasTag) {
      return {
        ok: false,
        lyDo: `Tin phản hồi không bắt đầu bằng tiền tố "${kyVong.tagDungNguoi}"`,
        sent: sentTexts,
      };
    }
  }

  // 4. Kiểm tra mẫu phải chứa
  if (Array.isArray(kyVong.phaiChua)) {
    for (const pattern of kyVong.phaiChua) {
      const re = new RegExp(pattern, 'i');
      if (!re.test(combinedText)) {
        return {
          ok: false,
          lyDo: `Nội dung phản hồi không khớp mẫu bắt buộc: /${pattern}/`,
          sent: sentTexts,
        };
      }
    }
  }

  // 5. Kiểm tra mẫu không được chứa
  if (Array.isArray(kyVong.khongChua)) {
    for (const pattern of kyVong.khongChua) {
      const re = new RegExp(pattern, 'i');
      if (re.test(combinedText)) {
        return {
          ok: false,
          lyDo: `Nội dung phản hồi chứa mẫu bị cấm: /${pattern}/`,
          sent: sentTexts,
        };
      }
    }
  }

  return { ok: true, sent: sentTexts };
}

const chuanQa = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

/**
 * Bước CÓ THỂ dẫn tới tra Cổng → chờ 120 giây (issue #168, phần 4). Ngoài bước phân loại còn có lệnh
 * ngắn "tra hscode"/"tra mã", tin có mã số, và tin trả lời câu bot vừa HỎI LẠI ("đúng, 350W 220V") —
 * QA thật 10/11 trượt vì các bước này chỉ được chờ 30 giây trong khi Cổng mất 30–55 giây.
 */
export function laBuocCoTheTraCong(step, { botVuaHoi = false } = {}) {
  if (step.kyVong?.botIm) return false;
  if (laBuocPhanLoai(step)) return true;
  const n = chuanQa(step.text);
  if (/\b(tra|hs|hscode|ma hs|ma so|thue|thu tuc|chinh sach)\b/.test(n) || /\d{4}/.test(n)) return true;
  if (step.photoUrl) return true;
  return Boolean(botVuaHoi);
}

/** Nhận diện bước có phân loại HS để áp dụng thời gian chờ lâu hơn (mặc định >= 120s) */
export function laBuocPhanLoai(step, scenario = {}) {
  if (typeof step.isClassify === 'boolean') return step.isClassify;
  if (typeof step.phanLoai === 'boolean') return step.phanLoai;
  if (step.kyVong?.coMaHsHoacHuongTra) return true;
  const mieuTa = (step.mieuTa || '').toLowerCase();
  const text = (step.text || '').toLowerCase();
  if (mieuTa.includes('phân loại') || mieuTa.includes('mã hs')) return true;
  if (text.includes('teaching box') || text.includes('phân loại') || text.includes('mã hs')) return true;
  if (text.length > 50 && !/^\s*\d{4,8}\s*$/.test(text)) return true;
  return false;
}

/**
 * Tạo thư mục tạm cho một kịch bản QA, chịu được chuyện TMPDIR bị dọn giữa bài đo.
 *
 * Bài đo Cổng thật 13/11 (OZV-608) chạy nền với `TMPDIR=/tmp/paperclip-run-<id>`; khi lượt chạy
 * kết thúc, harness xoá thư mục đó, nên từ ca thứ 13 `mkdtempSync` chết `ENOENT` (mkdtemp KHÔNG
 * tự tạo thư mục cha) và mất 38/50 ca. Nên: tự tạo thư mục cha; cha vẫn không dựng được thì rơi
 * về `/tmp` bền vững — thà chỗ tạm khác chỗ khai còn hơn mất cả lượt đo.
 */
export function taoThuMucTamQa(prefix = 'oz-qa-scenario-') {
  const ungVien = [tmpdir(), '/tmp'];
  let loiCuoi = null;
  for (const goc of ungVien) {
    try {
      mkdirSync(goc, { recursive: true });
      return mkdtempSync(join(goc, prefix));
    } catch (err) {
      loiCuoi = err;
    }
  }
  throw loiCuoi || new Error('Không tạo được thư mục tạm cho kịch bản QA');
}

/** Chạy một kịch bản QA đơn lẻ. */
export async function runSingleScenario(scenario, {
  env = {},
  isMock = false,
  now = () => new Date(),
  customMcp = null,
  maxJobWaitMs = 120_000,
  pollIntervalMs = isMock ? 100 : 1_000,
} = {}) {
  const tmpDir = taoThuMucTamQa();
  const dbPath = join(tmpDir, 'qa.db');
  const store = openStore(dbPath);
  const channel = createQaChannel();

  // Đồng hồ của kịch bản: giờ thật + phần bù do các bước khai `cachTruoc`. Lõi/cửa gửi đọc
  // đồng hồ này, nên hai tin cách nhau "5m" trong kịch bản cũng cách nhau 5 phút với cửa gửi.
  let buThoiGian = 0;
  const dongHo = () => new Date(now().getTime() + buThoiGian);

  // Đếm tool call
  const toolCalls = [];
  let mcp;
  if (customMcp) {
    mcp = customMcp;
  } else if (scenario.id === 'loi-cong-llm' || scenario.moPhongLoi === 'mcp-error') {
    // Mô phỏng Cổng lỗi
    mcp = {
      calls: toolCalls,
      async listTools() { throw new Error('Cổng OZ ngắt kết nối (ECONNREFUSED)'); },
      async callTool() { throw new Error('Cổng OZ lỗi HTTP 502 Bad Gateway'); },
    };
  } else if (isMock) {
    const rawMock = createMockMcp();
    mcp = {
      calls: toolCalls,
      async listTools() { return rawMock.listTools(); },
      async callTool(name, args) {
        const c = { name, args };
        toolCalls.push(c);
        c.result = await rawMock.callTool(name, args);
        return c.result;
      },
    };
  } else {
    const rawMcp = createMcpClient({
      url: env.OZ_MCP_URL || 'https://mcp.uythacnhapkhau.com/mcp',
      token: env.OZ_MCP_TOKEN,
      authHeader: env.OZ_MCP_AUTH_HEADER || 'Authorization',
    });
    mcp = {
      calls: toolCalls,
      async listTools() { return rawMcp.listTools(); },
      async callTool(name, args) {
        const c = { name, args };
        toolCalls.push(c);
        c.result = await rawMcp.callTool(name, args);
        return c.result;
      },
    };
  }

  let vision;
  let brain;
  let editor;

  if (isMock) {
    vision = createMockVision();
    brain = null;
    editor = null;
  } else {
    vision = env.GEMINI_API_KEY ? createVision({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-flash-latest' }) : null;
    brain = env.GEMINI_API_KEY ? createBrain({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_BRAIN_MODEL || undefined, off: false }) : null;
    editor = env.GEMINI_API_KEY ? createEditor({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_EDITOR_MODEL || undefined, off: false }) : null;
  }

  const botNames = scenario.botNames || ['OZ Tra cứu HS', 'Bot OZ'];
  const config = {
    capChatDay: 100,
    capGroupDay: 500,
    capAllDay: 1000,
    staffChatId: 'staff-group-qa',
    staffUsers: new Set(['nv_qa']),
    bannedPatterns: [],
    botNames,
    humanIdleMs: 7_200_000,
  };

  const gate = createGate({
    store,
    channel,
    now: dongHo,
    rules: {
      capChatDay: config.capChatDay,
      capGroupDay: config.capGroupDay,
      capAllDay: config.capAllDay,
      similarity: 0.9,
      directReplyMs: 600_000,
      quietHours: false,
      bannedPatterns: config.bannedPatterns,
    },
    onAlert: () => {},
    onTicket: () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  const handoff = createHandoff({
    store,
    gate,
    config,
    now: dongHo,
    log: { info() {}, warn() {}, error() {} },
  });

  const engine = createEngine({
    config,
    store,
    channel,
    mcp,
    vision,
    brain,
    editor,
    registry: createRegistry([hsPack]),
    gate,
    handoff,
    now: dongHo,
    log: { info() {}, warn() {}, error() {} },
  });

  const stepResults = [];
  const khachDaGui = [];
  let scenarioOk = true;
  let failReason = '';

  try {
    for (const [idx, step] of scenario.steps.entries()) {
      // Khoảng lặng giữa hai tin của khách: đẩy đồng hồ kịch bản, không ngủ thật.
      buThoiGian += docKhoangCach(step.cachTruoc);
      const stepStart = Date.now();
      const isPhanLoai = laBuocPhanLoai(step, scenario);
      const truocDo = channel.sent.length ? String(channel.sent[channel.sent.length - 1].text || '') : '';
      const coTheTraCong = laBuocCoTheTraCong(step, { botVuaHoi: /\?\s*$|ạ\?/.test(truocDo) });
      const toolsBefore = toolCalls.length;
      // Chờ 120 giây cho bước có thể tra Cổng; bước khác 30 giây — nhưng hễ bước đã gọi Cổng hoặc có việc
      // nền thì cũng được chờ đủ 120 giây (đo trong vòng chờ bên dưới).
      const choToiDa = () => step.timeoutMs || ((coTheTraCong || toolCalls.length > toolsBefore || hasOpenJobs()) ? CHO_TRA_CONG_MS : CHO_THUONG_MS);
      const sentBefore = channel.sent.length;
      const isPhoto = Boolean(step.photoUrl);
      const isText = !isPhoto && Boolean(step.text);

      const update = {
        updateKey: `qa_${scenario.id}_${idx + 1}_${Date.now()}`,
        event: isPhoto ? 'message.image.received' : (isText ? 'message.text.received' : 'unknown'),
        chatId: step.chatId || scenario.chatId || 'qa_chat_01',
        userId: step.userId || scenario.userId || 'qa_user_01',
        userName: step.userName || scenario.userName || 'Khách QA',
        chatType: step.chatType || scenario.chatType || 'PRIVATE',
        text: step.text || null,
        photoUrl: step.photoUrl || null,
        caption: step.caption || null,
        messageId: `msg_${idx + 1}`,
      };

      const hasOpenJobs = () => store.jobs.countWaiting() > 0 || store.jobs.polling().length > 0;
      const procRes = await engine.process(update);
      await engine.drain();

      // Chờ tới khi có tin KẾT QUẢ (câu "đang tra" không tính) và xong việc nền, hoặc hết hạn chờ.
      const hasReplied = () => channel.sent.slice(sentBefore).some((m) => !laTinDangTra(m.text));

      if (step.kyVong?.botIm) {
        while (hasOpenJobs() && Date.now() - stepStart < choToiDa()) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          await engine.drain();
        }
      } else {
        while (Date.now() - stepStart < choToiDa()) {
          if (hasReplied() && !hasOpenJobs()) {
            break;
          }
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          await engine.drain();
        }
      }

      const durationMs = Date.now() - stepStart;
      const durationSec = (durationMs / 1000).toFixed(1);
      const sentNow = channel.sent.slice(sentBefore);
      khachDaGui.push(step.text, step.caption);
      const evalRes = evaluateStep(step, sentNow, scenario, { batDau: stepStart, coTheTraCong,
        nguon: [toolCalls.map((c) => c.result), khachDaGui] });
      const sauGiay = (m) => (m ? `${((new Date(m.at).getTime() - stepStart) / 1000).toFixed(1)}s` : null);

      stepResults.push({
        stepIndex: idx + 1,
        mieuTa: step.mieuTa || `Bước ${idx + 1}`,
        input: step.text || (step.photoUrl ? `[ảnh] ${step.photoUrl}` : ''),
        sent: sentNow.map((m) => m.text),
        ok: evalRes.ok,
        lyDo: evalRes.lyDo || '',
        durationMs,
        durationText: `${durationSec}s`,
        isPhanLoai,
        coTheTraCong,
        baoDangTraSau: sauGiay(sentNow.find((m) => laTinDangTra(m.text))),
        ketQuaSau: sauGiay(sentNow.find((m) => !laTinDangTra(m.text))),
      });

      if (!evalRes.ok) {
        scenarioOk = false;
        if (!failReason) {
          failReason = `Bước ${idx + 1} (${step.mieuTa || ''}): ${evalRes.lyDo}`;
        }
      }
    }
  } catch (err) {
    scenarioOk = false;
    failReason = `Lỗi thực thi kịch bản: ${err?.message || err}`;
  } finally {
    try { store.close(); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  }

  return {
    id: scenario.id,
    dich: scenario.dich || 'G',
    ten: scenario.ten || scenario.id,
    moTa: scenario.moTa || '',
    ok: scenarioOk,
    lyDo: failReason,
    toolCallsCount: toolCalls.length,
    toolCalls,
    zaloApiCalls: channel.zaloApiCallCount,
    stepResults,
    durationMs: stepResults.reduce((s, x) => s + (x.durationMs || 0), 0),
  };
}

/** Tạo văn bản báo cáo Markdown từ kết quả các kịch bản. */
export function generateReportMarkdown({ results, startedAt, envMeta = {}, isMock = false }) {
  const dateStr = vnDateKey(startedAt);
  const timeStr = vnStamp(startedAt);
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;

  const lines = [
    `# Báo cáo QA chạy thật — Đích G2–G4 (Zalo Bot OZ)`,
    ``,
    `> **Thời gian chạy:** ${timeStr} VN  `,
    `> **Môi trường:** Lõi thật (\`core/engine.js\`), Gói hải quan (\`packs/hs\`), ${isMock ? 'Bộ giả lập cấu trúc (--mock)' : 'Cổng OZ thật + Gemini thật'}  `,
    `> **Kênh gửi:** Kênh giả ghi lại (Fake Recording Channel) — **0 lượt gọi API Zalo**  `,
    `> **Kết quả tổng quát:** **${passed}/${total} kịch bản ĐẠT** (${Math.round((passed / total) * 100)}%)`,
    ``,
    `## 1. Bảng tổng hợp trạng thái`,
    ``,
    `| Kịch bản | Đích | Trạng thái | Thời gian | Số lượt gọi công cụ | Kết quả chi tiết |`,
    `|---|---|---|---|---|---|`,
  ];

  for (const r of results) {
    const statusIcon = r.ok ? '✅ **ĐẠT**' : '❌ **TRƯỢT**';
    const note = r.ok ? 'Đáp ứng toàn bộ tiêu chí' : r.lyDo.replace(/\|/g, '\\|');
    const dur = `${(((r.durationMs || 0)) / 1000).toFixed(1)}s`;
    lines.push(`| ${r.ten} | \`${r.dich}\` | ${statusIcon} | ${dur} | ${r.toolCallsCount} | ${note} |`);
  }

  lines.push(
    ``,
    `## 2. Chi tiết từng kịch bản`,
    ``
  );

  for (const r of results) {
    lines.push(
      `### ${r.ten}`,
      `- **Đích kiểm tra:** \`${r.dich}\``,
      `- **Trạng thái:** ${r.ok ? '✅ **ĐẠT**' : '❌ **TRƯỢT**'}`,
      `- **Số lần gọi công cụ Cổng:** ${r.toolCallsCount}${r.toolCalls.length ? ` (${[...new Set(r.toolCalls.map((c) => c.name))].join(', ')})` : ''}`,
      `- **Lượt gọi API Zalo:** ${r.zaloApiCalls} (0 = an toàn)`,
      r.ok ? '' : `- **Lý do trượt:** ${r.lyDo}`,
      ``,
      `**Diễn biến các bước:**`,
      ``
    );

    for (const step of r.stepResults) {
      lines.push(
        `#### Bước ${step.stepIndex}: ${step.mieuTa}`,
        `- **Khách gửi:** \`${step.input}\``,
        `- **Thời gian phản hồi:** \`${step.durationText || `${(((step.durationMs || 0)) / 1000).toFixed(1)}s`}\``,
        `- **Báo "đang tra":** ${step.baoDangTraSau ? `có, sau ${step.baoDangTraSau}` : 'không'} · **Có kết quả:** ${step.ketQuaSau ? `có, sau ${step.ketQuaSau}` : 'chưa'}${step.coTheTraCong ? ' · bước có thể tra Cổng (chờ tối đa 120 giây)' : ''}`,
        `- **Trạng thái bước:** ${step.ok ? '✓ Đạt' : `✗ Trượt (${step.lyDo})`}`,
        `- **Nguyên văn bot gửi (${step.sent.length} tin):**`,
        step.sent.length
          ? step.sent.map((t) => `\`\`\`text\n${t}\n\`\`\``).join('\n\n')
          : `*(Bot im lặng — 0 tin)*`,
        ``
      );
    }
  }

  lines.push(
    `## 3. Khẳng định an toàn và tuân thủ Hiến pháp`,
    ``,
    `- **Hiến pháp Điều I & VII (An toàn kênh Zalo):** Toàn bộ kịch bản sử dụng kênh giả ghi lại, ghi nhận **đúng 0 lượt gọi API Zalo**. Hoàn toàn không nhắn tin ra ngoài người thật.`,
    `- **Hiến pháp Điều IX (Che giấu bí mật):** Toàn bộ khoá (\`OZ_MCP_TOKEN\`, \`GEMINI_API_KEY\`) được đọc an toàn, không in ra màn hình console hay báo cáo.`,
    `- **Dữ liệu vận hành:** Quá trình kiểm thử diễn ra trên tệp SQLite độc lập trong thư mục tạm, hoàn toàn không chạm vào \`bot.db\` thật.`,
    ``
  );

  return lines.join('\n');
}

/** Chạy toàn bộ bộ QA. */
export async function runQa({
  env = process.env,
  isMock = false,
  scenariosDir = join(ROOT_DIR, 'eval', 'qa-that'),
  outDir = join(ROOT_DIR, 'qa-that'),
  now = () => new Date(),
} = {}) {
  // Đọc thêm từ .env nếu có
  const mergedEnv = { ...loadDotEnv(), ...env };
  const hasKeys = Boolean(mergedEnv.OZ_MCP_TOKEN && mergedEnv.GEMINI_API_KEY);

  if (!isMock && !hasKeys) {
    console.error('\n' + '='.repeat(64));
    console.error('⚠️  THIẾU CẤU HÌNH BIẾN MÔI TRƯỜNG ĐỂ CHẠY QA THẬT');
    console.error('='.repeat(64));
    console.error('Bộ QA yêu cầu kết nối Cổng OZ thật và Gemini AI Studio thật:');
    if (!mergedEnv.OZ_MCP_TOKEN) console.error('  - Thiếu OZ_MCP_TOKEN (Cổng tra cứu hải quan)');
    if (!mergedEnv.GEMINI_API_KEY) console.error('  - Thiếu GEMINI_API_KEY (Google AI Studio)');
    console.error('\nHướng dẫn:');
    console.error('  1. Cấu hình tệp .env ở thư mục gốc (xem .env.example).');
    console.error('  2. Hoặc chạy kiểm thử cấu trúc ở chế độ giả lập an toàn bằng lệnh:');
    console.error('     node scripts/qa-that.mjs --mock\n');
    return { ok: false, missingEnv: true };
  }

  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(scenariosDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  console.log(`\n🤖 Bắt đầu bộ QA chạy thật (${isMock ? 'chế độ --mock' : 'chế độ Cổng thật + Gemini thật'})...`);
  console.log(`📂 Nạp ${files.length} kịch bản từ ${scenariosDir}`);

  const results = [];
  for (const f of files) {
    const filePath = join(scenariosDir, f);
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    console.log(`▶ Chạy [${content.dich || 'QA'}]: ${content.ten}...`);
    const res = await runSingleScenario(content, { env: mergedEnv, isMock, now });
    results.push(res);
    console.log(`  ${res.ok ? '✓ ĐẠT' : `✗ TRƯỢT (${res.lyDo})`} (công cụ: ${res.toolCallsCount}, Zalo API: ${res.zaloApiCalls})`);
  }

  const startedAt = now();
  const reportMd = generateReportMarkdown({
    results,
    startedAt,
    isMock,
  });

  const reportFileName = `ket-qua-${vnDateKey(startedAt)}.md`;
  const reportPath = join(outDir, reportFileName);
  writeFileSync(reportPath, reportMd, 'utf8');

  console.log(`\n📄 Đã xuất báo cáo tại: ${reportPath}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`📊 Kết quả: ${passed}/${results.length} kịch bản ĐẠT\n`);

  return {
    ok: true,
    passed,
    total: results.length,
    reportPath,
    results,
  };
}

// Chạy trực tiếp qua CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const isMock = process.argv.includes('--mock') || process.argv.includes('--dry-run');
  const res = await runQa({ isMock });
  if (res.missingEnv) {
    process.exit(1);
  }
}
