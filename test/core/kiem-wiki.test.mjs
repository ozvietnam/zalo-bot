// Test cho cổng kiểm tra wiki (scripts/kiem-wiki.mjs) — kiểm tra phát hiện lệch SC (LECH_SC)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = resolve(process.cwd());
const SCRIPT = join(ROOT, 'scripts', 'kiem-wiki.mjs');

function chayKiemWiki(cwd, args = []) {
  return new Promise((resolveP) => {
    execFile(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolveP({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

function taoMoiTruongGia() {
  const tmp = mkdtempSync(join(tmpdir(), 'wiki-test-'));
  mkdirSync(join(tmp, 'docs/wiki'), { recursive: true });
  mkdirSync(join(tmp, 'specs/001-nen-tang-chung'), { recursive: true });
  mkdirSync(join(tmp, 'core'), { recursive: true });

  writeFileSync(join(tmp, 'core/gate.js'), '// gate.js\n');
  writeFileSync(join(tmp, 'docs/wiki/index.md'), '# Mục lục\n\n- [Tiến độ](tien-do.md)\n');
  writeFileSync(
    join(tmp, 'specs/001-nen-tang-chung/sc-do.md'),
    '# SC\n\n> Cập nhật: 2026-11-09 · commit: 5528796 · Trạng thái: 6/9 Đạt trọn vẹn trong lab, 3/9 Đạt về code (chờ nghiệm thu chạy thật)\n'
  );

  return tmp;
}

test('kiem-wiki: ca khớp số liệu SC giữa tien-do.md và sc-do.md → ĐẠT (exit 0)', async () => {
  const tmp = taoMoiTruongGia();
  try {
    writeFileSync(
      join(tmp, 'docs/wiki/tien-do.md'),
      `# Tiến độ\n\n> Cập nhật: 2026-11-09 · commit: c4d099d\n\n` +
      `Trích dẫn: \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\`\n\n` +
      `- **6/9 Đạt trọn vẹn trong lab**\n` +
      `- **3/9 Đạt về code**\n`
    );

    const r = await chayKiemWiki(tmp, ['--nghiem']);
    assert.equal(r.code, 0, `Mong đợi exit 0 nhưng nhận code ${r.code}:\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes('wiki: ĐẠT'), `Phải có thông báo "wiki: ĐẠT":\n${r.stdout}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('kiem-wiki: ca tien-do.md ghi 5/9 lệch sc-do.md (6/9) → CHƯA ĐẠT với mã LECH_SC (exit 1)', async () => {
  const tmp = taoMoiTruongGia();
  try {
    writeFileSync(
      join(tmp, 'docs/wiki/tien-do.md'),
      `# Tiến độ\n\n> Cập nhật: 2026-11-09 · commit: c4d099d\n\n` +
      `Trích dẫn: \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\`\n\n` +
      `- **5/9 đạt trọn vẹn trong môi trường lab**\n` +
      `- **4/9 đạt về code**\n`
    );

    const r = await chayKiemWiki(tmp, ['--nghiem']);
    assert.equal(r.code, 1, `Mong đợi exit 1 khi lệch SC nhưng nhận code ${r.code}:\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes('LECH_SC'), `Thông báo lỗi phải có mã LECH_SC:\n${r.stdout}`);
    assert.ok(r.stdout.includes('chép lại từ sc-do.md'), `Thông báo lỗi phải có hướng dẫn cách sửa:\n${r.stdout}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('kiem-wiki: không có sc-do.md thì bỏ qua kiểm tra LECH_SC', async () => {
  const tmp = taoMoiTruongGia();
  try {
    rmSync(join(tmp, 'specs/001-nen-tang-chung/sc-do.md'), { force: true });
    writeFileSync(
      join(tmp, 'docs/wiki/tien-do.md'),
      `# Tiến độ\n\n> Cập nhật: 2026-11-09 · commit: c4d099d\n\n` +
      `Trích dẫn: \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\` \`core/gate.js:1\`\n\n` +
      `- **5/9 đạt trọn vẹn trong môi trường lab**\n` +
      `- **4/9 đạt về code**\n`
    );

    const r = await chayKiemWiki(tmp, ['--nghiem']);
    assert.equal(r.code, 0, `Không có sc-do.md thì bỏ qua LECH_SC và exit 0:\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes('wiki: ĐẠT'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
