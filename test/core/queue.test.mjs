// T019 — hàng đợi tuần tự theo khoá (convId): cùng khoá thì một lượt tại một thời điểm.
// core/queue.js thuần túy: không gửi tin, không log (Điều I, Điều IX).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../../core/queue.js';

const ngủ = (ms) => new Promise((r) => setTimeout(r, ms));

// Bộ đếm số lượt đang chạy ĐỒNG THỜI — đo deterministic, không phụ thuộc đồng hồ.
// `maxDong` là số lượt lớn nhất từng chạy cùng lúc.
const demDong = () => {
  const dem = { dang: 0, maxDong: 0 };
  return {
    dem,
    vao: () => { dem.dang++; dem.maxDong = Math.max(dem.maxDong, dem.dang); },
    ra: () => { dem.dang--; },
  };
};

test('cùng khoá: hai lượt chạy TUẦN TỰ theo thứ tự gọi', async () => {
  const q = createQueue();
  const thuTu = [];
  const { dem, vao, ra } = demDong();
  const fn1 = async () => { vao(); await ngủ(50); thuTu.push(1); ra(); };
  const fn2 = async () => { vao(); thuTu.push(2); ra(); };
  const p1 = q.run('conv-a', fn1);
  const p2 = q.run('conv-a', fn2);
  await Promise.all([p1, p2]);
  assert.deepEqual(thuTu, [1, 2]);
  assert.equal(dem.maxDong, 1, 'cùng khoá: TUẦN TỰ — không bao giờ có 2 lượt chạy chồng');
});

test('khác khoá: hai lượt chạy SONG SONG (đếm lượt đồng thời, KHÔNG đo đồng hồ)', async () => {
  const q = createQueue();
  const { dem, vao, ra } = demDong();
  // BỎ khẳng định "tổng < 80 ms": đo thật cho thấy nó ĐỎ NGẪU NHIÊN khi máy tải nặng
  // (2 lượt 50 ms bình thường 49–51 ms, nhưng lúc máy tải nặng có lần đo 99 ms → 11/12 lần
  // chạy đỏ). Ngưỡng thời gian chặt khiến CI đỏ ngẫu nhiên. Thay bằng đếm số lượt
  // CHẠY ĐỒNG THỜI: hàng đợi tuần tự toàn cục sẽ cho maxDong === 1, còn hàng đợi theo
  // khoá đúng sẽ cho maxDong === 2 — đo này deterministic, không bao giờ đỏ vì chậm máy.
  const t0 = Date.now();
  await Promise.all([
    q.run('conv-a', async () => { vao(); await ngủ(50); ra(); }),
    q.run('conv-b', async () => { vao(); await ngủ(50); ra(); }),
  ]);
  const tong = Date.now() - t0;
  assert.equal(dem.maxDong, 2, 'hai khoá khác nhau phải chạy SONG SONG (2 lượt cùng lúc)');
  // Trần RẤT RỘNG — chỉ để bắt treo, KHÔNG bắt chậm máy: ngay cả khi máy quá tải nặng
  // thì 2 lượt 50 ms vẫn dưới 2 s; treo (promise không bao giờ settle) thì vượt trần này.
  assert.ok(tong < 2000, `hai khoá khác nhau bị treo: ${tong} ms`);
});

test('cùng khoá: lượt tạo từ BÊN TRONG lượt trước vẫn KHÔNG chạy chồng (điều kiện dọn khoá)', async () => {
  // Bảo vệ điều kiện `chuoi.get(key) === duoi` trong core/queue.js. Nếu dọn khoá
  // KHÔNG có điều kiện, `finally` của lượt 1 xoá nhầm chuỗi của lượt 2 ⇒ lượt 3 (tạo ra
  // bên trong lượt 2) không thấy chuỗi nào ⇒ CHẠY CHỒNG lượt 2.
  const q = createQueue();
  const { dem, vao, ra } = demDong();
  const thuTu = [];
  const cho = [];   // promise của lượt 3, tạo ra bên trong lượt 2
  const p1 = q.run('k', async () => { vao(); await ngủ(50); thuTu.push(1); ra(); });
  const p2 = q.run('k', async () => {
    vao();
    // lượt 3 được tạo ra TỪ BÊN TRONG lượt 2 (lúc lượt 2 đang chạy)
    cho.push(q.run('k', async () => { vao(); thuTu.push(3); ra(); }));
    await ngủ(100);
    thuTu.push(2); ra();
  });
  await p1;
  await p2;
  await Promise.all(cho);
  assert.equal(dem.maxDong, 1, 'cùng khoá: KHÔNG bao giờ có 2 lượt chạy chồng');
  assert.deepEqual(thuTu, [1, 2, 3]);
});

test('lượt trước ném lỗi thì lượt sau CÙNG khoá vẫn chạy (chuỗi không nhiễm lỗi)', async () => {
  const q = createQueue();
  const thuTu = [];
  const p1 = q.run('conv-a', async () => { await ngủ(10); thuTu.push(1); throw new Error('lỗi lượt 1'); });
  const p2 = q.run('conv-a', async () => { thuTu.push(2); });
  await assert.rejects(p1, /lỗi lượt 1/);   // lỗi phải trả về cho người gọi (webhook.js bắt và log)
  await p2;                                // lượt sau vẫn phải chạy
  assert.deepEqual(thuTu, [1, 2]);
});

test('xong hết thì size() === 0 (không rò bộ nhớ)', async () => {
  const q = createQueue();
  await q.run('conv-a', async () => {});
  await q.run('conv-a', async () => {});
  await q.run('conv-b', async () => {});
  assert.equal(q.size(), 0);
});

test('run() resolve bằng kết quả của fn và reject khi fn ném lỗi', async () => {
  const q = createQueue();
  assert.equal(await q.run('k', async () => 42), 42);
  await assert.rejects(q.run('k', async () => { throw new Error('x'); }), /x/);
  assert.equal(q.size(), 0);
});

test('size() đếm số khoá đang có chuỗi chờ', async () => {
  const q = createQueue();
  const p1 = q.run('conv-a', async () => { await ngủ(30); });
  const p2 = q.run('conv-a', async () => { await ngủ(30); });
  assert.equal(q.size(), 1, 'hai lượt cùng khoá = MỘT chuỗi');
  q.run('conv-b', async () => { await ngủ(30); });
  assert.equal(q.size(), 2);
  await Promise.all([p1, p2]);
});
