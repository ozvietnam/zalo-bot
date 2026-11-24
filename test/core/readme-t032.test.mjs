import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const GOC = process.cwd();
const readmeContent = readFileSync(resolve(GOC, 'README.md'), 'utf8');
const envExampleContent = readFileSync(resolve(GOC, '.env.example'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(GOC, 'package.json'), 'utf8'));

test('README: yêu cầu phiên bản Node khớp package.json (>= 22.13)', () => {
  assert.match(packageJson.engines?.node || '', />=\s*22\.13/);
  assert.match(readmeContent, /Node\s*(?:>=|\bv?)\s*22\.13/i);
});

test('README: mô tả kiến trúc lõi / gói / kênh và một cửa gửi gate.js, router registry.js', () => {
  assert.match(readmeContent, /core\/gate\.js/);
  assert.match(readmeContent, /core\/registry\.js/);
  assert.match(readmeContent, /lõi/i);
  assert.match(readmeContent, /gói/i);
  assert.match(readmeContent, /kênh/i);
});

test('README: hướng dẫn thêm gói mới trỏ contracts/pack.md', () => {
  assert.match(readmeContent, /contracts\/pack\.md/);
});

test('README: liệt kê đầy đủ 11 lệnh nhân viên', () => {
  const staffCommands = [
    '/tl',
    '/nhan',
    '/tra-bot',
    '/chan',
    '/chan-nhom',
    '/cho',
    '/ho-so',
    '/gan',
    '/go',
    '/ghi',
    '/xoa-du-lieu',
  ];
  for (const cmd of staffCommands) {
    assert.ok(readmeContent.includes(cmd), `README phải có lệnh ${cmd}`);
  }
});

test('README và .env.example: đồng bộ các biến môi trường lõi spec 001', () => {
  const coreEnvVars = [
    'STAFF_USERS',
    'STAFF_CHAT_ID',
    'DATA_DIR',
    'CAP_CHAT_DAY',
    'CAP_GROUP_DAY',
    'CAP_ALL_DAY',
    'BANNED_PATTERNS',
    'SESSION_TTL_MS',
    'HUMAN_IDLE_MS',
    'COMPANY_PHONES',
  ];
  for (const v of coreEnvVars) {
    assert.ok(envExampleContent.includes(v), `.env.example phải có ${v}`);
    assert.ok(readmeContent.includes(v), `README.md phải có biến ${v}`);
  }
});

test('quickstart.md: các tệp và lệnh tham chiếu đều tồn tại', () => {
  const qsPath = resolve(GOC, 'specs/001-nen-tang-chung/quickstart.md');
  assert.ok(existsSync(qsPath), 'specs/001-nen-tang-chung/quickstart.md phải tồn tại');
  const qsContent = readFileSync(qsPath, 'utf8');
  assert.match(qsContent, /npm test/);
  assert.match(qsContent, /npm run eval/);
  assert.match(qsContent, /localhost:3010\/health/);
  assert.match(qsContent, /localhost:3010\/metrics/);
});

test('package.json: scripts.test gom đủ test/core, test/giam-sat, test/gateway, packs và test/test.mjs (OZV-686)', () => {
  const testScript = packageJson.scripts?.test || '';
  for (const glob of [
    'test/core/**/*.test.mjs',
    'test/giam-sat/**/*.test.mjs',
    'test/gateway/**/*.test.mjs',
    'packs/**/*.test.mjs',
    'test/test.mjs',
  ]) {
    assert.ok(testScript.includes(glob), `scripts.test trong package.json phải chứa ${glob}`);
  }
});

test('wiki: goi-nghiep-vu.md và tien-do.md đồng bộ Phương án 1 OZV-1527 tại commit 0057d5c (OZV-2105)', () => {
  const goiNghiepVu = readFileSync(resolve(GOC, 'docs/wiki/goi-nghiep-vu.md'), 'utf8');
  const tienDo = readFileSync(resolve(GOC, 'docs/wiki/tien-do.md'), 'utf8');

  assert.match(goiNghiepVu, /> Cập nhật: 2026-11-24 · commit: 0057d5c/);
  assert.match(goiNghiepVu, /MENU_SO_GIONG_QUYEN/);
  assert.match(goiNghiepVu, /`packs\/hs\/giong-quyen\.js:16`/);
  assert.match(goiNghiepVu, /`packs\/hs\/luong-chu\.js:138`/);
  assert.match(goiNghiepVu, /`packs\/hs\/flow-turn\.js:60`/);
  assert.match(goiNghiepVu, /8471\.80\.10/);
  assert.match(goiNghiepVu, /8517\.62\.43/);
  assert.match(goiNghiepVu, /`packs\/hs\/nhanh-hoi-hang\.js:127`/);
  assert.match(goiNghiepVu, /`packs\/hs\/dien-cho-thieu\.js:171`/);
  assert.match(goiNghiepVu, /`packs\/hs\/can-cu\.js:146-158`/);

  assert.match(tienDo, /> Cập nhật: 2026-11-24 · commit: 0057d5c/);
  assert.match(tienDo, /OZV-1527/);
  assert.match(tienDo, /`eval\/fixtures\/ozv-1527-card-mang-menu-so\.jsonl:1`/);
  assert.match(tienDo, /`eval\/qa-that\/g4-quyen-hoi-lai\.json:1`/);
  assert.match(tienDo, /33\/33/);
  assert.match(tienDo, /10\/10/);
});
