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
