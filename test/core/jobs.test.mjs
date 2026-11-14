// T021: core/jobs.js — việc nền bền (tách từ core/engine-jobs.js).
// Kiểm trực tiếp createJobs, không qua engine: thêm việc → hỏi Cổng theo nhịp → kết quả qua cửa gửi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createJobs, FIRST_POLL_MS, MAX_POLL_MS, JOB_TTL_MS, RETRY_TOI_DA } from '../../core/jobs.js';
// laRetry + RETRY_CHO_MS là CỦA GÓI (packs/hs/jobs.js:29-35, OZV-769). Test dùng đúng chúng để chốt:
// lõi không được có bộ đọc verdict thứ hai, nó chỉ gọi `pack.laRetry` (OZV-779).
import { laRetry, RETRY_CHO_MS } from '../../packs/hs/jobs.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z';   // 10:00 giờ VN
const QUIET = '2026-11-04T16:25:00.000Z';   // 23:25 giờ VN (trong giờ yên)
const silent = { info() {}, error() {} };

/** Câu hết hạn do GÓI soạn (nguyên văn khuôn của packs/hs/jobs.js:18) — lõi chỉ truyền result = null. */
const hetHanText = (maLuot) => `Chưa có kết quả sau 30 phút. Mã lượt: ${maLuot} — hỏi lại sau bằng cách gõ: kết quả ${maLuot}`;

function jobPack(extra = {}) {
  return {
    id: 'jp', ten: 'Gói việc nền', version: '1', audience: 'public', priority: 9, match: () => true,
    async handle() { return {}; },
    async onJobResult(job, res) {
      return res == null
        ? { replies: [{ text: hetHanText(job.maLuot) }] }
        : { replies: [{ text: `Xong ${job.maLuot} ${res.hs}` }], evidence: [res] };
    },
    ...extra,
  };
}

/** Lõi việc nền trên một store cho trước; dùng lại store để mô phỏng khởi động lại. */
function build({ store, clock, channel, pack = jobPack(), script = {}, tools = new Set(['kq']), onAlert = () => {}, gate: gateNgoai = null }) {
  const registry = createRegistry([pack]);
  const gate = gateNgoai ?? createGate({ store, channel, now: clock.now });
  const mcp = fakeMcp(script);
  const jobs = createJobs({ store, mcp, registry, gate, now: clock.now, log: silent, tools: async () => tools, onAlert });
  return { jobs, gate, mcp };
}

function setup(o = {}) {
  const clock = fakeClock(o.start ?? START);
  const channel = fakeChannel();
  const store = openStore(o.dbPath);
  return { store, clock, channel, ...build({ store, clock, channel, ...o }) };
}

let seq = 0;
/** turn như core/engine.js dựng: khoá theo conv_id (người), không theo phòng. */
const turnOf = (o = {}) => ({
  turnId: o.turnId ?? `t${++seq}`, chatId: o.chatId ?? 'c1', convId: o.convId ?? o.chatId ?? 'c1',
  userId: o.userId ?? 'u1', userName: o.userName ?? 'Tuấn', isGroup: o.isGroup === true,
  receivedAt: o.receivedAt ?? START, namePrefix: o.namePrefix ?? '',
});

const DONG = (store) => store.jobs.due('2099-01-01T00:00:00.000Z')[0] ?? null;
const sentTo = (channel, chatId = 'c1') => channel.sent.filter((m) => m.chatId === chatId).map((m) => m.text);

