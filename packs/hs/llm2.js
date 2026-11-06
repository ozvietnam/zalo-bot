// packs/hs/llm2.js — khoá dự phòng: gọi một cổng LLM bất kỳ theo chuẩn OpenAI (POST {base}/chat/completions).
// Dùng cho não định tuyến và não biên tập khi Gemini lỗi / quá tải / quá giờ, hoặc khi không có khoá Gemini.
// Cấu hình chung (không gắn với nhà cung cấp nào): LLM2_BASE_URL, LLM2_API_KEY, LLM2_MODEL.
// Chỉ trả dữ liệu, không gửi tin (Hiến chương: chỉ core/gate.js gửi). Không bao giờ ném lỗi: lỗi → null.

/** Kiểu tham số Gemini (OBJECT/STRING/NUMBER/BOOLEAN) → JSON Schema chữ thường mà chuẩn OpenAI dùng. */
export function thuongHoa(s) {
  if (Array.isArray(s)) return s.map(thuongHoa);
  if (s && typeof s === 'object') {
    return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : thuongHoa(v)]));
  }
  return s;
}

/**
 * → { model, chat({ system, user, tools, temperature, maxTokens }) → { text, call: { name, args } | null } | null }
 * tools: danh sách khai báo kiểu Gemini { name, description, parameters } — tự đổi sang khuôn OpenAI, bắt buộc gọi công cụ.
 */
export function createLlm2({ baseUrl, apiKey, model, fetchImpl = fetch, timeoutMs = 20_000, log = console } = {}) {
  if (!baseUrl || !apiKey || !model) return null;
  const url = `${String(baseUrl).trim().replace(/\/+$/, '')}/chat/completions`;

  async function chat({ system, user, tools, temperature, maxTokens } = {}) {
    const body = {
      model,
      messages: [system ? { role: 'system', content: system } : null, { role: 'user', content: String(user ?? '') }].filter(Boolean),
    };
    if (temperature != null) body.temperature = temperature;
    if (maxTokens) body.max_tokens = maxTokens;
    if (tools?.length) {
      body.tools = tools.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: thuongHoa(d.parameters) } }));
      body.tool_choice = 'required';
    }
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { log.error?.(`[duPhong] lỗi ${res.status} (${model})`); return null; }
      const msg = j?.choices?.[0]?.message;
      if (!msg || typeof msg !== 'object') return null;
      const fn = (msg.tool_calls || []).map((t) => t?.function).find((f) => f?.name);
      let call = null;
      if (fn) {
        let args = fn.arguments;
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = null; } }
        call = { name: fn.name, args: args && typeof args === 'object' ? args : null };
      }
      const text = typeof msg.content === 'string' ? msg.content
        : Array.isArray(msg.content) ? msg.content.map((p) => p?.text || '').join('') : '';
      return { text: text.trim(), call };
    } catch (e) {
      log.error?.(`[duPhong] ${e.name === 'TimeoutError' ? `quá ${Math.round(timeoutMs / 1000)} giây` : e.message}`);
      return null;
    }
  }

  return { model, chat };
}
