import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('T804: manifest.json tuân thủ Manifest V3 và quyền hạn tối thiểu', () => {
  assert.ok(existsSync('addon/manifest.json'), 'manifest.json phải tồn tại');
  const manifest = JSON.parse(readFileSync('addon/manifest.json', 'utf8'));

  // Chuẩn Manifest V3
  assert.equal(manifest.manifest_version, 3, 'manifest_version phải là 3');
  assert.ok(manifest.name, 'manifest phải có tên');
  assert.ok(manifest.version, 'manifest phải có phiên bản');

  // Quyền hạn tối thiểu theo FR-004
  assert.ok(Array.isArray(manifest.host_permissions), 'host_permissions phải là mảng');
  assert.ok(
    manifest.host_permissions.some((p) => p.includes('aistudio.google.com')),
    'host_permissions phải chứa domain aistudio.google.com'
  );

  // Tuyệt đối không xin quyền toàn mạng
  assert.equal(
    manifest.host_permissions.some((p) => p.includes('*://*/*') || p.includes('<all_urls>')),
    false,
    'Tuyệt đối không được xin quyền toàn mạng (*://*/* hoặc <all_urls>)'
  );
});

test('T804: selectors.json có đầy đủ các trường thiết yếu, metadata và 8 bộ chọn DOM', () => {
  assert.ok(existsSync('addon/selectors.json'), 'selectors.json phải tồn tại');
  const config = JSON.parse(readFileSync('addon/selectors.json', 'utf8'));

  // Metadata phiên bản
  assert.ok(config.version, 'Phải có trường version');
  assert.ok(typeof config.version === 'string', 'version phải là chuỗi');
  assert.ok(config.updated_at, 'Phải có trường updated_at');
  assert.match(config.updated_at, /^\d{4}-\d{2}-\d{2}$/, 'updated_at phải theo định dạng YYYY-MM-DD');

  // Đầy đủ 8 bộ chọn DOM theo specs/008-cong-ai-studio/tasks.md:297-312
  const requiredSelectors = [
    'inputPrompt',
    'systemInstruction',
    'runButton',
    'responseContainer',
    'loadingSpinner',
    'copyButton',
    'rateLimitBanner',
    'loginIndicator'
  ];

  assert.ok(config.selectors, 'Phải có trường selectors');
  for (const selKey of requiredSelectors) {
    const selVal = config.selectors[selKey];
    assert.ok(selVal, `Bộ chọn DOM ${selKey} phải tồn tại`);
    assert.equal(typeof selVal, 'string', `Bộ chọn DOM ${selKey} phải là chuỗi`);
    assert.ok(selVal.trim().length > 0, `Bộ chọn DOM ${selKey} không được rỗng`);
  }
});
