// scripts/giam-sat/cong-oz.js
// Module thu thập số đo sức khoẻ Cổng OZ — spec 007 (T710, US5, FR-009)
// Đọc số đo từ endpoint /metrics qua HTTP (Prometheus text hoặc JSON),
// phát hiện công cụ có p95 > 30s để mở issue về repo ozplugin.

const NGUONG_SLOW_SECONDS = 30;

/**
 * Trích xuất nhãn từ chuỗi nhãn Prometheus {key="value",...}
 * @param {string} labelStr
 * @returns {Record<string, string>}
 */
function parseLabels(labelStr) {
  const labels = {};
  if (!labelStr) return labels;
  const re = /([a-zA-Z_0-9]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(labelStr)) !== null) {
    labels[match[1]] = match[2];
  }
  return labels;
}

/**
 * Phân tích nội dung định dạng Prometheus text format
 * @param {string} text
 * @returns {Record<string, { p95: number, total?: number, errRate?: number }>}
 */
function parsePrometheusText(text) {
  const tools = {};
  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const m = line.match(/^([a-zA-Z_0-9]+)\{(.+?)\}\s+([0-9.eE+-]+)/);
    if (!m) continue;

    const [, metricName, labelStr, valStr] = m;
    const val = parseFloat(valStr);
    if (Number.isNaN(val)) continue;

    const labels = parseLabels(labelStr);
    const tool = labels.tool || labels.name || labels.tool_name;
    if (!tool) continue;

    if (!tools[tool]) {
      tools[tool] = { p95: 0, okCalls: 0, errCalls: 0, totalCalls: 0 };
    }

    const t = tools[tool];
    // Nhận diện metric độ trễ p95
    if (metricName.includes('p95') && (metricName.includes('latency') || metricName.includes('duration'))) {
      const isMs = metricName.includes('_ms') || val > 1000;
      t.p95 = isMs ? val / 1000 : val;
    }

    // Nhận diện metric tổng số lượt gọi và lỗi
    if (metricName.includes('calls_total') || metricName.includes('tool_calls')) {
      const status = labels.status;
      if (status === 'error' || status === 'err') {
        t.errCalls += val;
      } else if (status === 'ok') {
        t.okCalls += val;
      } else {
        t.totalCalls += val;
      }
    }
  }

  const result = {};
  for (const [tool, st] of Object.entries(tools)) {
    const total = (st.okCalls + st.errCalls) > 0 ? (st.okCalls + st.errCalls) : st.totalCalls;
    const errRate = total > 0 ? (st.errCalls / total) : 0;
    result[tool] = {
      p95: Number(st.p95.toFixed(2)),
      ...(total > 0 ? { total } : {}),
      ...(st.errCalls > 0 || st.okCalls > 0 ? { errRate: Number(errRate.toFixed(4)) } : {}),
    };
  }

  return result;
}

/**
 * Phân tích nội dung metrics định dạng JSON
 * @param {object} json
 * @returns {Record<string, { p95: number, total?: number, errRate?: number }>}
 */
function parseJsonMetrics(json) {
  const result = {};
  if (!json || typeof json !== 'object') return result;

  let list = [];
  if (Array.isArray(json.tools)) {
    list = json.tools;
  } else if (json.tools && typeof json.tools === 'object') {
    list = Object.entries(json.tools).map(([name, data]) => ({ name, ...data }));
  } else {
    list = Object.entries(json).map(([name, data]) => ({ name, ...(typeof data === 'object' ? data : {}) }));
  }

  for (const item of list) {
    if (!item || !item.name) continue;
    let p95 = 0;
    if (typeof item.p95_ms === 'number') {
      p95 = item.p95_ms / 1000;
    } else if (typeof item.p95 === 'number') {
      p95 = item.p95 > 1000 ? item.p95 / 1000 : item.p95;
    }

    const total = item.total ?? item.calls ?? item.total_calls;
    const errRate = item.error_rate ?? item.errRate ?? item.err_rate;

    result[item.name] = {
      p95: Number(p95.toFixed(2)),
      ...(total !== undefined ? { total: Number(total) } : {}),
      ...(errRate !== undefined ? { errRate: Number(errRate) } : {}),
    };
  }

  return result;
}

/**
 * Đọc số đo sức khoẻ Cổng OZ từ URL metrics (HTTP GET),
 * an toàn khi URL trống hoặc gặp lỗi mạng (FR-009, Hiến pháp VII).
 *
 * @param {string|null|undefined} metricsUrl URL endpoint /metrics của Cổng OZ
 * @param {object} [opts]
 * @param {Function} [opts.fetcher=globalThis.fetch] Hàm fetch
 * @param {number} [opts.timeoutMs=5000] Thời gian chờ tối đa
 * @returns {Promise<{ toolStats: Record<string, { p95: number, total?: number, errRate?: number }>, phatHienSlow: Array }>}
 */
export async function docMetricsCongOz(metricsUrl, { fetcher = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const emptyRes = { toolStats: {}, phatHienSlow: [] };
  if (!metricsUrl || typeof metricsUrl !== 'string' || !metricsUrl.trim()) {
    return emptyRes;
  }

  let text = '';
  try {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
    const res = await fetcher(metricsUrl.trim(), { signal });
    if (!res || !res.ok) {
      console.warn(`[Cổng OZ metrics] HTTP ${res?.status || 'lỗi'} từ ${metricsUrl}`);
      return emptyRes;
    }
    text = await res.text();
  } catch (err) {
    console.warn(`[Cổng OZ metrics] Lỗi kết nối tới endpoint: ${err.message}`);
    return emptyRes;
  }

  let toolStats = {};
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      toolStats = parseJsonMetrics(parsed);
    } catch {
      toolStats = parsePrometheusText(text);
    }
  } else {
    toolStats = parsePrometheusText(text);
  }

  const phatHienSlow = [];
  for (const [toolName, stat] of Object.entries(toolStats)) {
    if (stat.p95 > NGUONG_SLOW_SECONDS) {
      const callsDesc = stat.total ? `${stat.total} lượt` : 'Cổng OZ';
      phatHienSlow.push({
        ma: 'TOOL-SLOW',
        cheDo: toolName,
        fingerprint: `TOOL-SLOW:${toolName}`,
        repo: 'ozplugin',
        soDo: `p95 ${stat.p95}s > ${NGUONG_SLOW_SECONDS}s (${callsDesc})`,
        moTa: `Công cụ ${toolName} Cổng OZ phản hồi chậm (p95 > 30s)`,
        bangChung: [
          `tool: ${toolName}`,
          `p95: ${stat.p95}s`,
          ...(stat.total !== undefined ? [`calls: ${stat.total}`] : []),
          ...(stat.errRate !== undefined ? [`error_rate: ${stat.errRate}`] : []),
        ],
      });
    }
  }

  return { toolStats, phatHienSlow };
}
