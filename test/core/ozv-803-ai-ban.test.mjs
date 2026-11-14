// OZV-803: khách thật nhận câu "AI bận hoặc quá thời gian" (1/1 lượt tra cứu hỏng trong 24h, 13/11).
//
// Câu đó là chữ của CỔNG (`ketQua.nextAction.reasonVi`), bot chỉ in lại — `packs/hs/render.js:436`.
// Bản sửa đã có hai mảnh: đường chờ-trong-lượt (OZV-769, #227) và đường việc nền bền (OZV-779, #229).
// Nhưng test cũ của hai mảnh đó đều dùng GÓI GIẢ cắm tay `laRetry`; chưa ca nào chạy GÓI hs THẬT
// đầu-cuối qua engine.process() + engine.drain(). Tệp này khoá đúng chỗ đó, bằng số:
//   A. Cổng trả verdict RETRY ở lượt hỏi đầu → khách KHÔNG nhận câu "AI bận", lõi gọi lại.
//   B. Cổng hồi phục ở lần gọi lại → khách nhận MÃ HS thật (đúng cái khách hỏi).
//   C. ĐỐI CHỨNG bản đang chạy a84e8bb (lõi chưa biết đọc verdict): bỏ `laRetry` khỏi gói thì câu
//      "AI bận" quay lại ngay lượt hỏi đầu — chứng minh hai ca trên không xanh nhờ may.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import hsPack from '../../packs/hs/index.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z';   // 10:00 giờ VN
const silent = { info() {}, error() {} };
const MO_TA = 'máy bơm ly tâm 1.5HP 220V thân gang bơm nước sinh hoạt';

/** Verdict thật của Cổng OZ trong lượt hỏng 13/11 (ẩn danh, chỉ giữ phần hợp đồng). */
const RETRY_KQ = {
  ok: true, trangThai: 'XONG',
  ketQua: {
    status: 'NEEDS_EXPERT', results: [],
    nextAction: { type: 'RETRY', reasonCode: 'ENGINE_TIMEOUT', reasonVi: 'AI bận hoặc quá thời gian — gọi lại sau ít phút.' },
  },
};
const KET_QUA_THAT = {
  ok: true, trangThai: 'XONG',
  ketQua: { status: 'OK', results: [{ hsCode: '84137090', confidence: 0.86, reason: 'Bơm ly tâm khác' }] },
};

/**
 * Một lượt khách thật: gửi mô tả hàng → gói 1 mở lượt Cổng (DANG_XU_LY) → lõi hỏi kết quả theo nhịp.
 * `kq(lanThu)` quyết định Cổng trả gì ở lần hỏi thứ mấy. Trả về số lần Cổng bị hỏi + tin đã gửi khách.
 */
async function chay({ pack = hsPack, kq, moc = ['6s', '20s', '60s', '60s'] }) {
  let goi = 0;
  const mcp = fakeMcp({
    phan_loai_hs: () => ({ ok: true, maLuot: 'L-803', trangThai: 'DANG_XU_LY' }),
    ket_qua_phan_loai: () => { goi++; return kq(goi); },
  });
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  channel.typing = async () => {};
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config: {}, store, channel, mcp, vision: null, registry: createRegistry([pack]), gate, now: clock.now, log: silent });

  await engine.process({
    updateKey: 'u1', event: 'message.text.received', chatId: 'c1', userId: 'k1', userName: 'Khách',
    chatType: 'PRIVATE', text: MO_TA, photoUrl: null, caption: null, messageId: 'm1',
  });
  const sauLuot = { goi, tin: channel.sent.length };
  const nhip = [];
  for (const b of moc) {
    clock.advance(b);
    await engine.drain();
    nhip.push({ moc: b, goi, tin: channel.sent.length });
  }
  return { goi, nhip, sauLuot, sent: channel.sent, cuoi: channel.sent.at(-1)?.text ?? '' };
}

test('OZV-803 ca A: Cổng trả verdict RETRY → khách KHÔNG nhận câu "AI bận" ở lượt hỏi đầu, lõi gọi lại', async () => {
  const r = await chay({ kq: () => RETRY_KQ });

  // Lượt hỏi đầu (6s): đã hỏi Cổng một lần, nhưng chưa có tin kết quả nào thêm cho khách.
  assert.equal(r.nhip[0].goi, 1, 'lượt 6s: lõi hỏi Cổng một lần');
  assert.equal(r.nhip[0].tin, r.sauLuot.tin, 'lượt 6s: KHÔNG đẩy khách câu "AI bận" — lõi hẹn gọi lại');
  for (const m of r.sent.slice(0, r.nhip[0].tin)) {
    assert.doesNotMatch(m.text, /AI bận/, 'không tin nào trước lần gọi lại chứa "AI bận"');
  }
  // Gọi lại đúng bảng giãn cách của gói (packs/hs/jobs.js:29 — 20s rồi 60s), tối đa RETRY_TOI_DA = 2.
  assert.equal(r.nhip[1].goi, 2, 'sau 20s: gọi lại lần 1');
  assert.equal(r.nhip[2].goi, 3, 'sau 60s nữa: gọi lại lần 2');
  assert.equal(r.goi, 3, 'hết lượt gọi lại thì dừng, không quay vòng vô hạn');
  // Cổng bận suốt → câu cuối là verdict trung thực của Cổng, KHÔNG bịa mã HS (Điều II).
  assert.match(r.cuoi, /AI bận/, 'cạn lần gọi lại thì nói thật với khách');
  assert.doesNotMatch(r.cuoi, /\d{8}/, 'không bịa mã HS khi Cổng chưa trả kết quả');
});

test('OZV-803 ca B: Cổng hồi phục ở lần gọi lại → khách nhận MÃ HS thật, không thấy câu "AI bận"', async () => {
  const r = await chay({ kq: (n) => (n <= 2 ? RETRY_KQ : KET_QUA_THAT) });

  assert.equal(r.goi, 3, 'hai lần đầu Cổng bận, lần thứ ba có kết quả');
  assert.match(r.cuoi, /8413\.?70\.?90/, 'khách nhận đúng mã HS của mặt hàng');
  for (const m of r.sent) assert.doesNotMatch(m.text, /AI bận/, 'khách không hề thấy câu "AI bận"');
});

test('OZV-803 ca C (đối chứng bản cũ a84e8bb): gói không khai laRetry → "AI bận" lọt ngay lượt hỏi đầu', async () => {
  // Bản đang chạy trên bot thật tụt 27 commit sau main: lõi chưa gọi `pack.laRetry` nên verdict RETRY
  // bị coi là "kết quả đã xong" và đẩy thẳng cho khách. Dựng lại đúng lớp lỗi đó bằng cách gỡ bộ đọc.
  const packCu = { ...hsPack, laRetry: undefined, RETRY_CHO_MS: undefined };
  const r = await chay({ pack: packCu, kq: (n) => (n <= 2 ? RETRY_KQ : KET_QUA_THAT) });

  assert.equal(r.goi, 1, 'bản cũ hỏi Cổng đúng một lần rồi bỏ khách');
  assert.match(r.cuoi, /AI bận/, 'bản cũ đẩy thẳng câu "AI bận" — đúng cái khách nhận hôm 13/11');
  assert.doesNotMatch(r.cuoi, /8413\.?70\.?90/, 'bản cũ không bao giờ lấy được mã HS mà Cổng sẵn sàng trả');
});