test('DANG_XU_LY 2 lần rồi XONG → khách nhận 1 tin job_result, idem j:<conv>:<maLuot>', async () => {
  const ML = 'L-1';
  let polls = 0;
  const { store, clock, channel, jobs } = setup({
    script: { kq: () => (++polls <= 2 ? { trangThai: 'DANG_XU_LY' } : { trangThai: 'XONG', hs: '84137090' }) },
  });
  assert.ok(jobs.add(turnOf(), 'c1', 'jp', { maLuot: ML, resultTool: 'kq' }) !== null);

  assert.equal(await jobs.tick(), 0);                 // chưa tới hạn 6 s
  assert.equal(polls, 0);
  clock.advance('6s'); assert.equal(await jobs.tick(), 1);
  clock.advance('12s'); await jobs.tick();
  assert.deepEqual([polls, channel.sent.length], [2, 0]);   // còn chạy thì chưa gửi gì cho khách
  clock.advance('24s'); await jobs.tick();

  assert.deepEqual(sentTo(channel), [`Xong ${ML} 84137090`]);
  assert.ok(store.outbox.hasIdem(`j:c1:${ML}`));
  assert.equal(store.jobs.nextDue(), null);            // không còn việc chờ
  assert.equal(await jobs.tick(), 0);                  // tick thêm không gửi lại
  assert.equal(channel.sent.length, 1);
});

test('hỏi lại theo nhịp 6 s, 12 s, 24 s, 48 s rồi chặn ở 60 s', async () => {
  const { store, clock, jobs } = setup({ script: { kq: () => ({ trangThai: 'DANG_XU_LY' }) } });
  const t0 = clock.now().getTime();
  jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-nhip', resultTool: 'kq' });
  assert.equal(Date.parse(DONG(store).next_poll_at) - t0, FIRST_POLL_MS);

  for (const cho of [6_000, 12_000, 24_000, 48_000, 60_000, 60_000]) {
    const truoc = clock.now().getTime();
    clock.set(DONG(store).next_poll_at);
    assert.equal(clock.now().getTime() - truoc, cho, `nhịp kế phải là ${cho} ms`);
    assert.equal(await jobs.tick(), 1);
  }
  assert.equal(Date.parse(DONG(store).next_poll_at) - clock.now().getTime(), MAX_POLL_MS);
  assert.equal(MAX_POLL_MS, 60_000);
});

// OZV-779 (issue #177): PR #227 chỉ vá đường CHỜ TRONG LƯỢT (packs/hs/jobs.js waitJob). Gói 1 và gói 4 —
// hai gói khách dùng nhiều nhất — đi đường việc nền bền: batDau → toJob → core/jobs.js tick() → onJobResult.
// Trên đường đó verdict RETRY của Cổng trước đây rơi thẳng vào onJobResult ngay lượt hỏi đầu, nên khách
// nhận "AI bận hoặc quá thời gian" mà bot KHÔNG hề gọi lại. Hai ca dưới chốt đường thật đó.
const retryVerdict = { trangThai: 'XONG', ketQua: { nextAction: { type: 'RETRY', reasonCode: 'ENGINE_TIMEOUT' } } };

test('OZV-779: Cổng trả RETRY 2 lần rồi kết quả thật → lõi gọi lại, khách nhận mã HS (đếm được 3 lần gọi Cổng)', async () => {
  const ML = 'L-retry';
  const goi = [];
  const { store, clock, channel, jobs } = setup({
    pack: jobPack({ laRetry }),   // gói đưa bộ đọc verdict của mình cho lõi (không để lõi tự đọc)
    script: { kq: () => { goi.push(clock.now().getTime()); return goi.length <= 2 ? retryVerdict : { trangThai: 'XONG', hs: '84137090' }; } },
  });
  const t0 = clock.now().getTime();
  jobs.add(turnOf(), 'c1', 'jp', { maLuot: ML, resultTool: 'kq' });

  clock.advance('6s');
  assert.equal(await jobs.tick(), 1);
  assert.deepEqual([goi.length, channel.sent.length], [1, 0], 'RETRY lần 1: chưa trả lời khách, hẹn gọi lại');
  assert.equal(DONG(store).status, 'waiting', 'việc còn nợ, không đóng');

  // Giãn cách gọi lại lấy từ GÓI (RETRY_CHO_MS = 20 s, 60 s), không phải nhịp DANG_XU_LY 6/12/24 s.
  assert.equal(Date.parse(DONG(store).next_poll_at) - clock.now().getTime(), RETRY_CHO_MS[0]);
  clock.set(DONG(store).next_poll_at);
  assert.equal(await jobs.tick(), 1);
  assert.deepEqual([goi.length, channel.sent.length], [2, 0], 'RETRY lần 2: vẫn gọi lại');
  assert.equal(Date.parse(DONG(store).next_poll_at) - clock.now().getTime(), RETRY_CHO_MS[1]);

  clock.set(DONG(store).next_poll_at);
  assert.equal(await jobs.tick(), 1);
  assert.equal(goi.length, 3, 'đếm được đúng 3 lần callTool(result_tool)');
  assert.deepEqual(sentTo(channel), [`Xong ${ML} 84137090`], 'khách nhận mã HS, không phải câu "AI bận"');
  assert.ok(store.outbox.hasIdem(`j:c1:${ML}`));
  assert.equal(store.jobs.nextDue(), null);
  // Nhịp DANG_XU_LY không bị RETRY làm hỏng: attempts vẫn đếm riêng (xem ca "hỏi lại theo nhịp").
  assert.ok(goi[2] - t0 <= 2 * 60_000, 'cả chuỗi gọi lại nằm gọn trong vài phút, không chạm TTL 30 phút');
});

