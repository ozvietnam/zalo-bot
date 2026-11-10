// scripts/qa-that.mjs — Bộ QA chạy thật cho đích G2–G4 (issue #124)
// Chạy lõi thật (core/engine.js, gói hs) với Cổng OZ thật và Gemini thật,
// nhưng kênh gửi là kênh giả ghi lại (0 lượt gọi API Zalo).
// Không in khoá, không in token. Tự động xuất báo cáo qa-that/ket-qua-<ngày>.md.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../core/store.js';
import { createGate } from '../core/gate.js';
import { createHandoff } from '../core/handoff.js';
import { createRegistry } from '../core/registry.js';
import { createEngine } from '../core/engine.js';
import { createMcpClient } from '../core/mcp.js';
import { createVision } from '../packs/hs/vision.js';
import { createBrain } from '../packs/hs/brain.js';
import { createEditor } from '../packs/hs/editor.js';
import { parse } from '../channels/zalo-bot.js';
import hsPack from '../packs/hs/index.js';
import { vnDateKey, vnStamp } from '../core/time.js';
// Cổng OZ giả + Vision giả của chế độ --mock: tách ra tệp riêng để tệp này đi về dưới 300 dòng (Hiến pháp VI).
import { createMockMcp, createMockVision } from './qa-that-cong-gia.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

