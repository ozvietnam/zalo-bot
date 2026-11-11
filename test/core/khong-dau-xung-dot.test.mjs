// Cổng chặn dấu xung đột git bị commit vào repo.
//
// Vì sao có cổng này: PR #207 (rebase #203 lên main mới) commit cả dấu xung đột chưa gỡ
// (`<<<<<<< ours`, `=======`, `>>>>>>> theirs`) vào `docs/wiki/an-toan.md` và `docs/wiki/log.md`.
// Hệ quả thật: một câu wiki bị nhân ba với ba bộ số dòng khác nhau (620/627/636), nên
// `test/core/wiki-no-lon-dong.test.mjs` trượt 2 ca. Nhưng `node scripts/kiem-wiki.mjs --nghiem`
// vẫn báo "ĐẠT (16 trang)" — tức là cổng wiki KHÔNG thấy dấu xung đột. Lỗi chỉ lộ ra ở một
// cổng khác, và chỉ với tệp wiki có ghi số dòng; dấu xung đột trong tệp khác sẽ đi lọt hoàn toàn.
//
// Cổng này đo trực tiếp cái cần chặn: không tệp nào trong repo được chứa dấu xung đột.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());

// Bỏ qua thư mục không phải mã nguồn của repo.
const BO_QUA_THU_MUC = new Set(['.git', 'node_modules', 'coverage', '.specify']);

// Chỉ đọc tệp văn bản repo thật dùng (tránh đọc nhị phân).
const DUOI_VAN_BAN = ['.js', '.mjs', '.cjs', '.json', '.jsonl', '.md', '.yml', '.yaml', '.txt', '.sh'];

// Chính tệp này nói VỀ dấu xung đột nên phải tự loại, nếu không nó tự báo mình.
const TU_LOAI = ['test/core/khong-dau-xung-dot.test.mjs'];

/** Mọi tệp văn bản trong repo, đường dẫn tương đối gốc repo. */
export function tepVanBan() {
  const ra = [];
  const quet = (dir) => {
    for (const ten of readdirSync(dir)) {
      if (BO_QUA_THU_MUC.has(ten)) continue;
      const duong = join(dir, ten);
      if (statSync(duong).isDirectory()) { quet(duong); continue; }
      if (!DUOI_VAN_BAN.some((d) => ten.endsWith(d))) continue;
      const tuongDoi = relative(ROOT, duong).split(sep).join('/');
      if (TU_LOAI.includes(tuongDoi)) continue;
      ra.push(tuongDoi);
    }
  };
  quet(ROOT);
  return ra.sort();
}

/**
 * Dòng mang dấu xung đột git: `<<<<<<< `, `>>>>>>> ` hoặc đúng một dòng `=======`.
 * Dòng `=======` chỉ tính khi đứng MỘT MÌNH — trong Markdown `=====` dưới một câu là
 * cách gạch chân tiêu đề, nhưng bảy dấu `=` trơ trọi thì luôn là dấu xung đột.
 */
export function dongXungDot(noiDung) {
  const ra = [];
  const dong = noiDung.split('\n');
  for (let i = 0; i < dong.length; i++) {
    const d = dong[i];
    if (/^<{7}(\s|$)/.test(d) || /^>{7}(\s|$)/.test(d) || /^={7}$/.test(d)) {
      ra.push({ so: i + 1, chu: d.slice(0, 40) });
    }
  }
  return ra;
}

test('repo: không tệp nào chứa dấu xung đột git chưa gỡ', () => {
  const loi = [];
  for (const f of tepVanBan()) {
    const dong = dongXungDot(readFileSync(join(ROOT, f), 'utf8'));
    for (const { so, chu } of dong) loi.push(`${f}:${so} → ${chu}`);
  }
  assert.deepEqual(loi, [],
    'Có dấu xung đột git bị commit vào repo — phải gỡ và giữ đúng một bản nội dung');
});

test('dongXungDot: nhận đúng ba loại dấu, không bắt oan gạch chân Markdown', () => {
  assert.deepEqual(dongXungDot('<<<<<<< ours\na\n=======\nb\n>>>>>>> theirs\n').map((x) => x.so),
    [1, 3, 5]);
  // Gạch chân tiêu đề Markdown (`Tiêu đề` rồi một hàng `=`) không phải dấu xung đột.
  assert.deepEqual(dongXungDot('Tiêu đề\n======\n'), []);
  assert.deepEqual(dongXungDot('Tiêu đề\n==========\n'), []);
  // Chữ thường trong câu có bảy dấu nhỏ hơn thì không tính.
  assert.deepEqual(dongXungDot('so sánh a <<<<<<< b\n'), []);
});