test('OZV-779: Cổng RETRY mãi → chỉ gọi lại tối đa RETRY_TOI_DA lần rồi trả đúng verdict, không bịa mã HS', async () => {
  const ML = 'L-retry-mai';
  let goi = 0;
  const ghi = [];
  const { store, clock, channel, jobs } = setup({
    pack: jobPack({
      laRetry,
      // Gói tự soạn câu trung thực cho verdict RETRY (Điều II: lõi không soạn chữ, gói không bịa mã).
      async onJobResult(job, res) {
        const t = laRetry(res)
          ? `AI bận hoặc quá thời gian. Mã lượt: ${job.maLuot} — hỏi lại sau bằng cách gõ: kết quả ${job.maLuot}`
          : `Xong ${job.maLuot} ${res?.hs}`;
        ghi.push(t);
        return { replies: [{ text: t }], evidence: res ? [res] : [] };
      },
    }),
    script: { kq: () => { goi++; return retryVerdict; } },
  });
  jobs.add(turnOf(), 'c1', 'jp', { maLuot: ML, resultTool: 'kq' });

  clock.advance('6s');
  await jobs.tick();
  for (let i = 0; i < RETRY_TOI_DA + 2 && DONG(store); i++) {
    clock.set(DONG(store).next_poll_at);
    await jobs.tick();
  }

  assert.equal(goi, RETRY_TOI_DA + 1, `1 lần hỏi đầu + đúng ${RETRY_TOI_DA} lần gọi lại, không gọi vô hạn`);
  assert.equal(channel.sent.length, 1, 'khách nhận đúng MỘT tin');
  const tin = sentTo(channel)[0];
  assert.doesNotMatch(tin, /\d{4}\.\d{2}\.\d{2}/, 'không có mã HS bịa ra khi Cổng chưa trả mã');
  assert.match(tin, new RegExp(`kết quả ${ML}`), 'vẫn còn mã lượt để khách tự hỏi lại');
  assert.equal(store.jobs.nextDue(), null, 'việc đã đóng, không treo nợ');
});

test('OZV-779: gói KHÔNG có laRetry (gói khác hs) → lõi giữ nguyên nếp cũ, trả verdict ngay lượt đầu', async () => {
  // Lõi chỉ gọi `pack.laRetry?.(...)`; gói nào không khai thì không có gọi lại — không lõi nào tự đọc nextAction.
  let goi = 0;
  const { clock, channel, jobs } = setup({ script: { kq: () => { goi++; return retryVerdict; } } });
  jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-khong-khai', resultTool: 'kq' });
  clock.advance('6s');
  await jobs.tick();
  assert.equal(goi, 1);
  assert.equal(channel.sent.length, 1, 'gói không khai laRetry thì kết quả đi thẳng tới khách như trước');
});

