// T033: Ghi mọi tin vào messages (US7, spec 001).
// Thi hành FR-024, SC-008 và Global Constraints:
// - Tin khách ghi ở engine.process (speaker:'khach')
// - Tin bot/nhân viên ghi ở gate.send chỉ khi status = 'sent' (speaker:'bot'|'nhan-vien', outbox_id)
// - Tin bị cửa drop/reject tuyệt đối không có trong messages
// - Lệnh nhân viên /tl ghi speaker:'nhan-vien', speaker_id là nhân viên
// - Tin ảnh ghi '[ảnh] <url>' hoặc '[ảnh] <url> <caption>'
// - Số tin trong messages của một phòng bằng đúng số tin khách vào + số tin đã gửi (SC-008)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createHandoff } from '../../core/handoff.js';
import { createEngine } from '../../core/engine.js';
import hsPack from '../../packs/hs/index.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 giờ VN
const STAFF_CHAT = 'staff-chat';
const STAFF_USER = 'staff1';
const silent = { info() {}, warn() {}, error() {} };

function setup({ packs, script = {}, config = {}, rules = {} } = {}) {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  channel.typed = [];
  channel.typing = async (c) => { channel.typed.push(c); };
  const mcp = fakeMcp(script);

  const staffUsers = config.staffUsers ?? new Set([STAFF_USER]);
  const cfg = {
    staffChatId: STAFF_CHAT,
    staffUsers,
    bannedPatterns: [],
    botNames: ['Bot OZ'],
    humanIdleMs: 7_200_000,
    companyPhones: new Set(['0912345678']),
    ...config,
  };

  const gateRules = {
    capChatDay: 100,
    capGroupDay: 500,
    capAllDay: 1000,
    similarity: 0.8,
    directReplyMs: 600_000,
    quietHours: true,
    bannedPatterns: cfg.bannedPatterns,
    ...rules,
  };

  let gate;
  let handoff;
  gate = createGate({
    store,
    channel,
    rules: gateRules,
    now: clock.now,
    onAlert: () => {},
    onTicket: (convId, reason) => handoff?.open(convId, reason).catch(() => {}),
    log: silent,
  });

  handoff = createHandoff({
    store,
    gate,
    config: cfg,
    now: clock.now,
    log: silent,
  });

  const pList = packs ?? [hsPack];
  const registry = createRegistry(pList);
  const engine = createEngine({
    config: cfg,
    store,
    channel,
    mcp,
    vision: null,
    registry,
    gate,
    handoff,
    now: clock.now,
    log: silent,
    advance: (ms) => { if (ms > clock.now().getTime()) clock.set(ms); },
  });

  return { store, clock, channel, gate, handoff, engine, mcp };
}

let seq = 0;
const upd = (text, o = {}) => ({
  updateKey: o.id ?? `upd-${++seq}`,
  event: o.event ?? 'message.text.received',
  chatId: o.chatId ?? 'c1',
  userId: o.userId ?? 'u1',
  userName: o.userName ?? 'Khách Tuấn',
  chatType: o.chatType ?? 'PRIVATE',
  text,
  photoUrl: o.photoUrl ?? null,
  caption: o.caption ?? null,
  messageId: o.id ?? String(seq),
  ...o.extra,
});

