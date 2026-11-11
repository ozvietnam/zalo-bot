import test from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayMetricsCollector } from '../../gateway/metrics.js';
import { createQueueDb } from '../../gateway/queue-db.js';

test('T811: getMetricsReport tính toán chính xác p95, W và cảnh báo khi fallback > 30%', () => {
  const metrics = createGatewayMetricsCollector({ queueDb: {} });

  // Ghi nhận 10 lượt: 4 lượt fallback, 6 lượt addon (fallback rate = 40% > 30%)
  for (let i = 0; i < 6; i++) {
    metrics.recordJobMetric({ kind: 'khach', durationMs: 20000, waitingMs: 2000, source: 'addon' });
  }
  for (let i = 0; i < 4; i++) {
    metrics.recordJobMetric({ kind: 'khach', durationMs: 46000, waitingMs: 45000, source: 'fallback_gemini' });
  }

  const report = metrics.getMetricsReport();
  assert.equal(report.fallbackRate1h, 0.4);
  assert.equal(report.alertHighFallback, true, 'Phải kích hoạt cảnh báo khi tỉ lệ fallback > 30%');
  assert.ok(report.processingTimeW.p50 > 0);
  assert.ok(report.waitingTimeP95 > 0);
});

test('T811: cảnh báo không kích hoạt khi tỉ lệ fallback <= 30%', () => {
  const metrics = createGatewayMetricsCollector({ queueDb: {} });

  // 2 fallback, 8 addon => 20% fallback <= 30%
  for (let i = 0; i < 8; i++) {
    metrics.recordJobMetric({ kind: 'khach', durationMs: 15000, waitingMs: 1000, source: 'addon' });
  }
  for (let i = 0; i < 2; i++) {
    metrics.recordJobMetric({ kind: 'khach', durationMs: 45000, waitingMs: 40000, source: 'fallback_gemini' });
  }

  const report = metrics.getMetricsReport();
  assert.equal(report.fallbackRate1h, 0.2);
  assert.equal(report.alertHighFallback, false, 'Không kích hoạt cảnh báo khi tỉ lệ fallback <= 30%');
});

test('T811: cửa sổ trượt 1 giờ loại bỏ các bản ghi cũ quá 60 phút', () => {
  let currentTime = 1_000_000_000;
  const metrics = createGatewayMetricsCollector({
    queueDb: {},
    now: () => new Date(currentTime)
  });

  // Ghi nhận 4 lượt fallback tại thời điểm ban đầu
  for (let i = 0; i < 4; i++) {
    metrics.recordJobMetric({ kind: 'khach', durationMs: 40000, waitingMs: 30000, source: 'fallback_minimax' });
  }

  let report = metrics.getMetricsReport();
  assert.equal(report.fallbackRate1h, 1.0);
  assert.equal(report.alertHighFallback, true);

  // Thời gian trôi qua 60 phút + 1 giây (3601 giây)
  currentTime += 3_601_000;

  report = metrics.getMetricsReport();
  assert.equal(report.fallbackRate1h, 0, 'Dữ liệu quá 1 giờ phải bị loại khỏi cửa sổ trượt');
  assert.equal(report.alertHighFallback, false);
  assert.equal(report.waitingTimeP95, 0);
  assert.equal(report.processingTimeW.p50, 0);
  assert.equal(report.processingTimeW.p95, 0);
});

test('T811: processingTimeW chỉ tính trên các lượt addon, loại trừ các lượt fallback', () => {
  const metrics = createGatewayMetricsCollector({ queueDb: {} });

  // 3 lượt addon với durationMs khác nhau
  metrics.recordJobMetric({ kind: 'khach', durationMs: 10000, waitingMs: 500, source: 'addon' });
  metrics.recordJobMetric({ kind: 'khach', durationMs: 20000, waitingMs: 600, source: 'addon' });
  metrics.recordJobMetric({ kind: 'khach', durationMs: 30000, waitingMs: 700, source: 'addon' });

  // 2 lượt fallback với durationMs rất cao
  metrics.recordJobMetric({ kind: 'khach', durationMs: 80000, waitingMs: 45000, source: 'fallback_gemini' });
  metrics.recordJobMetric({ kind: 'khach', durationMs: 90000, waitingMs: 46000, source: 'fallback_minimax' });

  const report = metrics.getMetricsReport();
  // processingTimeW phải nằm trong khoảng [10000, 30000], không bị kéo lên 80000/90000
  assert.equal(report.processingTimeW.p50, 20000);
  assert.equal(report.processingTimeW.p95, 30000);
  // waitingTimeP95 tính trên tất cả 5 lượt
  assert.ok(report.waitingTimeP95 >= 45000);
});

