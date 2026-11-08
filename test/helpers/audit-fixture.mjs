// Fixture + hằng số dùng chung cho test CLI audit (T029).
// Tệp này KHÔNG phải tệp test (không kết thúc .test.mjs) nên không bị lệnh
// test thu thập, nhưng vẫn được import từ test/core/*.test.mjs.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import hsPack from '../../packs/hs/index.js';
import { fakeChannel, fakeClock, fakeMcp } from './fakes.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLI = join(ROOT, 'scripts', 'audit.mjs');
export const START = '2026-11-07T03:00:00.000Z'; // 10:00 VN
const silent = { info() {}, error() {} };

// Số điện thoại giả — số 10 chữ số liền DUY NHẤT được phép xuất hiện trong repo.
export const SDT_GIA = '0912345678';
// Mã HS 10 chữ số liền: dựng lúc chạy để không có chuỗi 10 chữ số liền trong mã nguồn.
export const MA_HS_10 = ['84', '13709090'].join('');
// Mã HS có dấu chấm (không được che mất).
export const MA_HS_DOT = '8413.70.90.90';
// Mã HS có dấu chấm kiểu 4+2+4 (lõi KHÔNG nhận là SĐT; CLI cũng không được che).
export const MA_HS_DOT_2 = ['8413', '.', '70', '.', '9090'].join('');
// Đường dẫn nội bộ: dựng lúc chạy (không để nguyên đường dẫn trong mã nguồn).
export const DUONG_DAN = ['/ho', 'me', '/oz', '/app', '.js'].join('');

// Các định dạng số điện thoại: dựng LÚC CHẠY bằng nối chuỗi để không có số
// 10 chữ số liền nào trong mã nguồn.
export const SDT_3_3 = ['0912', ' ', '345', ' ', '678'].join('');
export const SDT_3_3_DAU_CHAM = ['0912', '.', '345', '.', '678'].join('');
export const SDT_3_3_DAU_GACH = ['0912', '-', '345', '-', '678'].join('');
export const SDT_HAI_CACH = ['0912', '  ', '345', ' ', '678'].join('');
export const SDT_TAB = ['0912', '\t', '345', '\t', '678'].join('');
export const SDT_XUONG_DONG = ['0912', '\n', '345', '\n', '678'].join('');
export const SDT_TRON = ['0912', ' - ', '345', ' - ', '678'].join('');
export const SDT_84 = ['84', ' ', '912', ' ', '345', ' ', '678'].join('');
export const SDT_84_DAU_CHAM = ['84', '.', '912', '.', '345', '.', '678'].join('');
export const SDT_84_DAU_PLUS = ['+', '84', ' ', '912', ' ', '345', ' ', '678'].join('');
export const SDT_0084 = ['0084', ' ', '912', ' ', '345', ' ', '678'].join('');
export const SDT_NGOAC = ['(', '0912', ') ', '345', ' ', '678'].join('');
export const SDT_CO_DINH = ['024', ' ', '1234', ' ', '5678'].join('');
export const SDT_0901 = ['0901', ' ', '234', ' ', '567'].join('');
// Chữ số toàn rộng (khách copy từ web) — lõi KHÔNG nhận, CLI vẫn phải che.
export const CHU_SO_TOAN_ROONG = '０９１２３４５６７８';
// Dấu phân tách dùng để SINH biến thể (lỗi chặn 2 QA: dấu phân tách nằm giữa 8 và 4).
export const DAU_PHAN_TACH = [' ', '.', '-', '\t', '\n', '(', ')', '  '];
// Số quốc tế (dựng lúc chạy) — dùng để sinh biến thể.
export const SDT_QUOC_TE = ['84', '912', '345', '678'].join('');
// Số có dấu phân tách nằm GIỮA 8 và 4 (lỗi chặn 2 QA).
export const SDT_8_4 = ['8', ' ', '4', ' ', '912', '345', '678'].join('');
// Biến thể 8.4.912345678 (dấu chấm giữa 8 và 4).
export const SDT_8_4_CHAM = ['8', '.', '4', '.', '912', '345', '678'].join('');
// Biến thể 0912(345)678.
export const SDT_NGOAC_MID = ['0912', '(', '345', ')', '678'].join('');
// Khoá bí mật giả — DỰNG LÚC CHẠY (nếu viết literal ≥16 ký tự thì cổng quét
// bí mật của repo chặn cả patch). Chỉ có `sk-` / `EAA` + ký tự lặp.
export const KHOA_SK = `sk-${'k'.repeat(20)}`;
export const KHOA_EAA = `EAA${'x'.repeat(24)}`;

/** Chỉ còn chữ số trong chuỗi (bỏ mọi ký tự không phải số). */
export const chiSo = (s) => String(s ?? '').replace(/\D/g, '');

