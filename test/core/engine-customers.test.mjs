// T035: Cắm hồ sơ vào engine, phiếu và ctx gói.
// Test đỏ trước (Điều IV): engine gọi customers.touch mỗi lượt, áp labels/interests từ gói,
// phiếu kèm summary(), phòng human touch hồ sơ nhưng không gọi gói,
// gói đọc ctx.history(5) và ctx.customer.labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN
const silent = { info() {}, error() {} };

/** Gói giả trả labels + interests (hành vi giống packs/hs, đơn giản hơn). */
function customerPack({ labels = [], interests = [], handoff = null } = {}) {
  const seen = [];
  return {
    seen,
    pack: {
      id: 'hs', ten: 'HS', version: '1', audience: 'public', priority: 50,
      match: () => true,
      async handle(turn, ctx) {
        seen.push({ turn, ctx });
        return {
          replies: [{ text: `Dạ, bot nhận: ${turn.text}` }],
          evidence: [],
          labels,
          interests,
          handoff,
        };
      },
    },
  };
}

function setup({ packOpts = {}, config = {}, log = silent } = {}) {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  channel.typed = [];
  channel.typing = async () => {};
  const mcp = fakeMcp({});
  const { seen, pack } = customerPack(packOpts);
  const registry = createRegistry([pack]);
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config: { staffChatId: 'STAFF', staffUsers: ['s1'], ...config }, store, channel, mcp, vision: null, registry, gate, now: clock.now, log });
  return { store, clock, channel, engine, seen };
}

let seq = 0;
const upd = (text, o = {}) => ({
  updateKey: o.id ?? `tc${++seq}`, event: 'message.text.received', chatId: o.chatId ?? 'c1', userId: o.userId ?? 'u1',
  userName: o.userName ?? 'Chị Lan', chatType: o.chatType ?? 'PRIVATE', text, photoUrl: null, caption: null, messageId: null,
});

// ------------------------------------------------
// 1. Khách dùng gói hs → hồ sơ có nhãn + interest
// ------------------------------------------------
test('T035: khách dùng gói hs → hồ sơ có nhãn tra-cuu-hs, interest kèm mã HS', async () => {
  const { store, engine } = setup({
    packOpts: {
      labels: ['tra-cuu-hs'],
      interests: [{ mon: 'máy bơm ly tâm 1.5HP', hs: '84137090' }],
    },
  });
  await engine.process(upd('máy bơm ly tâm 1.5HP', { id: 'p1' }));
  const cust = store.customers.get('c1');
  assert.ok(cust, 'hồ sơ khách phải được tạo');
  assert.equal(cust.turns, 1, 'đếm lượt');
  const labels = cust.labels.map((l) => l.nhan);
  assert.ok(labels.includes('tra-cuu-hs'), 'nhãn tra-cuu-hs từ gói');
  const interests = cust.interests;
  assert.ok(interests.length >= 1, 'có ít nhất 1 món');
  assert.equal(interests[0].mon, 'máy bơm ly tâm 1.5HP');
  assert.equal(interests[0].hs, '84137090');
});

// ------------------------------------------------
// 2. Khách xin gặp người → nhãn xin-nguoi, phiếu có summary()
// ------------------------------------------------
test('T035: khách xin gặp người → nhãn xin-nguoi, phiếu kèm summary()', async () => {
  const { store, channel, engine } = setup({
    packOpts: { labels: ['tra-cuu-hs'], interests: [{ mon: 'máy bơm', hs: '84137090' }] },
  });
  // Lượt 1: tra cứu để tạo hồ sơ với nhãn
  await engine.process(upd('máy bơm ly tâm', { id: 'q1' }));
  // Lượt 2: xin gặp người
  await engine.process(upd('cho em gặp nhân viên', { id: 'q2' }));
  const cust = store.customers.get('c1');
  const labels = cust.labels.map((l) => l.nhan);
  assert.ok(labels.includes('xin-nguoi'), 'nhãn xin-nguoi khi khách xin gặp người');
  // Phiếu phải kèm summary: kiểm trong tin gửi nhóm nhân viên
  const phieu = channel.sent.find((s) => s.chatId === 'STAFF' && s.text.includes('P'));
  assert.ok(phieu, 'phải có tin phiếu gửi nhóm');
  assert.ok(phieu.text.includes('Hồ sơ khách'), 'phiếu kèm summary hồ sơ');
  assert.ok(phieu.text.includes('Chị Lan'), 'summary có tên khách');
});

