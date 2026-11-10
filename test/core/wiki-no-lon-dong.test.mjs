// Test chống wiki lệch với cam kết độ dài tệp (Điều VI — hiến pháp: mỗi tệp dưới 300 dòng).
// Soát [S28]: `core/engine.js` vượt 300 dòng nhưng `docs/wiki/an-toan.md` vẫn khẳng định
// "toàn bộ các tệp trong `core/` đều tuân thủ dưới 300 dòng" ⇒ cam kết trong wiki sai lệch với code.
//
// Ba kiểm:
//  1. Mọi tệp mã nguồn chạy thật > 300 dòng trong `core/` và `packs/hs/` phải được wiki nêu tên
//     kèm số dòng THẬT (đo bằng `wc -l`) — tệp vượt mốc mà không được ghi nhận = nợ bị giấu.
//  2. Mọi số dòng wiki ghi cho một tệp phải khớp số dòng thật của tệp đó (wiki cũ để lại số cũ = sai).
//  3. Wiki không được khẳng định "toàn bộ `core/` dưới 300 dòng" khi đã có tệp `core/` vượt mốc.
//
// Phạm vi đo: tệp mã nguồn chạy thật trong `core/` và `packs/hs/`, KHÔNG tính thư mục `test/`
// (tệp kiểm thử không nằm trong đường chạy của bot; wiki cũng ghi phạm vi này).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const WIKI = join(ROOT, 'docs', 'wiki', 'an-toan.md');
const HAN_DONG = 300;
const THU_MUC_QUAN_SAT = ['core', 'packs/hs'];

/** Số dòng theo đúng `wc -l` (đếm ký tự xuống dòng). */
export function soDong(file) {
  const t = readFileSync(file, 'utf8');
  return (t.match(/\n/g) || []).length;
}

/** Mọi tệp mã nguồn chạy thật trong `core/` và `packs/hs/` (bỏ thư mục `test/`), đường dẫn tương đối. */
export function tepTrongPhamVi() {
  const ra = [];
  const quet = (dir) => {
    for (const ten of readdirSync(dir)) {
      if (ten === 'test' || ten === 'node_modules') continue;
      const duong = join(dir, ten);
      if (statSync(duong).isDirectory()) { quet(duong); continue; }
      if (ten.endsWith('.js')) ra.push(relative(ROOT, duong).split(sep).join('/'));
    }
  };
  for (const t of THU_MUC_QUAN_SAT) quet(join(ROOT, t));
  return ra.sort();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('wiki: mọi tệp mã nguồn > 300 dòng trong core/ và packs/hs/ đều được an-toan.md ghi nhận kèm số dòng thật', () => {
  const wiki = readFileSync(WIKI, 'utf8');
  const vuot = tepTrongPhamVi()
    .map((f) => ({ f, n: soDong(join(ROOT, f)) }))
    .filter((x) => x.n > HAN_DONG);
  assert.ok(vuot.length > 0, 'Không tìm thấy tệp nào vượt 300 dòng — phạm vi đo có thể đã sai');

  const thieu = vuot.filter(({ f, n }) => {
    const re = new RegExp('`' + escapeRe(f) + '`[^\\n]{0,40}?' + n + '\\s*dòng');
    return !re.test(wiki);
  });
  assert.deepEqual(thieu.map((x) => `${x.f} (${x.n} dòng)`), [],
    'Tệp vượt 300 dòng mà an-toan.md chưa ghi nhận kèm số dòng thật — wiki lệch với cam kết Điều VI');
});

test('wiki: số dòng an-toan.md ghi cho tệp phải khớp số dòng thật (wc -l)', () => {
  const wiki = readFileSync(WIKI, 'utf8');
  const re = /`([\w./-]+\.(?:js|mjs))`[^\S\n]*(?::[^\S\n]*)?(?:\([^\S\n]*)?(\d+)\s+dòng/g;
  const lech = [];
  for (const m of wiki.matchAll(re)) {
    const [, duong, so] = m;
    const file = join(ROOT, duong);
    let that;
    try { that = statSync(file); } catch { lech.push(`${duong}: tệp không tồn tại trong repo`); continue; }
    if (!that.isFile()) continue;
    const n = soDong(file);
    if (n !== Number(so)) lech.push(`${duong}: wiki ghi ${so} dòng, thật là ${n} dòng`);
  }
  assert.deepEqual(lech, [], 'Số dòng ghi trong wiki không khớp thực tế');
});

test('wiki: không còn khẳng định "toàn bộ core/ dưới 300 dòng" khi đã có tệp core/ vượt mốc', () => {
  const wiki = readFileSync(WIKI, 'utf8');
  const vuotCore = tepTrongPhamVi()
    .filter((f) => f.startsWith('core/'))
    .map((f) => ({ f, n: soDong(join(ROOT, f)) }))
    .filter((x) => x.n > HAN_DONG);
  assert.ok(vuotCore.length > 0, 'Không có tệp core/ vượt 300 dòng — phản đoán đã đổi, kiểm này không còn ý nghĩa');

  // Cắt theo câu (xuống dòng và dấu ";") để không vướng từ bảng vào câu khác.
  const mau = [];
  for (const doan of wiki.split(/[\n;]/)) {
    if (!doan.includes('core/')) continue;
    if (!/đều/i.test(doan)) continue;
    if (!/300\s*dòng/.test(doan)) continue;
    mau.push(doan.trim().slice(0, 160));
  }
  assert.deepEqual(mau, [],
    'Wiki vẫn khẳng định phạm vi `core/` dưới 300 dòng trong khi đã có tệp vượt mốc');
});