test('quá 30 phút → expired, khách nhận câu "gõ: kết quả <maLuot>", không hỏi Cổng nữa', async () => {
  const ML = 'L-hethan';
  let polls = 0;
  const { store, clock, channel, jobs } = setup({ script: { kq: () => { polls++; return { trangThai: 'DANG_XU_LY' }; } } });
  jobs.add(turnOf(), 'c1', 'jp', { maLuot: ML, resultTool: 'kq' });
  clock.advance(JOB_TTL_MS + 1_000);
  const sau = polls;
  await jobs.tick();

  assert.deepEqual(sentTo(channel), [hetHanText(ML)]);
  assert.match(sentTo(channel)[0], /gõ: kết quả L-hethan/);
  assert.equal(polls, sau, 'hết hạn thì không gọi Cổng nữa');
  assert.ok(store.outbox.hasIdem(`j:c1:${ML}`));
  assert.equal(store.jobs.nextDue(), null);
});

test('xong lúc 23:25 VN → outbox defer tới 07:00 VN, sweep 07:00 gửi đúng 1 lần', async () => {
  const ML = 'L-dem';
  const { store, clock, channel, jobs, gate } = setup({ start: QUIET, script: { kq: () => ({ trangThai: 'XONG', hs: '84137090' }) } });
  jobs.add(turnOf({ receivedAt: QUIET }), 'c1', 'jp', { maLuot: ML, resultTool: 'kq' });
  clock.advance('6s');
  await jobs.tick();

  assert.deepEqual(sentTo(channel), [], 'giờ yên: chưa gửi');
  const o = store.outbox.get(1);
  assert.deepEqual([o.status, o.reason], ['deferred', 'quiet-hours']);
  assert.equal(o.not_before, '2026-11-05T00:00:00.000Z');   // 07:00 VN hôm sau

  clock.set('2026-11-05T00:00:00.000Z');
  assert.equal(await gate.sweep(), 1);
  assert.deepEqual(sentTo(channel), [`Xong ${ML} 84137090`]);
  assert.equal(await gate.sweep(), 0);                       // sweep lần nữa không gửi lại
  assert.equal(channel.sent.length, 1);
});

