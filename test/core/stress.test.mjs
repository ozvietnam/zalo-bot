// T020 / SC-001 (specs/001-nen-tang-chung/spec.md:262): phát lại 1.000 update có 10 % gửi lại,
// ép khởi động lại 3 lần → mỗi updateKey có ĐÚNG MỘT bộ tin ra, không updateKey nào thiếu tin ra.
// "Khởi động lại" = đóng store, mở lại cùng tệp db, rồi gate.recover() + engine.recover() như server.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import { createQueue } from '../../core/queue.js';
import { isQuietHours } from '../../core/time.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN
const silent = { info() {}, warn() {}, error() {} };
const SO_UPDATE = 1000;
const SO_PHONG = 100;
// Tồn đọng của MỘT người, phát lại hết trong một lần recover(): phải lớn hơn ngưỡng rateLimitPerMin
// (mặc định 10, `core/engine.js:38-45`). Đường thường không bao giờ gộp nhiều giờ lưu lượng vào một cửa
// sổ 60 giây (1.000 tin / 100 phòng rải theo thời gian), nên chỉ tồn đọng này mới chạm ngưỡng đó.
const SO_TON = 14;
const TON_TU = SO_UPDATE + 1;   // updateKey u1001..u1014, phòng riêng để không chen vào phép đếm trên
const SO_RA = SO_UPDATE + SO_TON;

// Câu trả lời mang updateKey nên: (1) đếm được tin ra của từng lượt, (2) hai lượt khác nhau không
// giống nhau nên luật chống trùng nội dung không chen vào phép đếm của SC-001.
const pack = {
  id: 'spy', ten: 'Spy', version: '1', audience: 'public', priority: 50, match: () => true,
  async handle(turn) { return { replies: [{ text: `Kết quả cho lượt ${turn.turnId}` }], evidence: [] }; },
};

/** Trần ngày phải tắt: 1.000 tin / 100 phòng = 10 tin mỗi phòng, vượt CAP_CHAT_DAY=8 mặc định.
 *  SC-001 đo mất tin và trùng tin, không đo trần — trần đã có test riêng ở gate-decide. */
const RULES = { capChatDay: 10_000, capGroupDay: 10_000, capAllDay: 10_000 };

const upd = (i) => {
  const phong = i % SO_PHONG;
  return {
    updateKey: `u${i}`, event: 'message.text.received', chatId: `c${phong}`, userId: `u${phong}`,
    userName: `Khách ${phong}`, chatType: 'PRIVATE', text: `hỏi số ${i}`, photoUrl: null, caption: null, messageId: `u${i}`,
  };
};

