// Đồ giả dùng chung cho test: kênh, MCP, đồng hồ. Không dùng mạng.

export function fakeChannel({ failOn } = {}) {
  let n = 0;
  const sent = [];
  const voices = [];
  return {
    name: 'fake',
    maxText: 2000,
    sent,
    voices,
    async sendText(chatId, text) {
      n += 1;
      if (failOn && failOn(chatId, text, n)) throw new Error(`fake channel: send failed (#${n})`);
      sent.push({ chatId, text });
    },
    async sendVoice(chatId, voiceUrl) {
      n += 1;
      if (failOn && failOn(chatId, voiceUrl, n)) throw new Error(`fake channel: sendVoice failed (#${n})`);
      voices.push({ chatId, voiceUrl });
    },
    async typing() {},
    async getMe() { return { id: 'bot', name: 'Bot' }; },
    parse(raw) { return raw; },
    verifyWebhook() { return true; },
    capabilities: { typing: true, images: true, groups: true },
  };
}

export function fakeMcp(script = {}) {
  const calls = [];
  const counts = {};
  return {
    calls,
    async callTool(name, args = {}) {
      calls.push({ name, args });
      const fn = script[name];
      if (!fn) throw new Error(`fake mcp: no script for ${name}`);
      counts[name] = (counts[name] || 0) + 1;
      return fn(args, counts[name]);
    },
    async listTools() { return Object.keys(script).map((name) => ({ name })); },
  };
}

const UNIT = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function fakeClock(iso) {
  let t = new Date(iso).getTime();
  return {
    now: () => new Date(t),
    advance(x) {
      if (typeof x === 'number') { t += x; return; }
      const m = /^(\d+)\s*([smhd])$/.exec(String(x));
      if (!m) throw new Error(`fakeClock.advance: bad duration ${x}`);
      t += Number(m[1]) * UNIT[m[2]];
    },
    set(v) { t = new Date(v).getTime(); },
  };
}
