// issue #170, yêu cầu 1 và 3 — bot HỎI LẠI một câu (mâu thuẫn ảnh ↔ chữ) thì KHÔNG được nuốt câu đáp.
//
// Người soát đo trên Lõi thật: `packs/hs/flow-photo.js:35` xoá `s.choXacNhanAnh` ở nhánh mâu thuẫn,
// mà cửa chào kết của Lõi (`core/engine.js:203`) chỉ miễn chặn khi đúng cờ ĐÓ còn. Khách đáp
// "@bot OK" / "vâng" / "dạ" / "ok ạ" → `isCloser` nhận là tin chào kết → `skipped:'closer'`, 0 tin ra.
// Cửa này đứng SAU `store.messages.add`, nên tin bị nuốt vẫn vào sổ: SC-008 vẫn cân và ca eval vẫn
// xanh. Vì vậy bằng chứng phải đo ở Lõi, bằng SỐ TIN GỬI RA, không phải bằng sổ messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import hsPack from '../../packs/hs/index.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';
import { plain } from '../../packs/hs/style.js';

const START = '2026-11-10T02:58:00.000Z';   // 09:58 VN — đúng mốc tin 1 của bài test nhóm
const ML = '11111111-2222-4333-8444-555555555555';
const MO_TA = 'Chốt kẹp xoay 1/4 vòng loại núm thấp (Low-Height Knob Quarter-Turn Clamp), mã QCTHL0525-10S, cố định vỏ máy và cửa bảo vệ';
const silent = { info() {}, error() {} };

/** Đúng cái bẫy của issue: AI đọc ảnh thấy chữ "ON OFF" in trên núm → hiểu sang hướng điện. */
const vision = {
  readSpecs: async () => ({ tenHang: 'Núm vặn khoá bật tắt ON OFF', chatLieu: 'thép không gỉ + núm nhựa ABS',
    chuTrongAnh: 'ON  OFF', khongChac: [] }),
};

function setup() {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const mcp = fakeMcp({ phan_loai_hs: () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } }) });
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config: { botNames: ['bot'] }, store, channel, mcp, vision,
    registry: createRegistry([hsPack]), gate, now: clock.now, log: silent });
  return { store, clock, channel, engine };
}

let seq = 0;
const chu = (text) => ({ updateKey: `t${++seq}`, event: 'message.text.received', chatId: 'c1', userId: 'u1',
  userName: 'Khách', chatType: 'PRIVATE', text, photoUrl: null, caption: null });
const anh = (caption) => ({ updateKey: `t${++seq}`, event: 'message.image.received', chatId: 'c1', userId: 'u1',
  userName: 'Khách', chatType: 'PRIVATE', text: null, caption,
  photoUrl: 'https://photo-stal-14.zdn.vn/no/jpg/qcthl.jpg' });

/** Dựng đúng mạch của đề bài tới lúc bot vừa HỎI LẠI câu mâu thuẫn. */
async function denLucBotHoiLai() {
  const t = setup();
  await t.engine.process(chu(`@bot ${MO_TA}`));
  await t.engine.drain();
  t.clock.advance('3m');
  await t.engine.process(anh('@bot chất liệu: thép không gỉ + núm nhựa ABS'));
  await t.engine.drain();
  const cuoi = plain(t.channel.sent.at(-1)?.text ?? '');
  assert.match(cuoi, /\?/, 'mạch chưa tới được lúc bot hỏi lại');
  assert.match(cuoi, /ON ?\/?OFF/i, 'câu bot vừa gửi phải là câu hỏi mâu thuẫn ảnh ↔ chữ');
  return t;
}

for (const dap of ['@bot OK', '@bot vâng', '@bot dạ', '@bot ok ạ', '@bot đúng rồi']) {
  test(`#170 tin 10:12 — bot vừa hỏi lại, khách đáp "${dap}": KHÔNG được nuốt`, async () => {
    const t = await denLucBotHoiLai();
    t.clock.advance('6m');
    const truoc = t.channel.sent.length;
    const r = await t.engine.process(chu(dap));
    await t.engine.drain();

    assert.notEqual(r.skipped, 'closer',
      'câu đáp cho chính câu bot vừa hỏi bị coi là tin chào kết — "hỏi lại 1 câu" thành vô dụng');
    const moi = t.channel.sent.slice(truoc);
    assert.ok(moi.length, `khách đáp "${dap}" mà bot im: 0 tin ra (yêu cầu 3: không được nuốt tin)`);
    assert.match(plain(moi.map((m) => m.text).join('\n')), /[Cc]hốt kẹp/,
      'phải chạy tiếp trên hồ sơ mặt hàng đang mở');
  });
}

test('#170 chào kết THẬT vẫn im như cũ: không có câu hỏi nào đang chờ thì "cảm ơn ạ" không gọi gói', async () => {
  // Bản vá chỉ mở đường cho câu đáp của chính câu bot vừa HỎI. Cửa chào kết của Lõi phải còn nguyên
  // tác dụng, nếu không mỗi lời "cảm ơn ạ" lại kéo thêm một tin bot (đúng cái cửa này sinh ra để tránh).
  const { clock, channel, engine } = setup();
  await engine.process(chu(`@bot ${MO_TA}`));
  await engine.drain();
  clock.advance('2m');
  const truoc = channel.sent.length;
  const r = await engine.process(chu('@bot cảm ơn ạ'));
  await engine.drain();
  assert.equal(r.skipped, 'closer', 'chào kết sau câu bot (không có câu hỏi đang chờ) vẫn phải im');
  assert.equal(channel.sent.length, truoc, 'không được gửi thêm tin nào');
});