test('khởi động lại giữa chừng (createJobs mới trên cùng db) → vẫn giao đúng 1 lần', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'oz-jobs-'));
  const dbPath = join(tmp, 'bot.db');
  const ML = 'L-restart';
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const script = { kq: () => ({ trangThai: 'XONG', hs: '84137090' }) };
  try {
    let store = openStore(dbPath);
    let jobs = build({ store, clock, channel, script }).jobs;
    jobs.add(turnOf(), 'c1', 'jp', { maLuot: ML, resultTool: 'kq' });
    store.close();                                            // tiến trình chết trước lượt hỏi đầu tiên

    store = openStore(dbPath);
    jobs = build({ store, clock, channel, script }).jobs;
    clock.advance('6s');
    assert.equal(await jobs.tick(), 1);
    assert.deepEqual(sentTo(channel), [`Xong ${ML} 84137090`]);
    store.close();

    store = openStore(dbPath);                                // khởi động lại lần nữa: việc đã xong, không gửi lại
    jobs = build({ store, clock, channel, script }).jobs;
    clock.advance('1m');
    assert.equal(await jobs.tick(), 0);
    assert.equal(channel.sent.length, 1);
    store.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('recover(): dòng kẹt "polling" vì tiến trình chết lúc đang hỏi Cổng → về waiting, kết quả vẫn tới khách', async () => {
  const ML = 'L-kep';
  const { store, clock, channel, jobs } = setup({ script: { kq: () => ({ trangThai: 'XONG', hs: '84137090' }) } });
  const id = jobs.add(turnOf(), 'c1', 'jp', { maLuot: ML, resultTool: 'kq' });
  clock.advance('6s');
  assert.equal(store.jobs.claim(id), true);                   // mô phỏng: đã claim rồi tiến trình chết
  assert.equal(store.jobs.nextDue(), null);                   // dòng 'polling' không ai lấy nữa
  assert.equal(await jobs.tick(), 0);

  assert.equal(jobs.recover(), 1);
  assert.equal(await jobs.tick(), 1);
  assert.deepEqual(sentTo(channel), [`Xong ${ML} 84137090`]);
  assert.equal(jobs.recover(), 0);                            // không còn dòng kẹt
  assert.equal(store.audit.byTurn(`job:${id}`).some((a) => a.type === 'error' && a.data.reason === 'crash-mid-poll'), true);
});

test('gói không có onJobResult → việc failed, báo người (onAlert), không gửi gì cho khách', async () => {
  const canhBao = [];
  const { store, clock, channel, jobs } = setup({
    pack: jobPack({ onJobResult: undefined }),
    script: { kq: () => ({ trangThai: 'XONG', hs: '84137090' }) },
    onAlert: (chatId, reason) => canhBao.push({ chatId, reason }),
  });
  const id = jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-hong', resultTool: 'kq' });
  clock.advance('6s');
  await jobs.tick();

  assert.equal(sentTo(channel).length, 0);
  assert.deepEqual(canhBao, [{ chatId: 'c1', reason: 'job-failed' }]);
  assert.equal(DONG(store), null);
  assert.equal(store.audit.byTurn(`job:${id}`).some((a) => a.type === 'error'), true);
});

test('Cổng rớt mạng → hỏi lại theo nhịp (không failed), lỗi gốc không lọt ra khách', async () => {
  let n = 0;
  const { store, clock, channel, jobs } = setup({
    script: { kq: () => { if (++n === 1) throw new Error('fetch failed: Cổng OZ không trả lời'); return { trangThai: 'XONG', hs: '84137090' }; } },
  });
  jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-mang', resultTool: 'kq' });
  clock.advance('6s');
  await jobs.tick();
  assert.equal(sentTo(channel).length, 0);
  assert.equal(DONG(store).status, 'waiting');

  clock.advance('12s');
  await jobs.tick();
  assert.deepEqual(sentTo(channel), ['Xong L-mang 84137090']);
  assert.doesNotMatch(channel.sent.map((m) => m.text).join('\n'), /fetch failed/);
});

test('cùng (gói, maLuot) thêm hai lần → chỉ một dòng việc; thiếu resultTool thì add ném lỗi', () => {
  const { store, jobs } = setup({ script: { kq: () => ({ trangThai: 'XONG' }) } });
  assert.ok(jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-doi', resultTool: 'kq' }) !== null);
  assert.equal(jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-doi', resultTool: 'kq' }), null);
  assert.equal(store.jobs.due('2099-01-01T00:00:00.000Z').length, 1);
  assert.throws(() => jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-thieu' }));
});

test('hai lượt tick() chồng nhau: jobs.claim chặn lượt đầu xử lý lại việc lượt sau đã nhận', async () => {
  // Tranh chấp thật chỉ có khi lượt A đã lấy danh sách đến hạn gồm CẢ việc 2, rồi trong lúc A chờ
  // Cổng cho việc 1 thì lượt B nhận việc 2. A quay lại vòng lặp gặp việc 2: claim trả false → phải bỏ qua.
  // Một việc duy nhất không thử được chốt này: lượt B gọi due() sau khi A đã claim nên không thấy dòng.
  let polls = 0;
  let moKhoa;
  const chomCho = new Promise((r) => { moKhoa = r; });
  const { store, clock, channel, jobs } = setup({
    script: { kq: async () => { polls++; await chomCho; return { trangThai: 'XONG', hs: '84137090' }; } },
  });
  const id1 = jobs.add(turnOf({ chatId: 'c1' }), 'c1', 'jp', { maLuot: 'L-claim-1', resultTool: 'kq' });
  const id2 = jobs.add(turnOf({ chatId: 'c2' }), 'c2', 'jp', { maLuot: 'L-claim-2', resultTool: 'kq' });
  clock.advance('6s');

  const a = jobs.tick();
  const b = jobs.tick();
  moKhoa();
  const [na, nb] = await Promise.all([a, b]);
  assert.equal(na + nb, 2, 'mỗi việc đúng một lượt nhận');
  assert.equal(polls, 2, 'claim hỏng thì Cổng bị hỏi lại việc 2 thêm một lần');
  assert.deepEqual(sentTo(channel, 'c1'), ['Xong L-claim-1 84137090']);
  assert.deepEqual(sentTo(channel, 'c2'), ['Xong L-claim-2 84137090']);
  assert.equal(store.jobs.polling().length, 0);
  for (const id of [id1, id2])
    assert.equal(store.audit.byTurn(`job:${id}`).filter((x) => x.type === 'outbound').length, 1, `việc ${id} chỉ một lượt gửi`);
});

// Soát T021 (#33) chỉ ra: test việc nền trước đây chỉ xem CHỮ tới khách, nên đổi `kind` thành
// 'reply', ép `isGroup` luôn false, hay bỏ trắng `evidence` đều không test nào đỏ. Ba test dưới đây
// soi đúng các trường lõi đưa qua cửa — vì cửa quyết định theo chúng (giờ yên, nợ việc nền, trần
// ngày của nhóm, kiểm số tiền), chữ giống nhau không có nghĩa là quyết định giống nhau.
test('các trường lõi đưa qua cửa cho kết quả việc nền: kind job_result, isGroup, pack, mốc trả lời', async () => {
  const ML = 'L-truong';
  const ghi = [];
  const { store, clock, jobs } = setup({
    script: { kq: () => ({ trangThai: 'XONG', hs: '84137090' }) },
    gate: { send: async (m) => { ghi.push(m); return { id: 1, decision: 'send', reason: 'ok', status: 'sent' }; }, sweep: async () => 0, recover: () => 0 },
  });
  store.convs.upsertSeen('G:u7', 'G', 'u7', 'Nguyễn Văn A', START);
  const turn = turnOf({ chatId: 'G', convId: 'G:u7', userId: 'u7', userName: 'Nguyễn Văn A', isGroup: true, receivedAt: START });
  const id = jobs.add(turn, 'G:u7', 'jp', { maLuot: ML, resultTool: 'kq' });
  clock.advance('6s');
  assert.equal(await jobs.tick(), 1);

  assert.equal(ghi.length, 1);
  const m = ghi[0];
  // kind: cửa đối xử với 'job_result' KHÁC 'reply' — luôn là tin chủ động nên phải có việc nền nợ và
  // phải chịu giờ yên (core/gate-decide.js:36-38, hiến pháp Điều II). Đổi sang 'reply' là lách luật đó.
  assert.equal(m.kind, 'job_result');
  // isGroup: cửa dùng để tính trần ngày CỦA NHÓM (core/gate-decide.js:108). Ép false là mất trần nhóm.
  assert.equal(m.isGroup, true);
  assert.equal(m.chatId, 'G');
  assert.equal(m.convId, 'G:u7', 'khoá theo người, không theo phòng (FR-030)');
  assert.equal(m.idemKey, `j:G:u7:${ML}`);
  assert.equal(m.turnId, `job:${id}`, 'tin ra tra được về một lượt trong audit (SC-007)');
  assert.equal(m.inReplyToAt, START, 'mốc tin khách của lượt sinh ra việc (issue #55)');
  assert.deepEqual(m.pack, { id: 'jp', moneyCheck: false });
  assert.deepEqual(m.evidence, [{ trangThai: 'XONG', hs: '84137090' }], 'evidence gói trả, nguyên vật');
});

test('isGroup/inReplyToAt của việc nền ở chat 1-1: isGroup false, dòng jobs cũ thiếu receivedAt → null', async () => {
  const ghi = [];
  const { store, clock, jobs } = setup({
    script: { kq: () => ({ trangThai: 'XONG', hs: '84137090' }) },
    gate: { send: async (m) => { ghi.push(m); return { id: 1, decision: 'send', reason: 'ok', status: 'sent' }; }, sweep: async () => 0, recover: () => 0 },
  });
  const id = jobs.add(turnOf({ receivedAt: START }), 'c1', 'jp', { maLuot: 'L-rieng', resultTool: 'kq' });
  // Dòng việc của bản cũ không có `receivedAt` trong context (jobs cũ hơn issue #55).
  const cu = store.jobs.due('2099-01-01T00:00:00.000Z')[0];
  store.jobs.update(id, { context: { ...cu.context, receivedAt: undefined } });
  clock.advance('6s');
  assert.equal(await jobs.tick(), 1);

  assert.equal(ghi[0].isGroup, false, 'chat 1-1 phải là false, không phải "luôn false" hay "luôn true"');
  assert.equal(ghi[0].inReplyToAt, null, 'thiếu mốc thì null (cửa coi là tin chủ động), không ném lỗi');
});

test('evidence thật sự được dùng: gói moneyCheck → số tiền có trong evidence thì cửa cho gửi, không có thì chặn', async () => {
  // Bước 8 của cửa (core/gate-decide.js:136-139): gói kiểm tiền thì mọi số tiền trong câu phải có
  // trong evidence. Nếu lõi đưa evidence rỗng, ca thứ nhất dưới đây sẽ bị cửa chặn → test đỏ.
  const tienPack = (text, evidence) => jobPack({
    moneyCheck: true,
    async onJobResult() { return { replies: [{ text }], evidence }; },
  });

  const dung = setup({
    pack: tienPack('Giá lô này là 25.650.000đ nhé', [{ gia: '25.650.000đ' }]),
    script: { kq: () => ({ trangThai: 'XONG' }) },
  });
  dung.jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-tien-ok', resultTool: 'kq' });
  dung.clock.advance('6s');
  await dung.jobs.tick();
  assert.deepEqual(sentTo(dung.channel), ['Giá lô này là 25.650.000đ nhé'], 'số tiền có trong evidence → được gửi');

  const sai = setup({
    pack: tienPack('Giá lô này là 25.650.000đ nhé', []),   // gói "nghĩ ra" số tiền: không có chứng cứ
    script: { kq: () => ({ trangThai: 'XONG' }) },
  });
  sai.jobs.add(turnOf(), 'c1', 'jp', { maLuot: 'L-tien-sai', resultTool: 'kq' });
  sai.clock.advance('6s');
  await sai.jobs.tick();
  assert.deepEqual(sentTo(sai.channel), [], 'số tiền không có chứng cứ → cửa chặn, khách không nhận');
  const ly = sai.store.outbox.get(1);
  assert.equal(ly.decision, 'reject');
  assert.match(ly.reason, /^money:/);
});

test('việc nền trong nhóm: kết quả gắn lại @tên người hỏi, khoá idem theo conv_id', async () => {
  const { store, clock, channel, jobs } = setup({ script: { kq: () => ({ trangThai: 'XONG', hs: '84137090' }) } });
  store.convs.upsertSeen('G:u7', 'G', 'u7', 'Nguyễn Văn A', START);
  const turn = turnOf({ chatId: 'G', convId: 'G:u7', userId: 'u7', userName: 'Nguyễn Văn A', isGroup: true });
  jobs.add(turn, 'G:u7', 'jp', { maLuot: 'L-nhom', resultTool: 'kq' });
  clock.advance('6s');
  await jobs.tick();

  assert.deepEqual(sentTo(channel, 'G'), ['@Nguyễn Văn A\nXong L-nhom 84137090']);
  assert.ok(store.outbox.hasIdem('j:G:u7:L-nhom'));
});

test('issue #136: jobs.tick gọi guiThoai khi kết quả việc nền hoàn tất', async () => {
  const thoaiDaGoi = [];
  const fakeGuiThoai = async (turn, res, key, results) => {
    thoaiDaGoi.push({ turn, res, key });
  };

  const { store, clock, channel } = setup();
  const pack = jobPack();
  const registry = createRegistry([pack]);
  const gate = createGate({ store, channel, now: clock.now });
  const mcp = fakeMcp({ kq: () => ({ trangThai: 'XONG', hs: '85094000' }) });
  const jobs = createJobs({
    store, mcp, registry, gate, now: clock.now, log: silent,
    tools: async () => new Set(['kq']),
    guiThoai: fakeGuiThoai,
  });

  const turn = turnOf({ chatId: 'c1', convId: 'c1', userId: 'u1' });
  jobs.add(turn, 'c1', 'jp', { maLuot: 'ML-VOICE', resultTool: 'kq' });
  clock.advance('6s');
  await jobs.tick();

  assert.equal(thoaiDaGoi.length, 1, 'guiThoai phải được gọi 1 lần khi job xong');
  assert.equal(thoaiDaGoi[0].key, 'j:ML-VOICE');
  assert.match(thoaiDaGoi[0].res.replies[0].text, /85094000/);
});