// ------------------------------------------------
// 3. Gói đọc ctx.history(5) và ctx.customer.labels
// ------------------------------------------------
test('T035: gói đọc ctx.history(5) và ctx.customer.labels', async () => {
  const { engine, seen } = setup({
    packOpts: { labels: ['tra-cuu-hs'], interests: [] },
  });
  // Gửi 2 lượt để hồ sơ có labels
  await engine.process(upd('lượt một', { id: 'h1' }));
  await engine.process(upd('lượt hai', { id: 'h2' }));
  // Lượt 2: gói nhận ctx có history và customer
  const last = seen[seen.length - 1];
  assert.ok(typeof last.ctx.history === 'function', 'ctx.history là hàm');
  const hist = last.ctx.history(5);
  assert.ok(hist.length >= 2, 'history có ít nhất 2 tin (cả khách và bot)');
  // Tin cũ đứng trước (cũ → mới)
  assert.ok(hist[0].at <= hist[hist.length - 1].at, 'history sắp cũ → mới');
  // customer phải có labels từ lượt trước
  assert.ok(last.ctx.customer, 'ctx.customer tồn tại');
  const custLabels = (last.ctx.customer.labels ?? []).map((l) => l.nhan);
  assert.ok(custLabels.includes('tra-cuu-hs'), 'ctx.customer.labels có tra-cuu-hs');
});

// ------------------------------------------------
// 4. Phòng human → touch hồ sơ (đếm lượt) nhưng không gọi gói
// ------------------------------------------------
test('T035: phòng human → touch hồ sơ (đếm lượt) nhưng không gọi gói', async () => {
  const { store, engine, seen } = setup({
    packOpts: { labels: [], interests: [] },
  });
  // Lượt 1 bình thường, tạo hồ sơ
  await engine.process(upd('chào', { id: 'r1' }));
  assert.equal(seen.length, 1, 'gói gọi 1 lần');
  const truoc = store.customers.get('c1');
  assert.equal(truoc.turns, 1);
  // Chuyển phòng sang human
  store.convs.setState('c1', 'c1', 'human', 's1', 'nhan', new Date(START).toISOString());
  // Lượt 2 khi phòng human
  await engine.process(upd('em hỏi thêm', { id: 'r2' }));
  assert.equal(seen.length, 1, 'phòng human: gói KHÔNG được gọi');
  const sau = store.customers.get('c1');
  assert.equal(sau.turns, 2, 'phòng human vẫn đếm lượt (touch)');
});