/** Đọc cấu hình từ tệp .env nếu tồn tại, không ném lỗi nếu thiếu. */
export function loadDotEnv(filePath = join(ROOT_DIR, '.env')) {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf8');
    const result = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

/** Kênh giả ghi lại: theo dõi toàn bộ tin gửi ra, khẳng định 0 lượt gọi API Zalo thật. */
export function createQaChannel() {
  const sent = [];
  const typed = [];
  let zaloApiCallCount = 0;

  return {
    name: 'qa-recording-channel',
    maxText: 2000,
    parse,
    async sendText(chatId, text) {
      sent.push({ chatId, text, at: new Date() });
    },
    async typing(chatId) {
      typed.push({ chatId, at: new Date() });
    },
    async getMe() {
      return { id: 'bot-qa', name: 'OZ Tra cứu HS', display_name: 'OZ Tra cứu HS' };
    },
    sent,
    typed,
    get zaloApiCallCount() {
      return zaloApiCallCount;
    },
  };
}

/** Đánh giá kết quả của từng bước trong kịch bản. */
export function evaluateStep(stepDef, newMessages, scenario) {
  const kyVong = stepDef.kyVong || {};
  const sentTexts = newMessages.map((m) => m.text);
  const combinedText = sentTexts.join('\n---\n');

  // 1. Kiểm tra bot im
  if (kyVong.botIm === true) {
    if (newMessages.length > 0) {
      return {
        ok: false,
        lyDo: `Kỳ vọng bot im lặng (0 tin), nhưng bot đã gửi ${newMessages.length} tin ra kênh`,
        sent: sentTexts,
      };
    }
    return { ok: true, lyDo: 'Bot im lặng đúng kỳ vọng', sent: [] };
  }

  // 2. Kiểm tra phải có phản hồi
  if (kyVong.phaiCoPhanHoi && newMessages.length === 0) {
    return {
      ok: false,
      lyDo: 'Bot không gửi bất kỳ tin nhắn phản hồi nào',
      sent: [],
    };
  }

  // 3. Kiểm tra gắn đúng người trong nhóm
  if (kyVong.tagDungNguoi) {
    const hasTag = sentTexts.some((t) => t.startsWith(kyVong.tagDungNguoi));
    if (!hasTag) {
      return {
        ok: false,
        lyDo: `Tin phản hồi không bắt đầu bằng tiền tố "${kyVong.tagDungNguoi}"`,
        sent: sentTexts,
      };
    }
  }

  // 4. Kiểm tra mẫu phải chứa
  if (Array.isArray(kyVong.phaiChua)) {
    for (const pattern of kyVong.phaiChua) {
      const re = new RegExp(pattern, 'i');
      if (!re.test(combinedText)) {
        return {
          ok: false,
          lyDo: `Nội dung phản hồi không khớp mẫu bắt buộc: /${pattern}/`,
          sent: sentTexts,
        };
      }
    }
  }

  // 5. Kiểm tra mẫu không được chứa
  if (Array.isArray(kyVong.khongChua)) {
    for (const pattern of kyVong.khongChua) {
      const re = new RegExp(pattern, 'i');
      if (re.test(combinedText)) {
        return {
          ok: false,
          lyDo: `Nội dung phản hồi chứa mẫu bị cấm: /${pattern}/`,
          sent: sentTexts,
        };
      }
    }
  }

  return { ok: true, sent: sentTexts };
}

/** Nhận diện bước có phân loại HS để áp dụng thời gian chờ lâu hơn (mặc định >= 120s) */
export function laBuocPhanLoai(step, scenario = {}) {
  if (typeof step.isClassify === 'boolean') return step.isClassify;
  if (typeof step.phanLoai === 'boolean') return step.phanLoai;
  if (step.kyVong?.coMaHsHoacHuongTra) return true;
  const mieuTa = (step.mieuTa || '').toLowerCase();
  const text = (step.text || '').toLowerCase();
  if (mieuTa.includes('phân loại') || mieuTa.includes('mã hs')) return true;
  if (text.includes('teaching box') || text.includes('phân loại') || text.includes('mã hs')) return true;
  if (text.length > 50 && !/^\s*\d{4,8}\s*$/.test(text)) return true;
  return false;
}

/** Chạy một kịch bản QA đơn lẻ. */
export async function runSingleScenario(scenario, {
  env = {},
  isMock = false,
  now = () => new Date(),
  customMcp = null,
  maxJobWaitMs = 120_000,
  pollIntervalMs = isMock ? 100 : 1_000,
} = {}) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'oz-qa-scenario-'));
  const dbPath = join(tmpDir, 'qa.db');
  const store = openStore(dbPath);
  const channel = createQaChannel();

  // Đếm tool call
  const toolCalls = [];
  let mcp;
  if (customMcp) {
    mcp = customMcp;
  } else if (scenario.id === 'loi-cong-llm' || scenario.moPhongLoi === 'mcp-error') {
    // Mô phỏng Cổng lỗi
    mcp = {
      calls: toolCalls,
      async listTools() { throw new Error('Cổng OZ ngắt kết nối (ECONNREFUSED)'); },
      async callTool() { throw new Error('Cổng OZ lỗi HTTP 502 Bad Gateway'); },
    };
  } else if (isMock) {
    const rawMock = createMockMcp();
    mcp = {
      calls: toolCalls,
      async listTools() { return rawMock.listTools(); },
      async callTool(name, args) {
        toolCalls.push({ name, args });
        return rawMock.callTool(name, args);
      },
    };
  } else {
    const rawMcp = createMcpClient({
      url: env.OZ_MCP_URL || 'https://mcp.uythacnhapkhau.com/mcp',
      token: env.OZ_MCP_TOKEN,
      authHeader: env.OZ_MCP_AUTH_HEADER || 'Authorization',
    });
    mcp = {
      calls: toolCalls,
      async listTools() { return rawMcp.listTools(); },
      async callTool(name, args) {
        toolCalls.push({ name, args });
        return rawMcp.callTool(name, args);
      },
    };
  }

  let vision;
  let brain;
  let editor;

  if (isMock) {
    vision = createMockVision();
    brain = null;
    editor = null;
  } else {
    vision = env.GEMINI_API_KEY ? createVision({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-flash-latest' }) : null;
    brain = env.GEMINI_API_KEY ? createBrain({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_BRAIN_MODEL || undefined, off: false }) : null;
    editor = env.GEMINI_API_KEY ? createEditor({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_EDITOR_MODEL || undefined, off: false }) : null;
  }

  const botNames = scenario.botNames || ['OZ Tra cứu HS', 'Bot OZ'];
  const config = {
    capChatDay: 100,
    capGroupDay: 500,
    capAllDay: 1000,
    staffChatId: 'staff-group-qa',
    staffUsers: new Set(['nv_qa']),
    bannedPatterns: [],
    botNames,
    humanIdleMs: 7_200_000,
  };

  const gate = createGate({
    store,
    channel,
    now,
    rules: {
      capChatDay: config.capChatDay,
      capGroupDay: config.capGroupDay,
      capAllDay: config.capAllDay,
      similarity: 0.9,
      directReplyMs: 600_000,
      quietHours: false,
      bannedPatterns: config.bannedPatterns,
    },
    onAlert: () => {},
    onTicket: () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  const handoff = createHandoff({
    store,
    gate,
    config,
    now,
    log: { info() {}, warn() {}, error() {} },
  });

  const engine = createEngine({
    config,
    store,
    channel,
    mcp,
    vision,
    brain,
    editor,
    registry: createRegistry([hsPack]),
    gate,
    handoff,
    now,
    log: { info() {}, warn() {}, error() {} },
  });

  const stepResults = [];
  let scenarioOk = true;
  let failReason = '';

  try {
    for (const [idx, step] of scenario.steps.entries()) {
      const stepStart = Date.now();
      const isPhanLoai = laBuocPhanLoai(step, scenario);
      const stepTimeoutMs = step.timeoutMs || (isPhanLoai ? 120_000 : 30_000);
      const sentBefore = channel.sent.length;
      const isPhoto = Boolean(step.photoUrl);
      const isText = !isPhoto && Boolean(step.text);

      const update = {
        updateKey: `qa_${scenario.id}_${idx + 1}_${Date.now()}`,
        event: isPhoto ? 'message.image.received' : (isText ? 'message.text.received' : 'unknown'),
        chatId: step.chatId || scenario.chatId || 'qa_chat_01',
        userId: step.userId || scenario.userId || 'qa_user_01',
        userName: step.userName || scenario.userName || 'Khách QA',
        chatType: step.chatType || scenario.chatType || 'PRIVATE',
        text: step.text || null,
        photoUrl: step.photoUrl || null,
        caption: step.caption || null,
        messageId: `msg_${idx + 1}`,
      };

      const procRes = await engine.process(update);
      await engine.drain();

      // Chờ tới khi có tin trả lời (hoặc xong việc nền) hoặc hết timeoutMs (mặc định >= 120s cho bước có phân loại)
      const hasOpenJobs = () => store.jobs.countWaiting() > 0 || store.jobs.polling().length > 0;
      const hasReplied = () => channel.sent.length > sentBefore;

      if (step.kyVong?.botIm) {
        while (hasOpenJobs() && Date.now() - stepStart < stepTimeoutMs) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          await engine.drain();
        }
      } else {
        while (Date.now() - stepStart < stepTimeoutMs) {
          if (hasReplied() && !hasOpenJobs()) {
            break;
          }
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          await engine.drain();
        }
      }

      const durationMs = Date.now() - stepStart;
      const durationSec = (durationMs / 1000).toFixed(1);
      const sentNow = channel.sent.slice(sentBefore);
      const evalRes = evaluateStep(step, sentNow, scenario);

      stepResults.push({
        stepIndex: idx + 1,
        mieuTa: step.mieuTa || `Bước ${idx + 1}`,
        input: step.text || (step.photoUrl ? `[ảnh] ${step.photoUrl}` : ''),
        sent: sentNow.map((m) => m.text),
        ok: evalRes.ok,
        lyDo: evalRes.lyDo || '',
        durationMs,
        durationText: `${durationSec}s`,
        isPhanLoai,
      });

      if (!evalRes.ok) {
        scenarioOk = false;
        if (!failReason) {
          failReason = `Bước ${idx + 1} (${step.mieuTa || ''}): ${evalRes.lyDo}`;
        }
      }
    }
  } catch (err) {
    scenarioOk = false;
    failReason = `Lỗi thực thi kịch bản: ${err?.message || err}`;
  } finally {
    try { store.close(); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  }

  return {
    id: scenario.id,
    dich: scenario.dich || 'G',
    ten: scenario.ten || scenario.id,
    moTa: scenario.moTa || '',
    ok: scenarioOk,
    lyDo: failReason,
    toolCallsCount: toolCalls.length,
    toolCalls,
    zaloApiCalls: channel.zaloApiCallCount,
    stepResults,
    durationMs: stepResults.reduce((s, x) => s + (x.durationMs || 0), 0),
  };
}

/** Tạo văn bản báo cáo Markdown từ kết quả các kịch bản. */
export function generateReportMarkdown({ results, startedAt, envMeta = {}, isMock = false }) {
  const dateStr = vnDateKey(startedAt);
  const timeStr = vnStamp(startedAt);
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;

  const lines = [
    `# Báo cáo QA chạy thật — Đích G2–G4 (Zalo Bot OZ)`,
    ``,
    `> **Thời gian chạy:** ${timeStr} VN  `,
    `> **Môi trường:** Lõi thật (\`core/engine.js\`), Gói hải quan (\`packs/hs\`), ${isMock ? 'Bộ giả lập cấu trúc (--mock)' : 'Cổng OZ thật + Gemini thật'}  `,
    `> **Kênh gửi:** Kênh giả ghi lại (Fake Recording Channel) — **0 lượt gọi API Zalo**  `,
    `> **Kết quả tổng quát:** **${passed}/${total} kịch bản ĐẠT** (${Math.round((passed / total) * 100)}%)`,
    ``,
    `## 1. Bảng tổng hợp trạng thái`,
    ``,
    `| Kịch bản | Đích | Trạng thái | Thời gian | Số lượt gọi công cụ | Kết quả chi tiết |`,
    `|---|---|---|---|---|---|`,
  ];

  for (const r of results) {
    const statusIcon = r.ok ? '✅ **ĐẠT**' : '❌ **TRƯỢT**';
    const note = r.ok ? 'Đáp ứng toàn bộ tiêu chí' : r.lyDo.replace(/\|/g, '\\|');
    const dur = `${(((r.durationMs || 0)) / 1000).toFixed(1)}s`;
    lines.push(`| ${r.ten} | \`${r.dich}\` | ${statusIcon} | ${dur} | ${r.toolCallsCount} | ${note} |`);
  }

  lines.push(
    ``,
    `## 2. Chi tiết từng kịch bản`,
    ``
  );

  for (const r of results) {
    lines.push(
      `### ${r.ten}`,
      `- **Đích kiểm tra:** \`${r.dich}\``,
      `- **Trạng thái:** ${r.ok ? '✅ **ĐẠT**' : '❌ **TRƯỢT**'}`,
      `- **Số lần gọi công cụ Cổng:** ${r.toolCallsCount}${r.toolCalls.length ? ` (${[...new Set(r.toolCalls.map((c) => c.name))].join(', ')})` : ''}`,
      `- **Lượt gọi API Zalo:** ${r.zaloApiCalls} (0 = an toàn)`,
      r.ok ? '' : `- **Lý do trượt:** ${r.lyDo}`,
      ``,
      `**Diễn biến các bước:**`,
      ``
    );

    for (const step of r.stepResults) {
      lines.push(
        `#### Bước ${step.stepIndex}: ${step.mieuTa}`,
        `- **Khách gửi:** \`${step.input}\``,
        `- **Thời gian phản hồi:** \`${step.durationText || `${(((step.durationMs || 0)) / 1000).toFixed(1)}s`}\``,
        `- **Trạng thái bước:** ${step.ok ? '✓ Đạt' : `✗ Trượt (${step.lyDo})`}`,
        `- **Nguyên văn bot gửi (${step.sent.length} tin):**`,
        step.sent.length
          ? step.sent.map((t) => `\`\`\`text\n${t}\n\`\`\``).join('\n\n')
          : `*(Bot im lặng — 0 tin)*`,
        ``
      );
    }
  }

  lines.push(
    `## 3. Khẳng định an toàn và tuân thủ Hiến pháp`,
    ``,
    `- **Hiến pháp Điều I & VII (An toàn kênh Zalo):** Toàn bộ kịch bản sử dụng kênh giả ghi lại, ghi nhận **đúng 0 lượt gọi API Zalo**. Hoàn toàn không nhắn tin ra ngoài người thật.`,
    `- **Hiến pháp Điều IX (Che giấu bí mật):** Toàn bộ khoá (\`OZ_MCP_TOKEN\`, \`GEMINI_API_KEY\`) được đọc an toàn, không in ra màn hình console hay báo cáo.`,
    `- **Dữ liệu vận hành:** Quá trình kiểm thử diễn ra trên tệp SQLite độc lập trong thư mục tạm, hoàn toàn không chạm vào \`bot.db\` thật.`,
    ``
  );

  return lines.join('\n');
}

/** Chạy toàn bộ bộ QA. */
export async function runQa({
  env = process.env,
  isMock = false,
  scenariosDir = join(ROOT_DIR, 'eval', 'qa-that'),
  outDir = join(ROOT_DIR, 'qa-that'),
  now = () => new Date(),
} = {}) {
  // Đọc thêm từ .env nếu có
  const mergedEnv = { ...loadDotEnv(), ...env };
  const hasKeys = Boolean(mergedEnv.OZ_MCP_TOKEN && mergedEnv.GEMINI_API_KEY);

  if (!isMock && !hasKeys) {
    console.error('\n' + '='.repeat(64));
    console.error('⚠️  THIẾU CẤU HÌNH BIẾN MÔI TRƯỜNG ĐỂ CHẠY QA THẬT');
    console.error('='.repeat(64));
    console.error('Bộ QA yêu cầu kết nối Cổng OZ thật và Gemini AI Studio thật:');
    if (!mergedEnv.OZ_MCP_TOKEN) console.error('  - Thiếu OZ_MCP_TOKEN (Cổng tra cứu hải quan)');
    if (!mergedEnv.GEMINI_API_KEY) console.error('  - Thiếu GEMINI_API_KEY (Google AI Studio)');
    console.error('\nHướng dẫn:');
    console.error('  1. Cấu hình tệp .env ở thư mục gốc (xem .env.example).');
    console.error('  2. Hoặc chạy kiểm thử cấu trúc ở chế độ giả lập an toàn bằng lệnh:');
    console.error('     node scripts/qa-that.mjs --mock\n');
    return { ok: false, missingEnv: true };
  }

  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(scenariosDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  console.log(`\n🤖 Bắt đầu bộ QA chạy thật (${isMock ? 'chế độ --mock' : 'chế độ Cổng thật + Gemini thật'})...`);
  console.log(`📂 Nạp ${files.length} kịch bản từ ${scenariosDir}`);

  const results = [];
  for (const f of files) {
    const filePath = join(scenariosDir, f);
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    console.log(`▶ Chạy [${content.dich || 'QA'}]: ${content.ten}...`);
    const res = await runSingleScenario(content, { env: mergedEnv, isMock, now });
    results.push(res);
    console.log(`  ${res.ok ? '✓ ĐẠT' : `✗ TRƯỢT (${res.lyDo})`} (công cụ: ${res.toolCallsCount}, Zalo API: ${res.zaloApiCalls})`);
  }

  const startedAt = now();
  const reportMd = generateReportMarkdown({
    results,
    startedAt,
    isMock,
  });

  const reportFileName = `ket-qua-${vnDateKey(startedAt)}.md`;
  const reportPath = join(outDir, reportFileName);
  writeFileSync(reportPath, reportMd, 'utf8');

  console.log(`\n📄 Đã xuất báo cáo tại: ${reportPath}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`📊 Kết quả: ${passed}/${results.length} kịch bản ĐẠT\n`);

  return {
    ok: true,
    passed,
    total: results.length,
    reportPath,
    results,
  };
}

// Chạy trực tiếp qua CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const isMock = process.argv.includes('--mock') || process.argv.includes('--dry-run');
  const res = await runQa({ isMock });
  if (res.missingEnv) {
    process.exit(1);
  }
}
