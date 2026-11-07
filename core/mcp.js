// core/mcp.js — MCP client tối giản (Streamable HTTP, JSON-RPC 2.0) cho Cổng OZ: mcp.uythacnhapkhau.com/mcp
// Hạ tầng dùng chung cho MỌI gói: createEngine tiêm vào như `mcp` và bọc audit. Thuộc lõi, không phải gói.
// - initialize → lưu Mcp-Session-Id → notifications/initialized
// - tools/list (cache), tools/call → bóc nội dung text, parse JSON nếu được
// - Phản hồi có thể là application/json hoặc text/event-stream (SSE)

export function createMcpClient({
  url = 'https://mcp.uythacnhapkhau.com/mcp',
  token = '',
  authHeader = 'Authorization',
  fetchImpl = fetch,
  clientName = 'oz-zalo-bot',
  toolsTtlMs = 10 * 60 * 1000,
  log = console,
} = {}) {
  let sessionId = null;
  let initPromise = null;
  let nextId = 1;
  let toolsCache = null;
  let toolsAt = 0;

  function headers() {
    const h = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
    };
    if (token) h[authHeader] = authHeader.toLowerCase() === 'authorization' ? `Bearer ${token}` : token;
    if (sessionId) h['Mcp-Session-Id'] = sessionId;
    return h;
  }

  async function post(body, { timeoutMs = 60000 } = {}) {
    const res = await fetchImpl(url, {
      method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    const sid = res.headers?.get?.('mcp-session-id');
    if (sid) sessionId = sid;
    if (res.status === 202) return null;                      // notification được nhận
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(res.status === 401 || res.status === 403
        ? `MCP từ chối truy cập (HTTP ${res.status}) — kiểm tra OZ_MCP_TOKEN`
        : `MCP lỗi HTTP ${res.status}`);
      err.status = res.status;
      err.body = text.slice(0, 300);
      throw err;
    }
    const ct = res.headers?.get?.('content-type') || '';
    return ct.includes('text/event-stream') ? parseSse(text, body.id) : JSON.parse(text || 'null');
  }

  async function rpc(method, params, opts) {
    const id = nextId++;
    let msg;
    try {
      msg = await post({ jsonrpc: '2.0', id, method, params }, opts);
    } catch (e) {
      // Phiên hết hạn → khởi tạo lại một lần
      if ((e.status === 404 || e.status === 400) && method !== 'initialize' && sessionId) {
        sessionId = null; initPromise = null;
        await init();
        msg = await post({ jsonrpc: '2.0', id: nextId++, method, params }, opts);
      } else throw e;
    }
    if (msg?.error) {
      const err = new Error(`MCP ${method}: ${msg.error.message || 'lỗi'}`);
      err.code = msg.error.code;
      throw err;
    }
    return msg?.result;
  }

  function init() {
    if (!initPromise) {
      initPromise = (async () => {
        const r = await rpc('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: clientName, version: '2.0.0' },
        }, { timeoutMs: 20000 });
        try { await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { timeoutMs: 10000 }); } catch { /* không bắt buộc */ }
        log.info?.(`[mcp] kết nối ${r?.serverInfo?.name || 'MCP'} ${r?.serverInfo?.version || ''}`.trim());
        return r;
      })().catch((e) => { initPromise = null; throw e; });
    }
    return initPromise;
  }

  async function listTools(force = false) {
    if (!force && toolsCache && Date.now() - toolsAt < toolsTtlMs) return toolsCache;
    await init();
    const all = [];
    let cursor;
    do {
      const r = await rpc('tools/list', cursor ? { cursor } : {}, { timeoutMs: 20000 });
      all.push(...(r?.tools || []));
      cursor = r?.nextCursor;
    } while (cursor);
    toolsCache = all;
    toolsAt = Date.now();
    return all;
  }

  /** Gọi công cụ → { ok, data, raw, isError, thongBao, ... } (đã parse JSON nếu nội dung là JSON). */
  async function callTool(name, args = {}, { timeoutMs = 150000 } = {}) {
    await init();
    const r = await rpc('tools/call', { name, arguments: args }, { timeoutMs });
    return unwrapToolResult(r);
  }

  return { init, listTools, callTool, get sessionId() { return sessionId; } };
}

/** Lấy JSON-RPC message có id khớp từ thân SSE. */
export function parseSse(text, id) {
  let last = null;
  for (const block of String(text).split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (!data) continue;
    try {
      const m = JSON.parse(data);
      if (id == null || m.id === id) last = m;
    } catch { /* bỏ qua dòng không phải JSON */ }
  }
  return last;
}

export function unwrapToolResult(r) {
  if (!r) return { ok: false, thongBao: 'MCP không trả kết quả' };
  if (r.structuredContent && typeof r.structuredContent === 'object') {
    return { ...r.structuredContent, isError: Boolean(r.isError), ok: r.structuredContent.ok ?? !r.isError };
  }
  const text = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* chữ thường */ }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...parsed, isError: Boolean(r.isError), ok: parsed.ok ?? !r.isError };
  }
  return { ok: !r.isError, isError: Boolean(r.isError), text, data: parsed ?? null };
}