test('SC-001: 1.000 update (100 phòng, 10 % gửi lại) + 3 lần khởi động lại → mỗi updateKey đúng 1 bộ tin ra', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oz-stress-'));
  const dbPath = join(dir, 'bot.db');
  const clock = fakeClock(START);
  // Kênh giả có đóng dấu GIỜ GỬI: cần để khẳng định không tin nào bay ra trong giờ yên.
  // Bọc tại chỗ, không sửa fakeChannel dùng chung.
  const goc = fakeChannel();
  const channel = {
    ...goc,
    async sendText(chatId, text) {
      await goc.sendText(chatId, text);
      goc.sent[goc.sent.length - 1].at = clock.now().toISOString();
    },
  };
  let may;
  /** Mở lõi trên cùng tệp db — như một tiến trình mới (server.js). */
  const boot = () => {
    const store = openStore(dbPath);
    const gate = createGate({ store, channel, rules: RULES, now: clock.now, log: () => {} });
    const queue = createQueue();
    const engine = createEngine({
      store, channel, mcp: null, registry: createRegistry([pack]), gate, now: clock.now, log: silent,
      runTask: (key, fn) => queue.run(key, fn),
    });
    may = { store, gate, engine };
    return may;
  };

  try {
    boot();
    // Đường vào như webhook: ghi inbox (pending) rồi giao engine (không chờ — webhook đã ack 200).
    // Phần lớn lượt chạy xong bình thường; chỉ ở 3 mốc sập thì một nhúm lượt đang bay bị bỏ dở.
    // 3 lần khởi động lại ép buộc (SC-001). Giá trị = mốc đồng hồ lúc bot LÊN LẠI, để khe khởi động lại
    // dài hơn directReplyMs (10 phút) — ca thật: crash-loop có backoff, VPS sập đêm, deploy kẹt.
    // Lần thứ ba lên lại GIỮA GIỜ YÊN: tin phát lại phải hoãn tới 07:00 chứ không nhắn khách lúc 1 giờ sáng,
    // và tới sáng vẫn phải tới đủ — nếu bị `reject proactive-no-debt` thì đây là mất tin, test đỏ ngay.
    const moc = new Map([
      [300, '2026-11-04T05:00:00.000Z'],   // 12:00 VN — khe 2 giờ, ban ngày
      [600, '2026-11-04T09:30:00.000Z'],   // 16:30 VN — khe 4 giờ rưỡi, ban ngày
      [900, '2026-11-04T18:00:00.000Z'],   // 01:00 VN — GIỮA GIỜ YÊN 23:00–07:00
    ]);
    let dangChay = [];
    for (let i = 1; i <= SO_UPDATE; i++) {
      const u = upd(i);
      clock.advance(1000);                       // khách nhắn rải ra theo thời gian
      const at = clock.now().toISOString();      // webhook ghi received_at = lúc nhận (core/webhook.js)
      const ghi = () => may.store.inbox.insertIgnore({ update_key: u.updateKey, chat_id: u.chatId, user_id: u.userId, raw: JSON.stringify(u), received_at: at });
      ghi();
      dangChay.push(may.engine.process(u).catch(() => {}));
      // 10 % gửi lại cùng message_id (Zalo không nhận được ack): đúng đường webhook, insertIgnore chặn.
      if (i % 10 === 0) {
        ghi();
        dangChay.push(may.engine.process(u).catch(() => {}));
      }
      if (moc.has(i)) {
        if (i === 900) {
          // Ca "VPS sập buổi tối": webhook đã ack 200 cho 14 tin của CÙNG một khách, rải trên gần 2 giờ,
          // rồi tiến trình chết trước khi xử lý. Cả 14 dòng pending này được phát lại trong MỘT lần
          // recover() ở cùng một mốc now() → chạm ngưỡng rateLimitPerMin=10 của bộ chặn tốc độ.
          // Nếu bộ chặn đo cả lượt phát lại thì tin thứ 11 nhận câu "gửi hơi nhanh" (không mang updateKey
          // → đỏ ở khẳng định dòng 138) và các tin sau bị cửa drop vì trùng → "thiếu tin ra", đỏ SC-001.
          for (let k = 0; k < SO_TON; k++) {
            const key = `u${TON_TU + k}`;
            may.store.inbox.insertIgnore({
              update_key: key, chat_id: 'cton', user_id: 'uton',
              raw: JSON.stringify({ ...upd(i), updateKey: key, chatId: 'cton', userId: 'uton', messageId: key, text: `tồn đọng ${k}` }),
              received_at: new Date(Date.parse('2026-11-04T14:00:00.000Z') + k * 8 * 60_000).toISOString(),
            });
          }
        }
        // Sập: KHÔNG chờ các lượt đang bay. Dòng inbox của chúng còn 'pending' hoặc 'processing'.
        may.store.close();
        dangChay = [];
        clock.set(moc.get(i));   // bot nằm im một lúc rồi mới lên lại
        boot();
        may.gate.recover();
        await may.engine.recover();
        await may.gate.sweep();
      } else if (i % 25 === 0) {
        // Để phần lớn lượt kịp chạy XONG trên đường thường (nếu chờ hết ở cuối thì recover() làm
        // gần như cả 1.000 lượt, và test không còn kiểm đường thường nữa).
        await Promise.all(dangChay);
        dangChay = [];
      }
    }
    await Promise.all(dangChay);

    // Khởi động lại lần cuối: nhặt những lượt mà db đã đóng giữa chừng (lỗi, dòng còn pending).
    may.store.close();
    boot();
    may.gate.recover();
    let vong = 0;
    for (; vong < 10 && (await may.engine.recover()) > 0; vong++) { /* nhặt tới hết */ }
    assert.ok(vong < 10, 'recover() không bao giờ cạn — dòng inbox bị nhặt lại vô hạn');
    await may.gate.sweep();

    // Lượt phát lại trong giờ yên đã được hoãn tới 07:00 VN (đúng FR-005) — chạy đồng hồ tới sáng và
    // quét, vì SC-001 đo "số tin khách bị mất = 0": hoãn rồi giao là ĐẠT, chặn luôn là mất tin.
    assert.equal(may.store.outbox.queued().length, 0, 'không còn dòng queued mồ côi sau recover');
    // Đếm NGAY ĐÂY, trước lượt quét sáng: sweepRow ghi lại `reason` của dòng thành 'ok' khi giao được,
    // nên đếm sau khi quét sẽ ra 0 và khẳng định "không rỗng" ở cuối test sẽ sai.
    let demHoan = 0;
    for (let id = 1; id <= SO_UPDATE * 2; id++) {
      if (may.store.outbox.get(id)?.reason === 'quiet-hours') demHoan++;
    }

    clock.advance('8h');                 // 09:00 VN hôm sau, qua mốc 07:00
    for (let q = 0; q < 10 && (await may.gate.sweep()) > 0; q++) { /* giao hết tin đã hoãn */ }

    const demTheoLuot = new Map();
    for (const m of channel.sent) {
      const k = /lượt (u\d+)$/.exec(m.text)?.[1];
      assert.ok(k, `tin ra không mang updateKey: ${m.text.slice(0, 60)}`);
      demTheoLuot.set(k, (demTheoLuot.get(k) ?? 0) + 1);
    }
    const trung = [...demTheoLuot].filter(([, n]) => n > 1);
    assert.deepEqual(trung, [], `tin TRÙNG (phải = 0): ${JSON.stringify(trung.slice(0, 10))}`);

    const thieu = [];
    for (let i = 1; i <= SO_RA; i++) if (!demTheoLuot.has(`u${i}`)) thieu.push(`u${i}`);
    assert.deepEqual(thieu, [], `updateKey THIẾU tin ra (phải = 0, có ${thieu.length}): ${JSON.stringify(thieu.slice(0, 10))}`);

    assert.equal(demTheoLuot.size, SO_RA);
    assert.deepEqual(may.store.inbox.pending(), [], 'không còn dòng inbox nào treo');

    // Hiến pháp "Ràng buộc kỹ thuật" + FR-005: trong giờ yên 23:00–07:00 VN chỉ được gửi tin TRẢ LỜI
    // TRỰC TIẾP (khách vừa nhắn trong 10 phút); tin cũ hơn thế phải hoãn tới 07:00.
    // Đây là chốt chặn cho đúng lỗi của bản đầu: lượt phát lại đóng dấu now() nên cửa tưởng mọi tin cũ
    // đều là "trả lời trực tiếp" và gửi lúc 1 giờ sáng — không mất tin nào, nên phép đếm trên vẫn xanh.
    const nhanLuc = new Map();   // updateKey → lúc khách nhắn thật (received_at webhook đã ghi)
    for (let i = 1; i <= SO_RA; i++) nhanLuc.set(`u${i}`, may.store.inbox.get(`u${i}`)?.received_at);
    const banDem = channel.sent.filter((m) => {
      if (!isQuietHours(m.at)) return false;
      const k = /lượt (u\d+)$/.exec(m.text)?.[1];
      return Date.parse(m.at) - Date.parse(nhanLuc.get(k)) > 600_000;   // directReplyMs
    });
    assert.deepEqual(banDem.map((m) => m.at), [], `có ${banDem.length} tin CŨ gửi trong giờ yên (phải = 0)`);

    // Và luật đó không được "đạt" bằng cách chặn tin: phải có lượt THẬT đi qua đường hoãn-giờ-yên,
    // nếu không thì khẳng định trên là rỗng (ca phát lại ban đêm chưa bao giờ xảy ra trong test).
    assert.ok(demHoan > 0, 'không lượt nào đi qua đường hoãn giờ yên — khẳng định giờ yên thành rỗng');
  } finally {
    try { may?.store.close(); } catch { /* đã đóng */ }
    rmSync(dir, { recursive: true, force: true });
  }
});
