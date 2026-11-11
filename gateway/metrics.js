// Thu thập số liệu vận hành và endpoint /metrics cho Cổng AI Studio (Spec 008, FR-001, US4, SC-003)
// Lưu trữ cửa sổ trượt 1 giờ, đo p95 thời gian chờ, p50/p95 thời gian xử lý tab W, cảnh báo tỉ lệ dự phòng > 30%.

const WINDOW_MS = 60 * 60 * 1000; // 3_600_000 ms (1 giờ)
const FALLBACK_ALERT_THRESHOLD = 0.3; // 30%

/**
 * Tính toán phân vị (Percentile) từ mảng số đã sắp xếp tăng dần.
 * @param {number[]} sorted
 * @param {number} q (0 <= q <= 1)
 * @returns {number}
 */
function calculatePercentile(sorted, q) {
  if (!sorted || sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[idx];
}

/**
 * Kiểm tra xem nguồn xử lý có phải là cơ chế dự phòng (fallback) hay không.
 * @param {string} source
 * @returns {boolean}
 */
function isFallbackSource(source) {
  if (!source) return false;
  return source.startsWith('fallback');
}

/**
 * Khởi tạo bộ thu thập số liệu vận hành cho Gateway AI Studio.
 * @param {object} options
 * @param {object} [options.queueDb]
 * @param {() => Date} [options.now]
 * @param {() => number} [options.getActiveTabs]
 */
export function createGatewayMetricsCollector({
  queueDb = {},
  now = () => new Date(),
  getActiveTabs = null,
} = {}) {
  let records = [];
  let rateLimitEventsTotal = 0;

  /**
   * Dọn dẹp các bản ghi cũ quá 1 giờ khỏi cửa sổ trượt.
   * @param {number} currentTime
   */
  function pruneExpiredRecords(currentTime) {
    const cutoff = currentTime - WINDOW_MS;
    records = records.filter((r) => r.at >= cutoff);
  }

  /**
   * Ghi nhận số liệu của một công việc vừa hoàn thành hoặc xử lý.
   */
  function recordJobMetric({
    kind = 'khach',
    durationMs = 0,
    waitingMs = 0,
    source = 'addon',
    isRateLimited = false,
    timestamp = null,
  } = {}) {
    const currentTime = typeof now === 'function' ? now().getTime() : Date.now();
    const at = timestamp ?? currentTime;

    if (isRateLimited) {
      rateLimitEventsTotal++;
    }

    records.push({
      kind: String(kind || 'khach'),
      durationMs: Number(durationMs) || 0,
      waitingMs: Number(waitingMs) || 0,
      source: String(source || ''),
      isRateLimited: Boolean(isRateLimited),
      at,
    });

    pruneExpiredRecords(currentTime);
  }

  /**
   * Lấy số lượng tab đang hoạt động.
   */
  function resolveActiveTabs() {
    if (typeof getActiveTabs === 'function') {
      return Number(getActiveTabs()) || 0;
    }
    if (typeof queueDb?.getActiveTabs === 'function') {
      return Number(queueDb.getActiveTabs()) || 0;
    }
    if (queueDb && typeof queueDb.db?.prepare === 'function') {
      try {
        const stmt = queueDb.db.prepare(`
          SELECT COUNT(DISTINCT assigned_tab) AS active
          FROM gateway_jobs
          WHERE status = 'leased' AND lease_expires_at > datetime('now') AND assigned_tab IS NOT NULL
        `);
        const row = stmt.get();
        return Number(row?.active) || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  /**
   * Đếm số lượng công việc đang xếp hàng theo loại từ SQLite queueDb.
   */
  function resolveQueuedJobs() {
    const result = { khach: 0, nhanVien: 0, lo: 0 };
    if (!queueDb || typeof queueDb.db?.prepare !== 'function') {
      return result;
    }
    try {
      const stmt = queueDb.db.prepare(`
        SELECT kind, COUNT(*) AS count
        FROM gateway_jobs
        WHERE status = 'queued'
        GROUP BY kind
      `);
      const rows = stmt.all();
      for (const row of rows) {
        if (row.kind === 'khach') {
          result.khach = Number(row.count) || 0;
        } else if (row.kind === 'nhan-vien' || row.kind === 'nhanVien') {
          result.nhanVien = Number(row.count) || 0;
        } else if (row.kind === 'lo') {
          result.lo = Number(row.count) || 0;
        }
      }
    } catch {
      // An toàn khi bảng chưa được tạo hoặc db mock
    }
    return result;
  }

  /**
   * Tổng hợp báo cáo số liệu vận hành theo thời gian thực.
   */
  function getMetricsReport() {
    const currentTime = typeof now === 'function' ? now().getTime() : Date.now();
    pruneExpiredRecords(currentTime);

    const activeTabs = resolveActiveTabs();
    const queuedJobs = resolveQueuedJobs();

    // Tính waitingTimeP95 từ tất cả các bản ghi trong cửa sổ 1 giờ
    const waitingList = records.map((r) => r.waitingMs).sort((a, b) => a - b);
    const waitingTimeP95 = calculatePercentile(waitingList, 0.95);

    // processingTimeW chỉ tính trên các lượt xử lý addon (không phải fallback)
    const wList = records
      .filter((r) => !isFallbackSource(r.source))
      .map((r) => r.durationMs)
      .sort((a, b) => a - b);
    const processingTimeW = {
      p50: calculatePercentile(wList, 0.50),
      p95: calculatePercentile(wList, 0.95),
    };

    // fallbackRate1h và cảnh báo khi > 30%
    const total = records.length;
    let fallbackRate1h = 0;
    let alertHighFallback = false;

    if (total > 0) {
      const fallbackCount = records.filter((r) => isFallbackSource(r.source)).length;
      fallbackRate1h = Math.round((fallbackCount / total) * 10000) / 10000;
      alertHighFallback = fallbackRate1h > FALLBACK_ALERT_THRESHOLD;
    }

    return {
      activeTabs,
      queuedJobs,
      waitingTimeP95,
      processingTimeW,
      rateLimitCount: rateLimitEventsTotal,
      fallbackRate1h,
      alertHighFallback,
    };
  }

  /**
   * Xuất báo cáo định dạng chuẩn văn bản Prometheus text format.
   * @returns {string}
   */
  function toPrometheusFormat() {
    const report = getMetricsReport();
    const waitingP95Sec = Number((report.waitingTimeP95 / 1000).toFixed(3));
    const wP50Sec = Number((report.processingTimeW.p50 / 1000).toFixed(3));
    const wP95Sec = Number((report.processingTimeW.p95 / 1000).toFixed(3));

    const lines = [
      '# HELP active_tabs Number of active Chrome tabs',
      '# TYPE active_tabs gauge',
      `active_tabs ${report.activeTabs}`,
      '',
      '# HELP queued_jobs Number of queued jobs by kind',
      '# TYPE queued_jobs gauge',
      `queued_jobs{kind="khach"} ${report.queuedJobs.khach}`,
      `queued_jobs{kind="nhan-vien"} ${report.queuedJobs.nhanVien}`,
      `queued_jobs{kind="lo"} ${report.queuedJobs.lo}`,
      '',
      '# HELP waiting_time_p95_seconds p95 queue waiting time in seconds',
      '# TYPE waiting_time_p95_seconds gauge',
      `waiting_time_p95_seconds ${waitingP95Sec}`,
      '',
      '# HELP w_processing_time_p50_seconds p50 processing time W in seconds',
      '# TYPE w_processing_time_p50_seconds gauge',
      `w_processing_time_p50_seconds ${wP50Sec}`,
      '',
      '# HELP w_processing_time_p95_seconds p95 processing time W in seconds',
      '# TYPE w_processing_time_p95_seconds gauge',
      `w_processing_time_p95_seconds ${wP95Sec}`,
      '',
      '# HELP rate_limit_events_total Total rate limit events encountered',
      '# TYPE rate_limit_events_total counter',
      `rate_limit_events_total ${report.rateLimitCount}`,
      '',
      '# HELP fallback_rate 1-hour fallback rate to backup API',
      '# TYPE fallback_rate gauge',
      `fallback_rate ${report.fallbackRate1h}`,
      '',
    ];

    return lines.join('\n');
  }

  return {
    recordJobMetric,
    getMetricsReport,
    toPrometheusFormat,
  };
}