// ------------------------------------------------
// 5. Việc nền: mã HS của gói 1 về ở onJobResult, hồ sơ phải nhận nhãn + món
// ------------------------------------------------
// Đường THẬT của gói hs gói 1 (`packs/hs/packages.js:178`): lượt khách chỉ gọi `phan_loai_hs` rồi
// trả `jobs`, mã HS về sau ở `onJobResult` (`packs/hs/index.js:131` cũng gọi `result()` nên cũng trả
// labels/interests). Nếu lõi chỉ áp nhãn ở `engine.process` thì món quan tâm KÈM MÃ HS không bao giờ
// vào hồ sơ — đúng thứ T035 hứa ("interest `máy bơm ly tâm 1.5HP` kèm mã HS của lượt").
test('T035: mã HS về ở việc nền (onJobResult) → hồ sơ vẫn nhận nhãn + món kèm mã HS', async () => {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  channel.typing = async () => {};
  // Cổng: lượt đầu nhận việc, hỏi kết quả thì trả mã HS.
  const mcp = fakeMcp({
    phan_loai_hs: () => ({ ok: true, maLuot: 'L-9', trangThai: 'DANG_XU_LY' }),
    ket_qua_phan_loai: () => ({ ok: true, trangThai: 'XONG', data: { maHs: '84137090' } }),
  });
  // Gói giả theo ĐÚNG hình dạng gói hs: lượt khách chỉ trả `jobs` (chưa có mã, chưa có nhãn),
  // `onJobResult` mới trả nhãn + món kèm mã HS.
  const pack = {
    id: 'hs', ten: 'HS', version: '1', audience: 'public', priority: 50,
    match: () => true,
    async handle(turn, ctx) {
      await ctx.mcp.callTool('phan_loai_hs', { tenHang: turn.text });
      return { replies: [], evidence: [], labels: [], interests: [], jobs: [{ maLuot: 'L-9', resultTool: 'ket_qua_phan_loai', context: { tenHang: turn.text } }] };
    },
    async onJobResult(job, res) {
      return {
        replies: [{ text: `Mã HS: ${res?.data?.maHs}` }],
        evidence: [res],
        labels: ['tra-cuu-hs'],
        interests: [{ mon: job.context.tenHang, hs: res?.data?.maHs }],
      };
    },
  };
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config: {}, store, channel, mcp, vision: null, registry: createRegistry([pack]), gate, now: clock.now, log: silent });

  await engine.process(upd('máy bơm ly tâm 1.5HP', { id: 'j1' }));
  // Lượt khách chưa có nhãn nào (gói chưa biết mã): hồ sơ chỉ có số lượt.
  assert.deepEqual(store.customers.get('c1').labels, [], 'lượt khách chưa có nhãn');
  // Việc nền chạy xong → kết quả có mã HS.
  clock.advance('6s');
  await engine.drain();
  assert.match(channel.sent.at(-1).text, /84137090/, 'khách nhận được mã HS');

  const cust = store.customers.get('c1');
  assert.ok(cust.labels.map((l) => l.nhan).includes('tra-cuu-hs'), 'việc nền áp nhãn tra-cuu-hs vào hồ sơ');
  assert.equal(cust.interests[0].mon, 'máy bơm ly tâm 1.5HP');
  assert.equal(cust.interests[0].hs, '84137090', 'món quan tâm kèm mã HS của lượt');
  // Việc nền KHÔNG phải tin khách: không được đếm thêm lượt (`turns` là số lượt KHÁCH nhắn, FR-025).
  assert.equal(cust.turns, 1, 'việc nền không đếm thêm lượt');
});

// ------------------------------------------------
// 6. Hồ sơ trong phiếu: che TỪNG DÒNG, một dòng bẩn không làm mất cả phiếu
// ------------------------------------------------
// Tên và ghi chú là chữ NGƯỜI NGOÀI gõ được. `guiPhieu` che CẢ tin nếu còn dấu hiệu lộ
// (`core/handoff-ticket.js:112`), nên nếu hồ sơ vào phiếu mà không che từng dòng thì khách chỉ cần
// đặt tên Zalo có dạng khoá là nhân viên mất sạch phiếu — không biết khách nào đang chờ (Điều II).
test('T035: hồ sơ vào phiếu che TỪNG DÒNG, phần còn lại của phiếu vẫn tới nhân viên', async () => {
  const { store, channel, engine } = setup({ packOpts: { labels: [], interests: [] } });
  // Khách đặt tên Zalo có dạng ĐƯỜNG DẪN máy chủ — `findLeak` bắt loại 'path' (`core/redact.js:28`).
  // Dùng đường dẫn chứ không dùng chuỗi dạng khoá: khoá giả phải đủ dài (16+ ký tự) mới bị bắt, mà
  // chuỗi dài dạng khoá trong test lại bị cổng quét của repo công khai chặn.
  await engine.process(upd('cho em gặp nhân viên', { id: 'g1', userName: 'Lan /home/oz/bi-mat' }));
  const phieu = channel.sent.filter((s) => s.chatId === 'STAFF');
  assert.equal(phieu.length, 1, 'phiếu vẫn tới nhóm nhân viên');
  const text = phieu[0].text;
  assert.match(text, /🎫 P1 · phiếu mới/, 'phiếu không bị che cả tin');
  assert.match(text, /Lý do: khach-xin-nguoi/, 'lý do phiếu vẫn đọc được');
  assert.match(text, /Nhãn: .*xin-nguoi/, 'dòng nhãn của hồ sơ vẫn tới nhân viên');
  assert.ok(!text.includes('/home/oz/bi-mat'), 'đường dẫn máy chủ không đi ra nhóm');
  assert.match(text, /\(dòng bị che/, 'chỉ DÒNG bẩn bị che, không phải cả phiếu');
  // Hồ sơ vẫn giữ nguyên tên khách trong db (chỉ TIN RA mới che) để `/ho-so` của T036 còn tra được.
  assert.ok(store.customers.get('c1').display_name.includes('/home/oz/bi-mat'));
});