/** Gói giả: trả replies tùy ý */
function spyPack(replyFn = (turn, i) => [`Dạ trả lời lượt ${i}: ${turn.text}`]) {
  let count = 0;
  return {
    id: 'spy',
    ten: 'Spy Pack',
    version: '1',
    audience: 'public',
    priority: 50,
    match: () => true,
    async handle(turn, ctx) {
      count++;
      const list = replyFn(turn, count);
      return { replies: list.map((text) => ({ text })), evidence: [] };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Tiêu chí 1: Hội thoại 3 tin khách → bot trả 3 câu → messages.recent
// có đúng 6 bản ghi xen kẽ đúng thứ tự thời gian.
// ═══════════════════════════════════════════════════════════════════════

test('T033: hội thoại 3 tin khách → bot trả 3 câu → messages.recent có 6 dòng xen kẽ đúng thứ tự', async () => {
  const pack = spyPack((turn, i) => [`Câu trả lời ${i} cho: ${turn.text}`]);
  const { store, clock, engine } = setup({ packs: [pack] });

  // Tin 1
  clock.advance('10s');
  await engine.process(upd('Khách hỏi câu 1', { id: 'm1' }));

  // Tin 2
  clock.advance('15s');
  await engine.process(upd('Khách hỏi câu 2', { id: 'm2' }));

  // Tin 3
  clock.advance('20s');
  await engine.process(upd('Khách hỏi câu 3', { id: 'm3' }));

  const recent = store.messages.recent('c1', 10);
  assert.equal(recent.length, 6, 'messages phải có đúng 6 bản ghi');

  // Kiểm tra thứ tự và xen kẽ
  const expectedSpeakers = ['khach', 'bot', 'khach', 'bot', 'khach', 'bot'];
  const actualSpeakers = recent.map((m) => m.speaker);
  assert.deepEqual(actualSpeakers, expectedSpeakers, 'các dòng phải xen kẽ khach và bot');

  // Kiểm tra nội dung từng dòng
  assert.equal(recent[0].text, 'Khách hỏi câu 1');
  assert.equal(recent[0].speaker_id, 'u1');
  assert.equal(recent[0].outbox_id, null);

  assert.equal(recent[1].text, 'Câu trả lời 1 cho: Khách hỏi câu 1');
  assert.equal(recent[1].speaker, 'bot');
  assert.equal(recent[1].speaker_id, null);
  assert.ok(recent[1].outbox_id > 0, 'tin bot phải có outbox_id');

  assert.equal(recent[2].text, 'Khách hỏi câu 2');
  assert.equal(recent[3].text, 'Câu trả lời 2 cho: Khách hỏi câu 2');
  assert.equal(recent[4].text, 'Khách hỏi câu 3');
  assert.equal(recent[5].text, 'Câu trả lời 3 cho: Khách hỏi câu 3');

  // Kiểm tra thứ tự thời gian tăng dần
  for (let i = 1; i < recent.length; i++) {
    const prev = new Date(recent[i - 1].at).getTime();
    const curr = new Date(recent[i].at).getTime();
    assert.ok(curr >= prev, `mốc thời gian dòng ${i} (${recent[i].at}) phải >= dòng ${i - 1} (${recent[i - 1].at})`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Tiêu chí 2: Tin bị cửa drop/reject KHÔNG có trong messages
// ═══════════════════════════════════════════════════════════════════════

test('T033: tin bot bị cửa reject (lộ bí mật giả) KHÔNG có trong messages', async () => {
  // Chuỗi giả ngắn theo quy tắc: Bearer sk-gia-loi-goc
  const pack = spyPack(() => ['Khoá API của tôi là Bearer sk-gia-loi-goc']);
  const { store, engine } = setup({ packs: [pack] });

  const r = await engine.process(upd('Hỏi thông tin hệ thống', { id: 'm-leak' }));
  assert.equal(r.handled, 'spy');

  const recent = store.messages.recent('c1', 10);
  // Tin khách vẫn được ghi, nhưng tin bot bị cửa reject leak nên KHÔNG có trong messages
  assert.equal(recent.length, 1, 'chỉ có tin khách trong messages');
  assert.equal(recent[0].speaker, 'khach');
  assert.equal(recent[0].text, 'Hỏi thông tin hệ thống');
  assert.equal(recent.filter((m) => m.speaker === 'bot').length, 0, 'không có tin bot bị reject');
});

test('T033: tin bot bị cửa reject (đường dẫn nội bộ PATH) KHÔNG có trong messages', async () => {
  const pack = spyPack(() => ['Tệp cấu hình tại /home/oz/config.json']);
  const { store, engine } = setup({ packs: [pack] });

  await engine.process(upd('Xem tệp cấu hình', { id: 'm-path' }));
  const recent = store.messages.recent('c1', 10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].speaker, 'khach');
  assert.equal(recent.filter((m) => m.speaker === 'bot').length, 0);
});

test('T033: tin bot bị cửa reject (tiền bịa không có trong evidence) KHÔNG có trong messages', async () => {
  const pack = {
    id: 'money-pack',
    ten: 'Money Pack',
    version: '1',
    audience: 'public',
    priority: 50,
    moneyCheck: true,
    match: () => true,
    async handle() {
      // Số tiền 50.000.000 không có trong evidence
      return { replies: [{ text: 'Chi phí là 50000000 đồng' }], evidence: [] };
    },
  };
  const { store, engine } = setup({ packs: [pack] });

  await engine.process(upd('Hỏi giá cước', { id: 'm-money' }));
  const recent = store.messages.recent('c1', 10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].speaker, 'khach');
  assert.equal(recent.filter((m) => m.speaker === 'bot').length, 0);
});

test('T033: tin khách chứa số điện thoại mẫu 0912345678 được lưu nguyên văn vào messages', async () => {
  const pack = spyPack(() => ['Dạ đã ghi nhận số điện thoại của bạn']);
  const { store, engine } = setup({ packs: [pack] });

  await engine.process(upd('Số điện thoại em là 0912345678 nhé', { id: 'm-phone' }));
  const recent = store.messages.recent('c1', 10);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].speaker, 'khach');
  assert.equal(recent[0].text, 'Số điện thoại em là 0912345678 nhé');
  assert.equal(recent[1].speaker, 'bot');
});

test('T033: tin bot bị cửa drop (trùng nội dung trong cửa sổ) KHÔNG có trong messages', async () => {
  // Trả về cùng một nội dung liên tiếp
  const pack = spyPack(() => ['Câu trả lời cố định không đổi']);
  const { store, clock, engine } = setup({ packs: [pack] });

  // Lần 1: bot gửi thành công
  await engine.process(upd('Lần 1', { id: 'm-dup-1' }));
  // Lần 2 ngay sau đó (trong 60s): nội dung bot trùng → gate drop 'duplicate-text'
  clock.advance('5s');
  await engine.process(upd('Lần 2', { id: 'm-dup-2' }));

  const recent = store.messages.recent('c1', 10);
  // Có 2 tin khách vào ('Lần 1', 'Lần 2') và chỉ 1 tin bot (lần 1)
  assert.equal(recent.length, 3, 'phải có 2 tin khách + 1 tin bot thành công');
  assert.equal(recent[0].speaker, 'khach');
  assert.equal(recent[0].text, 'Lần 1');
  assert.equal(recent[1].speaker, 'bot');
  assert.equal(recent[1].text, 'Câu trả lời cố định không đổi');
  assert.equal(recent[2].speaker, 'khach');
  assert.equal(recent[2].text, 'Lần 2');

  const botMsgs = recent.filter((m) => m.speaker === 'bot');
  assert.equal(botMsgs.length, 1, 'tin bot bị drop không được xuất hiện trong messages');
});

test('T033: webhook gửi lặp (trùng update_key) bị bỏ qua KHÔNG ghi lặp vào messages', async () => {
  const pack = spyPack((turn) => [`Đã nhận: ${turn.text}`]);
  const { store, engine } = setup({ packs: [pack] });

  // Webhook gửi lần đầu
  await engine.process(upd('Tin cần xử lý', { id: 'webhook-idem-1' }));
  // Zalo gửi lại đúng payload với cùng updateKey
  const r2 = await engine.process(upd('Tin cần xử lý', { id: 'webhook-idem-1' }));
  assert.equal(r2.skipped, 'duplicate');

  const recent = store.messages.recent('c1', 10);
  assert.equal(recent.length, 2, 'chỉ có đúng 1 tin khách và 1 tin bot');
  assert.equal(recent[0].speaker, 'khach');
  assert.equal(recent[1].speaker, 'bot');
});

// ═══════════════════════════════════════════════════════════════════════
// Tiêu chí 3: Lệnh /tl ghi speaker:'nhan-vien', speaker_id là nhân viên
// ═══════════════════════════════════════════════════════════════════════

test('T033: lệnh /tl ghi speaker:nhan-vien, speaker_id là nhân viên kèm outbox_id', async () => {
  const { store, clock, handoff, engine } = setup();

  // Khách nhắn xin gặp người
  await engine.process(upd('cho em gặp nhân viên với ạ', { id: 'khach-1' }));
  assert.equal(handoff.stateOf('c1'), 'human');

  // Nhân viên dùng /tl trả lời khách từ nhóm staff
  clock.advance('30s');
  const staffTurn = {
    turnId: 'staff-turn-1',
    chatId: STAFF_CHAT,
    userId: STAFF_USER,
    userName: 'Chuyên viên CSKH',
    chatType: 'GROUP',
    text: '/tl P1 Chào bạn, mình là nhân viên hỗ trợ OZ.',
  };
  const r = await engine.process(upd(staffTurn.text, {
    id: staffTurn.turnId,
    chatId: staffTurn.chatId,
    userId: staffTurn.userId,
    userName: staffTurn.userName,
    chatType: staffTurn.chatType,
  }));
  assert.equal(r.handled, 'staff-cmd');

  const msgs = store.messages.recent('c1', 10);
  const staffMsg = msgs.find((m) => m.speaker === 'nhan-vien');
  assert.ok(staffMsg, 'phải có tin nhắn với speaker nhan-vien trong phòng c1');
  assert.equal(staffMsg.speaker_id, STAFF_USER, 'speaker_id phải là ID nhân viên');
  assert.equal(staffMsg.text, 'Chào bạn, mình là nhân viên hỗ trợ OZ.');
  assert.ok(staffMsg.outbox_id > 0, 'tin nhân viên chuyển phải có outbox_id');
});

// ═══════════════════════════════════════════════════════════════════════
// Tiêu chí 4: Ảnh ghi [ảnh] <url> (và [ảnh] <url> <caption> nếu có)
// ═══════════════════════════════════════════════════════════════════════

test('T033: tin gửi kèm ảnh ghi đúng [ảnh] <url> khi không có caption', async () => {
  const pack = spyPack(() => ['Đã nhận ảnh của bạn']);
  const { store, engine } = setup({ packs: [pack] });

  await engine.process(upd(null, {
    id: 'photo-1',
    event: 'message.photo.received',
    photoUrl: 'https://cdn.example.com/item123.jpg',
  }));

  const msgs = store.messages.recent('c1', 10);
  const photoMsg = msgs.find((m) => m.speaker === 'khach');
  assert.ok(photoMsg);
  assert.equal(photoMsg.text, '[ảnh] https://cdn.example.com/item123.jpg');
});

test('T033: tin gửi kèm ảnh ghi đúng [ảnh] <url> <caption> khi có caption', async () => {
  const pack = spyPack(() => ['Đã nhận ảnh kèm mô tả']);
  const { store, engine } = setup({ packs: [pack] });

  await engine.process(upd(null, {
    id: 'photo-2',
    event: 'message.image.received',
    photoUrl: 'https://cdn.example.com/item456.png',
    caption: 'Kiểm tra mã HS giúp em mặt hàng này',
  }));

  const msgs = store.messages.recent('c1', 10);
  const photoMsg = msgs.find((m) => m.speaker === 'khach');
  assert.ok(photoMsg);
  assert.equal(photoMsg.text, '[ảnh] https://cdn.example.com/item456.png Kiểm tra mã HS giúp em mặt hàng này');
});

// ═══════════════════════════════════════════════════════════════════════
// Tiêu chí 5: Nhóm chat — phân biệt conv_id theo người
// ═══════════════════════════════════════════════════════════════════════

test('T033: tin trong nhóm lưu đúng conv_id theo từng người (chat_id:user_id)', async () => {
  const pack = spyPack((turn) => [`Xin chào bạn ${turn.userName}`]);
  const { store, clock, engine } = setup({ packs: [pack] });

  // Khách A hỏi trong nhóm G1
  await engine.process(upd('A hỏi thuế', {
    id: 'g-msg-1',
    chatId: 'g1',
    userId: 'uA',
    userName: 'Thành viên A',
    chatType: 'GROUP',
  }));

  // Khách B hỏi trong nhóm G1
  clock.advance('10s');
  await engine.process(upd('B hỏi cước', {
    id: 'g-msg-2',
    chatId: 'g1',
    userId: 'uB',
    userName: 'Thành viên B',
    chatType: 'GROUP',
  }));

  const msgsA = store.messages.recent('g1:uA', 10);
  const msgsB = store.messages.recent('g1:uB', 10);

  // Cuộc trò chuyện của A chỉ chứa tin của A và bot trả lời A
  assert.equal(msgsA.length, 2);
  assert.equal(msgsA[0].text, 'A hỏi thuế');
  assert.equal(msgsA[0].speaker, 'khach');
  assert.equal(msgsA[1].speaker, 'bot');

  // Cuộc trò chuyện của B chỉ chứa tin của B và bot trả lời B
  assert.equal(msgsB.length, 2);
  assert.equal(msgsB[0].text, 'B hỏi cước');
  assert.equal(msgsB[0].speaker, 'khach');
  assert.equal(msgsB[1].speaker, 'bot');
});

// ═══════════════════════════════════════════════════════════════════════
// Tiêu chí 6: Đáp ứng SC-008 trên toàn bộ 12 kịch bản eval
// Số tin trong messages = tin khách vào + tin đã gửi thành công
// ═══════════════════════════════════════════════════════════════════════

function parseJsonl(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('//'))
    .map((l) => JSON.parse(l));
}

test('T033: SC-008 — số tin trong messages khớp tin khách vào + tin đã gửi trên MỌI fixture eval', async () => {
  const dir = join(process.cwd(), 'eval/fixtures');
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl') && f !== 'messenger-human-echo.jsonl').sort();
  // Chặn trường hợp glob rỗng/sai đường dẫn (khi viết test này có 12 fixture; thêm kịch bản mới thì chỉ tăng).
  assert.ok(files.length >= 12, `phải quét được mọi fixture eval, chỉ thấy ${files.length}`);

  for (const f of files) {
    const steps = parseJsonl(join(dir, f));
    const tmp = mkdtempSync(join(tmpdir(), 'oz-sc008-'));
    const dbPath = join(tmp, 'eval.db');
    const script = {};
    for (const s of steps) if (s.step === 'mcp') script[s.tool] = Array.isArray(s.returns) ? s.returns : [s.returns];
    const clock = fakeClock(START);
    const channel = fakeChannel();
    const mcp = {
      counts: {},
      calls: [],
      async callTool(name, args = {}) {
        this.calls.push({ name, args });
        const list = script[name];
        if (!list) throw new Error(`eval: Cổng giả không có công cụ ${name}`);
        this.counts[name] = (this.counts[name] || 0) + 1;
        return structuredClone(list[Math.min(this.counts[name], list.length) - 1]);
      },
      async listTools() { return Object.keys(script).map((name) => ({ name })); },
    };

    const config = {
      capChatDay: 8,
      capGroupDay: 200,
      capAllDay: 300,
      staffChatId: STAFF_CHAT,
      staffUsers: new Set([STAFF_USER]),
      bannedPatterns: [],
      botNames: [],
      humanIdleMs: 7_200_000,
    };

    let store;
    let engine;
    let gate;
    let handoff;
    const open = () => {
      store = openStore(dbPath);
      gate = createGate({
        store, channel, now: clock.now,
        rules: { capChatDay: config.capChatDay, capGroupDay: config.capGroupDay, capAllDay: config.capAllDay,
          similarity: 0.8, directReplyMs: 600_000, quietHours: true, bannedPatterns: config.bannedPatterns },
        onAlert: () => {},
        onTicket: (convId, reason) => handoff.open(convId, reason).catch(() => {}),
        log: silent,
      });
      handoff = createHandoff({ store, gate, config, now: clock.now, log: silent });
      engine = createEngine({
        config, store, channel, mcp, registry: createRegistry([hsPack]), gate, handoff, now: clock.now, log: silent,
        advance: (ms) => { if (ms > clock.now().getTime()) clock.set(ms); },
      });
    };
    const boot = async () => { open(); gate.recover(); engine.jobs.recover(); await engine.recover(); };

    try {
      open();
      for (const s of steps) {
        switch (s.step) {
          case 'mcp': break;
          case 'config': Object.assign(config, s.config ?? s); break;
          case 'in':
            await engine.process(upd(s.update?.text, {
              id: s.update?.id,
              chatId: s.update?.chatId ?? 'c1',
              userId: s.update?.userId ?? 'u1',
              userName: s.update?.userName ?? 'Khách',
              chatType: s.update?.chatType ?? 'PRIVATE',
              photoUrl: s.update?.photoUrl ?? null,
              caption: s.update?.caption ?? null,
            }));
            if (s.drain !== false) await engine.drain();
            break;
          case 'staff':
            await engine.process(upd(s.text ?? s.update?.text, {
              id: s.id ?? s.update?.id,
              chatId: s.chatId ?? s.update?.chatId ?? config.staffChatId,
              userId: s.userId ?? s.update?.userId ?? STAFF_USER,
              userName: s.userName ?? s.update?.userName ?? 'Nhân viên',
              chatType: s.chatType ?? s.update?.chatType ?? 'GROUP',
            }));
            if (s.drain !== false) await engine.drain();
            break;
          case 'advance': clock.advance(s.by); await engine.drain(); break;
          case 'at': clock.set(s.time); await engine.drain(); break;
          case 'restart': store.close(); await boot(); await engine.drain(); break;
        }
      }

      // Kiểm SC-008: Số tin trong messages của phòng c1
      const msgs = store.messages.recent('c1', 1000);
      const khachMsgs = msgs.filter((m) => m.speaker === 'khach');
      const sentMsgs = msgs.filter((m) => m.speaker === 'bot' || m.speaker === 'nhan-vien');

      // Đếm số tin gửi thành công tới c1 từ kênh hoặc outbox
      const sentToC1 = channel.sent.filter((m) => m.chatId === 'c1');
      assert.equal(
        sentMsgs.length,
        sentToC1.length,
        `[${f}] số tin bot/nhân viên trong messages (${sentMsgs.length}) phải khớp số tin kênh nhận được (${sentToC1.length})`
      );

      // Tổng số tin trong messages phải bằng đúng tin khách vào + tin đã gửi thành công
      assert.equal(
        msgs.length,
        khachMsgs.length + sentMsgs.length,
        `[${f}] tổng số tin (${msgs.length}) phải bằng khách (${khachMsgs.length}) + gửi (${sentMsgs.length})`
      );
    } finally {
      try { store?.close(); } catch {}
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});
