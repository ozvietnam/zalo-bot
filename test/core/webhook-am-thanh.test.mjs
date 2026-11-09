// test/core/webhook-am-thanh.test.mjs — kiểm thử TDD cho endpoint GET /am-thanh/<băm>.aac (issue #125)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWebhookHandler } from '../../core/webhook.js';

function setup(dataDir) {
  const cfg = {
    mode: 'webhook',
    webhookPath: '/webhook/zalo',
    webhookSecret: 'secret',
    dataDir,
  };
  const server = createServer(createWebhookHandler({
    config: cfg,
    channel: { verifyWebhook: () => true, parse: () => null },
    engine: { process: async () => ({}) },
    store: {},
    health: async () => ({ ok: true }),
  }));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

test('GET /am-thanh/<băm>.aac: trả 200 và Content-Type audio/aac cho tệp hợp lệ', async () => {
  const testDir = join(tmpdir(), 'test-webhook-am-thanh-' + Date.now());
  const amThanhDir = join(testDir, 'am-thanh');
  mkdirSync(amThanhDir, { recursive: true });

  const fakeHash = 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef01';
  const filePath = join(amThanhDir, `${fakeHash}.aac`);
  const fakeContent = Buffer.from('FAKE-AAC-AUDIO-BYTES');
  writeFileSync(filePath, fakeContent);

  const { url, close } = await setup(testDir);
  try {
    const res = await fetch(`${url}/am-thanh/${fakeHash}.aac`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/aac');
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(bytes, fakeContent);
  } finally {
    await close();
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('GET /am-thanh/<băm>.aac: trả 404 cho băm không tồn tại', async () => {
  const testDir = join(tmpdir(), 'test-webhook-404-' + Date.now());
  mkdirSync(join(testDir, 'am-thanh'), { recursive: true });

  const { url, close } = await setup(testDir);
  try {
    const nonExistent = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const res = await fetch(`${url}/am-thanh/${nonExistent}.aac`);
    assert.equal(res.status, 404);
  } finally {
    await close();
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('GET /am-thanh: chống path traversal và không liệt kê thư mục', async () => {
  const testDir = join(tmpdir(), 'test-webhook-traversal-' + Date.now());
  mkdirSync(join(testDir, 'am-thanh'), { recursive: true });
  writeFileSync(join(testDir, 'bi-mat.txt'), 'TOP-SECRET');

  const { url, close } = await setup(testDir);
  try {
    // 1. Thử duyệt thư mục /am-thanh hoặc /am-thanh/
    const rDir1 = await fetch(`${url}/am-thanh`);
    assert.equal(rDir1.status, 404);
    const rDir2 = await fetch(`${url}/am-thanh/`);
    assert.equal(rDir2.status, 404);

    // 2. Thử path traversal với ..
    const rTrav1 = await fetch(`${url}/am-thanh/../bi-mat.txt`);
    assert.equal(rTrav1.status, 404);

    // 3. Tên tệp không phải băm hex hợp lệ
    const rBad1 = await fetch(`${url}/am-thanh/not-a-hash.aac`);
    assert.equal(rBad1.status, 404);

    const rBad2 = await fetch(`${url}/am-thanh/xyz!@#.aac`);
    assert.equal(rBad2.status, 404);
  } finally {
    await close();
    rmSync(testDir, { recursive: true, force: true });
  }
});