test('T811: rateLimitCount và isRateLimited được ghi nhận chính xác', () => {
  const metrics = createGatewayMetricsCollector({ queueDb: {} });

  assert.equal(metrics.getMetricsReport().rateLimitCount, 0);

  metrics.recordJobMetric({ kind: 'khach', durationMs: 1000, waitingMs: 100, source: 'addon', isRateLimited: false });
  metrics.recordJobMetric({ kind: 'khach', durationMs: 1000, waitingMs: 100, source: 'addon', isRateLimited: true });
  metrics.recordJobMetric({ kind: 'khach', durationMs: 1000, waitingMs: 100, source: 'addon', isRateLimited: true });

  const report = metrics.getMetricsReport();
  assert.equal(report.rateLimitCount, 2, 'Tổng số lần rate limit phải bằng 2');
});

test('T811: toPrometheusFormat xuất đúng chuỗi chuẩn Prometheus', () => {
  const metrics = createGatewayMetricsCollector({
    queueDb: {},
    getActiveTabs: () => 3
  });

  metrics.recordJobMetric({ kind: 'khach', durationMs: 25000, waitingMs: 2000, source: 'addon', isRateLimited: true });
  metrics.recordJobMetric({ kind: 'khach', durationMs: 45000, waitingMs: 5000, source: 'fallback_gemini' });

  const prom = metrics.toPrometheusFormat();

  assert.match(prom, /# HELP active_tabs/);
  assert.match(prom, /# TYPE active_tabs gauge/);
  assert.match(prom, /active_tabs 3/);

  assert.match(prom, /# HELP queued_jobs/);
  assert.match(prom, /# TYPE queued_jobs gauge/);
  assert.match(prom, /queued_jobs\{kind="khach"\} 0/);
  assert.match(prom, /queued_jobs\{kind="nhan-vien"\} 0/);
  assert.match(prom, /queued_jobs\{kind="lo"\} 0/);

  assert.match(prom, /# HELP waiting_time_p95_seconds/);
  assert.match(prom, /# TYPE waiting_time_p95_seconds gauge/);
  assert.match(prom, /waiting_time_p95_seconds (5|5\.0+)/);

  assert.match(prom, /# HELP w_processing_time_p50_seconds/);
  assert.match(prom, /# TYPE w_processing_time_p50_seconds gauge/);
  assert.match(prom, /w_processing_time_p50_seconds (25|25\.0+)/);

  assert.match(prom, /# HELP w_processing_time_p95_seconds/);
  assert.match(prom, /# TYPE w_processing_time_p95_seconds gauge/);
  assert.match(prom, /w_processing_time_p95_seconds (25|25\.0+)/);

  assert.match(prom, /# HELP rate_limit_events_total/);
  assert.match(prom, /# TYPE rate_limit_events_total counter/);
  assert.match(prom, /rate_limit_events_total 1/);

  assert.match(prom, /# HELP fallback_rate/);
  assert.match(prom, /# TYPE fallback_rate gauge/);
  assert.match(prom, /fallback_rate 0\.5/);
});

test('T811: an toàn khi queueDb là mock rỗng hoặc không có bảng SQLite', () => {
  const metrics = createGatewayMetricsCollector({ queueDb: {} });
  const report = metrics.getMetricsReport();

  assert.deepEqual(report.queuedJobs, { khach: 0, nhanVien: 0, lo: 0 });
  assert.equal(report.activeTabs, 0);
  assert.equal(report.fallbackRate1h, 0);
  assert.equal(report.alertHighFallback, false);
});

test('T811: tích hợp thật với createQueueDb để đếm queuedJobs và activeTabs', () => {
  const queueDb = createQueueDb(':memory:');
  queueDb.init();

  // Tạo các job ở trạng thái 'queued'
  queueDb.createJob({ kind: 'khach', prompt: 'test 1' });
  queueDb.createJob({ kind: 'khach', prompt: 'test 2' });
  queueDb.createJob({ kind: 'nhan-vien', prompt: 'test 3' });
  queueDb.createJob({ kind: 'lo', prompt: 'test 4' });
  queueDb.createJob({ kind: 'lo', prompt: 'test 5' });
  queueDb.createJob({ kind: 'lo', prompt: 'test 6' });

  // Một job được lease cho tab-1
  queueDb.leaseJob('tab-1');

  const metrics = createGatewayMetricsCollector({ queueDb });
  const report = metrics.getMetricsReport();

  // Job ưu tiên cao nhất (khach) đã bị lease 1 job, còn lại 1 khach, 1 nhanVien, 3 lo
  assert.equal(report.queuedJobs.khach, 1);
  assert.equal(report.queuedJobs.nhanVien, 1);
  assert.equal(report.queuedJobs.lo, 3);
  assert.equal(report.activeTabs, 1, 'tab-1 đang có lease còn hạn');

  queueDb.close();
});
