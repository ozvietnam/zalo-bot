// Test module đọc số đo sức khoẻ Cổng OZ — spec 007 (T710, US5, FR-009)
import test from 'node:test';
import assert from 'node:assert/strict';
import { docMetricsCongOz } from '../../scripts/giam-sat/cong-oz.js';

test('T710: Phát hiện TOOL-SLOW khi p95 của công cụ Cổng OZ vượt 30s (Prometheus text)', async () => {
  const fakeMetrics = [
    '# HELP tool_latency_p95 Latency p95 in seconds',
    '# TYPE tool_latency_p95 gauge',
    'tool_latency_p95{tool="tra_thue"} 35.2',
    'tool_latency_p95{tool="tim_hs"} 1.4',
    'tool_calls_total{tool="tra_thue"} 100',
    'tool_calls_total{tool="tim_hs"} 250',
  ].join('\n');

  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/plain' },
    text: async () => fakeMetrics,
  });

  const res = await docMetricsCongOz('http://fake-gateway:8080/metrics', { fetcher: fakeFetch });

  assert.ok(res.toolStats, 'Phải có trường toolStats');
  assert.equal(res.toolStats.tra_thue.p95, 35.2);
  assert.equal(res.toolStats.tim_hs.p95, 1.4);

  assert.equal(res.phatHienSlow.length, 1, 'Chỉ có 1 tool p95 > 30s');
  const ph = res.phatHienSlow[0];
  assert.equal(ph.ma, 'TOOL-SLOW');
  assert.equal(ph.cheDo, 'tra_thue');
  assert.equal(ph.fingerprint, 'TOOL-SLOW:tra_thue');
  assert.equal(ph.repo, 'ozplugin');
  assert.ok(ph.soDo.includes('35.2') || ph.soDo.includes('35'));
  assert.ok(ph.moTa.includes('tra_thue'));
  assert.ok(Array.isArray(ph.bangChung));
});

test('T710: Hỗ trợ tiền tố oz_tool_duration_seconds_p95 và tính errRate trong Prometheus text', async () => {
  const fakeMetrics = [
    'oz_tool_duration_seconds_p95{tool="tra_cuu_bieu_thue"} 32.5',
    'oz_tool_calls_total{tool="tra_cuu_bieu_thue",status="ok"} 80',
    'oz_tool_calls_total{tool="tra_cuu_bieu_thue",status="error"} 20',
  ].join('\n');

  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/plain' },
    text: async () => fakeMetrics,
  });

  const res = await docMetricsCongOz('http://fake-gateway:8080/metrics', { fetcher: fakeFetch });
  assert.equal(res.phatHienSlow.length, 1);
  assert.equal(res.phatHienSlow[0].cheDo, 'tra_cuu_bieu_thue');
  assert.equal(res.phatHienSlow[0].fingerprint, 'TOOL-SLOW:tra_cuu_bieu_thue');
  assert.equal(res.toolStats.tra_cuu_bieu_thue.total, 100);
  assert.equal(res.toolStats.tra_cuu_bieu_thue.errRate, 0.2);
});

test('T710: Khi p95 <= 30s thì không phát hiện TOOL-SLOW (Prometheus text)', async () => {
  const fakeMetrics = [
    'tool_latency_p95{tool="tra_thue"} 29.8',
    'tool_calls_total{tool="tra_thue"} 50',
  ].join('\n');

  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/plain' },
    text: async () => fakeMetrics,
  });

  const res = await docMetricsCongOz('http://fake-gateway:8080/metrics', { fetcher: fakeFetch });
  assert.equal(res.phatHienSlow.length, 0, 'p95 <= 30s không được coi là TOOL-SLOW');
  assert.equal(res.toolStats.tra_thue.p95, 29.8);
});

test('T710: Hỗ trợ định dạng JSON metrics ({ tools: { [name]: { p95_ms, ... } } })', async () => {
  const jsonData = {
    tools: {
      kiem_tra_chinh_sach: {
        p95_ms: 36000,
        error_rate: 0.05,
        total: 200,
      },
      tinh_thue: {
        p95_ms: 500,
        error_rate: 0,
        total: 1500,
      },
    },
  };

  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(jsonData),
  });

  const res = await docMetricsCongOz('http://fake-gateway:8080/metrics.json', { fetcher: fakeFetch });
  assert.equal(res.phatHienSlow.length, 1);
  assert.equal(res.phatHienSlow[0].ma, 'TOOL-SLOW');
  assert.equal(res.phatHienSlow[0].cheDo, 'kiem_tra_chinh_sach');
  assert.equal(res.phatHienSlow[0].fingerprint, 'TOOL-SLOW:kiem_tra_chinh_sach');
  assert.equal(res.toolStats.kiem_tra_chinh_sach.p95, 36);
  assert.equal(res.toolStats.tinh_thue.p95, 0.5);
});

test('T710: Hỗ trợ định dạng JSON tools mảng hoặc p95 đơn vị giây', async () => {
  const jsonData = {
    tools: [
      { name: 'tra_bieu_thue', p95: 42.1, total: 30 },
      { name: 'phan_loai', p95: 2.0, total: 100 },
    ],
  };

  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(jsonData),
  });

  const res = await docMetricsCongOz('http://fake-gateway:8080/metrics.json', { fetcher: fakeFetch });
  assert.equal(res.phatHienSlow.length, 1);
  assert.equal(res.phatHienSlow[0].cheDo, 'tra_bieu_thue');
});

test('T710: An toàn khi không có metricsUrl, URL trống, hoặc falsy', async () => {
  const res1 = await docMetricsCongOz('');
  assert.deepEqual(res1, { toolStats: {}, phatHienSlow: [] });

  const res2 = await docMetricsCongOz(null);
  assert.deepEqual(res2, { toolStats: {}, phatHienSlow: [] });

  const res3 = await docMetricsCongOz(undefined);
  assert.deepEqual(res3, { toolStats: {}, phatHienSlow: [] });
});

test('T710: An toàn khi fetcher ném lỗi mạng hoặc timeout (không làm gãy luồng)', async () => {
  const failFetch = async () => {
    throw new Error('ECONNREFUSED connect fake-gateway:8080');
  };

  const res = await docMetricsCongOz('http://fake-gateway:8080/metrics', { fetcher: failFetch });
  assert.deepEqual(res, { toolStats: {}, phatHienSlow: [] });
});

test('T710: An toàn khi gateway trả HTTP status 500 hoặc nội dung không hợp lệ', async () => {
  const errFetch = async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: async () => 'Internal Server Error',
  });

  const res = await docMetricsCongOz('http://fake-gateway:8080/metrics', { fetcher: errFetch });
  assert.deepEqual(res, { toolStats: {}, phatHienSlow: [] });
});