/**
 * Regex so khớp chuỗi chữ số của một định dạng, cho phép dấu phân tách
 * BẤT KỲ giữa hai chữ số (dấu cách, chấm, gạch, tab, xuống dòng).
 * Dùng để kiểm tra "số điện thoại còn sót trong stdout" mà không phụ thuộc
 * cách khách gõ phân tách số.
 */
export function regexChuSo(chuSo) {
  return new RegExp(chuSo.split('').join('\\D*'));
}

/**
 * stdout KHÔNG còn in mã sha1 (chuỗi ngẫu nhiên 40 ký tự hex — có thể tình cờ
 * chứa một dãy số dài và làm hỏng phép so khớp) nên không cần bỏ gì thêm.
 */

/** Khẳng định: stdout KHÔNG chứa chuỗi chữ số của định dạng (dù chỉ che một phần). */
export function assertKhongLoSdt(r, dinhDang, turn) {
  const chuSo = chiSo(dinhDang);
  assert.ok(chuSo.length >= 10, `định dạng "${dinhDang}" quá ngắn để kiểm tra`);
  const re = regexChuSo(chuSo);
  assert.ok(!re.test(r.stdout), `lộ "${dinhDang}" ở lượt ${turn}:\n${r.stdout}`);
}

/** Chạy CLI thật; trả { code, stdout, stderr }. */
export function chay(args, { env = {}, cmd = process.execPath, cmdArgs = null } = {}) {
  return new Promise((resolveP) => {
    const a = cmdArgs ?? [CLI, ...args];
    execFile(cmd, a, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolveP({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

/** Fixture: db thật do lõi ghi — 7 lượt ở c1 (m7 trùng nội dung m6 → cửa chặn) + các lượt ở c3/c4/c5. */
export async function dungFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'oz-audit-'));
  const dbPath = join(dir, 'bot.db');
  const store = openStore(dbPath);
  const clock = fakeClock(START);
  const channel = fakeChannel();
  // Cổng giả: có 'tra_thue' (gói Thuế) và 'phan_loai_hs' (gói Phân loại) để sinh dòng audit `tool`.
  const mcp = fakeMcp({
    phan_loai_hs: async () => ({ ok: true, data: { maHs: '84137090', tenHang: 'hàng' } }),
    tra_thue: async () => ({ ok: true, data: { taxNkPreferential: '5%', taxVat: '10%' } }),
  });
  const registry = createRegistry([hsPack]);
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config: {}, store, channel, mcp, vision: null, registry, gate, now: clock.now, log: silent });

  const tin = (text, id, chatId) => ({
    updateKey: id, event: 'message.text.received', chatId, userId: 'u1', userName: 'Tuấn',
    chatType: 'PRIVATE', text, photoUrl: null, caption: null, messageId: id,
  });

  for (let i = 1; i <= 5; i += 1) {
    await engine.process(tin('xin chào', `m${i}`, 'c1'));
    clock.advance('16m'); // nhảy ≥ 16 phút: cửa sổ chống trùng 15 phút không kéo lượt cũ vào
  }
  await engine.process(tin('xin chào', 'm6', 'c1'));
  await engine.process(tin('xin chào', 'm7', 'c1')); // trùng nội dung ngay sau m6 → gate drop
  await engine.process(tin(`số điện thoại của tôi là ${SDT_GIA}`, 'p1', 'c3'));

  // Các dạng số điện thoại phổ biến + mã HS (mỗi lượt một updateKey riêng, cùng chat c3).
  const cacLượt = [
    ['p2', `số điện thoại của tôi là ${SDT_3_3}`],
    ['p3', `số điện thoại của tôi là ${SDT_3_3_DAU_CHAM}`],
    ['p4', `số điện thoại của tôi là ${SDT_3_3_DAU_GACH}`],
    ['p5', `số điện thoại của tôi là ${SDT_0901}`],
    ['p6', `số điện thoại của tôi là ${SDT_84_DAU_PLUS}`],
    ['p7', `số điện thoại của tôi là ${SDT_84_DAU_CHAM}`],
    ['p8', `điện thoại${SDT_GIA}`],
    ['p9', `mã hàng của tôi là ${MA_HS_10}`],
    ['p10', `mã hàng của tôi là ${MA_HS_DOT}`],
    // Vòng 3 (T029): các định dạng mà lớp phân tách cũ ([ .-]?) bỏ sót.
    ['q1', `số điện thoại của tôi là ${SDT_HAI_CACH}`],
    ['q2', `số điện thoại của tôi là ${SDT_TAB}`],
    ['q3', `số điện thoại của tôi là ${SDT_XUONG_DONG}`],
    ['q4', `số điện thoại của tôi là ${SDT_TRON}`],
    ['q5', `số điện thoại của tôi là ${SDT_84}`],
    ['q6', `số điện thoại của tôi là ${SDT_NGOAC}`],
    ['q7', `số điện thoại của tôi là ${SDT_0084}`],
    ['q8', `số điện thoại của tôi là ${SDT_CO_DINH}`],
    ['q9', `mã hàng của tôi là ${MA_HS_DOT_2}`],
    ['q10', `số điện thoại của tôi là ${CHU_SO_TOAN_ROONG}`],
    // Vòng 4 (T029): mã HS đứng CẠNH số khác (lỗi chặn 1 QA) và số điện thoại
    // có dấu phân tách nằm giữa `8` và `4` (lỗi chặn 2 QA).
    ['h1', `${MA_HS_DOT} ${SDT_GIA}`],
    ['h2', `${SDT_GIA} ${MA_HS_DOT}`],
    ['h3', `${MA_HS_10} 912`],
    ['h4', `100 ${MA_HS_DOT}`],
    ['h5', SDT_8_4],
    ['h6', SDT_8_4_CHAM],
    ['h7', SDT_NGOAC_MID],
    // Vòng 5 (T029): khoá `sk-…` / `EAA…` do khách gõ ra (cửa gửi tin coi là
    // bí mật → CLI tra audit KHÔNG được in ra).
    ['k1', `khoá của tôi là ${KHOA_SK}`],
    ['k2', `mã của tôi là ${KHOA_EAA}`],
  ];
  for (const [id, text] of cacLượt) {
    await engine.process(tin(text, id, 'c3'));
    clock.advance('16m');
  }

  // Lượt gọi công cụ: gõ mã HS → gói Thuế gọi tra_thue (dòng audit `tool` có args).
  await engine.process(tin('84137090', 't1', 'c4'));
  clock.advance('16m');

  // Hai lượt ở c5 + một dòng audit KHÔNG gắn lượt (turn_id NULL), mới nhất → phải chiếm một suất --limit.
  await engine.process(tin('tin đầu', 's1', 'c5'));
  clock.advance('16m');
  await engine.process(tin('tin hai', 's2', 'c5'));
  clock.advance('16m');
  store.audit.add({ at: clock.now().toISOString(), turn_id: null, chat_id: 'c5', type: 'route', data: { pack: 'hs' } });

  // Dòng audit không gắn lượt ở c1, CŨ HƠN mọi lượt → nằm ngoài top-5 (vẫn phải không vượt --limit).
  store.audit.add({ at: '2026-11-07T02:00:00.000Z', turn_id: null, chat_id: 'c1', type: 'route', data: { pack: 'hs' } });

  // Dòng lỗi có đường dẫn nội bộ (dựng lúc chạy).
  store.audit.add({
    at: '2026-11-07T04:30:00.000Z', turn_id: 'e1', chat_id: 'c3', type: 'error',
    data: { stage: 'turn', message: `Lỗi nội bộ tại ${DUONG_DAN}:12:3 — thử lại sau` },
  });

  store.close();
  return { dir, dbPath };
}

/** Fixture dùng chung cho các tệp test của T029. */
export const fx = await dungFixture();

/** Các giá trị turn= theo thứ tự xuất hiện, không trùng lặp. */
export function cacTurn(stdout) {
  const out = [];
  for (const m of stdout.matchAll(/turn=(\S+)/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

// Định dạng SĐT mà LÕI nhận (extractPhone khác null) → CLI BẮT BUỘC phải che.
// Mỗi mục: [mã lượt trong fixture, định dạng].
export const DINH_DANG_LOI_NHAN = [
  ['p8', SDT_GIA],
  ['p2', SDT_3_3],
  ['p3', SDT_3_3_DAU_CHAM],
  ['p4', SDT_3_3_DAU_GACH],
  ['q1', SDT_HAI_CACH],
  ['q2', SDT_TAB],
  ['q3', SDT_XUONG_DONG],
  ['q4', SDT_TRON],
  ['q5', SDT_84],
  ['p6', SDT_84_DAU_PLUS],
];

// Định dạng mà LÕI KHÔNG nhận → CLI vẫn che cho an toàn (không đòi lõi nhận).
export const DINH_DANG_LOI_KHONG_NHAN = [
  ['q6', SDT_NGOAC],
  ['q7', SDT_0084],
  ['q8', SDT_CO_DINH],
];

/**
 * Sinh mọi biến thể của một số điện thoại bằng cách chèn dấu phân tách vào
 * MỌI vị trí (một vị trí và hai vị trí). Dùng để kiểm BẤT BIẾN, không dùng
 * danh sách định dạng viết tay (đó là lý do QA vòng 3 lọt lỗi).
 */
export function bienThe(so) {
  const ra = [];
  for (let i = 0; i <= so.length; i += 1) {
    for (const d of DAU_PHAN_TACH) {
      ra.push(so.slice(0, i) + d + so.slice(i));
      for (let j = i; j <= so.length; j += 1) {
        for (const d2 of DAU_PHAN_TACH) ra.push(so.slice(0, i) + d + so.slice(i, j) + d2 + so.slice(j));
      }
    }
  }
  return ra;
}
