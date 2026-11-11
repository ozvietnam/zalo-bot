import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createQueueDb } from '../../gateway/queue-db.js';
import { createQueueManager, computePromptHash } from '../../gateway/queue-manager.js';

test('T802: Đẩy 300 việc lô (priority 9), sau đó đẩy 1 việc khách (priority 0) -> việc khách được thuê trước', () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });

  for (let i = 0; i < 300; i++) {
    manager.enqueue({ kind: 'lo', prompt: `Lô hàng thứ ${i}` });
  }
  const khachJob = manager.enqueue({ kind: 'khach', prompt: 'Hỏi giá cước hải quan' });

  const leased = qDb.leaseJob('tab-alpha');
  assert.ok(leased, 'Phải thuê được việc');
  assert.equal(leased.id, khachJob.jobId, 'Việc khách (priority 0) phải được tab thuê trước 300 việc lô');
  assert.equal(leased.kind, 'khach');
  assert.equal(leased.priority, 0);
});

test('T802: Hạn chờ và ưu tiên mặc định theo kind (khach: 45s/0, nhan-vien: 60s/1, lo: 3600s/9)', () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });

  const jKhach = manager.enqueue({ kind: 'khach', prompt: 'Khách hỏi mã HS' });
  const rowKhach = qDb.getJob(jKhach.jobId);
  assert.equal(rowKhach.priority, 0);
  assert.equal(rowKhach.timeout_ms, 45000);

  const jNhanVien = manager.enqueue({ kind: 'nhan-vien', prompt: 'Nhân viên soạn nháp' });
  const rowNhanVien = qDb.getJob(jNhanVien.jobId);
  assert.equal(rowNhanVien.priority, 1);
  assert.equal(rowNhanVien.timeout_ms, 60000);

  const jLo = manager.enqueue({ kind: 'lo', prompt: 'Việc lô định kỳ' });
  const rowLo = qDb.getJob(jLo.jobId);
  assert.equal(rowLo.priority, 9);
  assert.equal(rowLo.timeout_ms, 3600000);

  // Cho phép ghi đè tường minh priority và timeoutMs
  const jCustom = manager.enqueue({
    kind: 'lo',
    prompt: 'Việc lô ưu tiên cao',
    priority: 2,
    timeoutMs: 120000,
  });
  const rowCustom = qDb.getJob(jCustom.jobId);
  assert.equal(rowCustom.priority, 2);
  assert.equal(rowCustom.timeout_ms, 120000);
});

test('T802: computePromptHash sinh chuỗi băm SHA-256 hex nhất quán và phân biệt tham số', () => {
  const hash1 = computePromptHash('Chỉ dẫn hệ thống', 'Nội dung prompt', '{"type":"object"}');
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'SHA-256 hex phải có đúng 64 ký tự');

  // Cùng tham số -> cùng mã băm
  const hash1Repeat = computePromptHash('Chỉ dẫn hệ thống', 'Nội dung prompt', '{"type":"object"}');
  assert.equal(hash1, hash1Repeat);

  // Tham số null và undefined được chuẩn hoá tương đương
  const hashNull = computePromptHash(null, 'Xin chào', null);
  const hashUndef = computePromptHash(undefined, 'Xin chào', undefined);
  assert.equal(hashNull, hashUndef);

  // Khác tham số -> khác mã băm
  const hashDiff = computePromptHash('Chỉ dẫn khác', 'Nội dung prompt', '{"type":"object"}');
  assert.notEqual(hash1, hashDiff);

  // Chống xung đột phân cách tham số (ví dụ 'a' + 'bc' vs 'ab' + 'c')
  const hA = computePromptHash('a', 'bc', null);
  const hB = computePromptHash('ab', 'c', null);
  assert.notEqual(hA, hB, 'Không được xung đột ghép chuỗi giữa các tham số');
});

test('T802: Hai yêu cầu giống hệt nhau trong 10 phút -> trả kết quả đệm cached: true, không tạo job mới', () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb, cacheTtlMs: 600000 });

  const promptText = 'Mã HS khẩu trang y tế';
  const req1 = manager.enqueue({ kind: 'khach', prompt: promptText });
  assert.equal(req1.cached, false);
  assert.ok(req1.jobId);

  // Ban đầu chưa hoàn thành nên chưa có cache
  const reqIntermediate = manager.enqueue({ kind: 'khach', prompt: promptText });
  assert.equal(reqIntermediate.cached, false, 'Khi job chưa completed thì chưa có kết quả cache');

  // Tab hoàn thành job 1
  qDb.leaseJob('tab-1');
  qDb.completeJob(req1.jobId, 'tab-1', 'Mã HS: 6307.90.90');

  // Đếm số job hiện tại trong gateway_jobs
  const countBefore = db.prepare('SELECT COUNT(*) as c FROM gateway_jobs').get().c;

  // Yêu cầu thứ ba gửi cùng nội dung trong 10 phút
  const reqCached = manager.enqueue({ kind: 'khach', prompt: promptText });
  assert.equal(reqCached.cached, true, 'Yêu cầu trùng lặp phải nhận cached: true');
  assert.equal(reqCached.result, 'Mã HS: 6307.90.90');
  assert.equal(reqCached.jobId, req1.jobId, 'jobId trả về tham chiếu đến job đã hoàn thành');

  // Không tạo thêm job mới trong gateway_jobs
  const countAfter = db.prepare('SELECT COUNT(*) as c FROM gateway_jobs').get().c;
  assert.equal(countAfter, countBefore, 'Không được tạo thêm job thừa trong gateway_jobs khi trúng cache');
});

test('T802: Bỏ qua đệm khi forceRefresh: true hoặc khi cache hết hạn', () => {
  // Test forceRefresh: true
  const db1 = new DatabaseSync(':memory:');
  const qDb1 = createQueueDb(db1);
  qDb1.init();
  const manager = createQueueManager({ queueDb: qDb1, cacheTtlMs: 600000 });
  const promptText = 'Hỏi quy trình nhập khẩu';
  const req1 = manager.enqueue({ kind: 'khach', prompt: promptText });
  qDb1.leaseJob('tab-1');
  qDb1.completeJob(req1.jobId, 'tab-1', 'Kết quả lần 1');

  // Yêu cầu trùng nhưng có forceRefresh: true
  const reqRefreshed = manager.enqueue({ kind: 'khach', prompt: promptText, forceRefresh: true });
  assert.equal(reqRefreshed.cached, false, 'forceRefresh: true phải bỏ qua cache');
  assert.notEqual(reqRefreshed.jobId, req1.jobId, 'Phải tạo job mới với id khác');

  // Test hết hạn cache với cacheTtlMs ngắn trên database riêng biệt
  const db2 = new DatabaseSync(':memory:');
  const qDb2 = createQueueDb(db2);
  qDb2.init();
  const managerShortTtl = createQueueManager({ queueDb: qDb2, cacheTtlMs: 50 }); // 50ms TTL
  const promptExpire = 'Hỏi hạn ngạch đường';
  const reqExpire1 = managerShortTtl.enqueue({ kind: 'khach', prompt: promptExpire });
  const leased = qDb2.leaseJob('tab-1');
  assert.equal(leased?.id, reqExpire1.jobId);
  qDb2.completeJob(reqExpire1.jobId, 'tab-1', 'Kết quả đường');

  // Trúng cache ngay sau khi hoàn thành
  const reqCachedImmediately = managerShortTtl.enqueue({ kind: 'khach', prompt: promptExpire });
  assert.equal(reqCachedImmediately.cached, true);

  // Giả lập làm hết hạn cache trong DB
  db2.exec("UPDATE gateway_cache SET expires_at = datetime('now', '-10 seconds')");
  db2.exec(`UPDATE gateway_jobs SET updated_at = datetime('now', '-700 seconds') WHERE id = '${reqExpire1.jobId}'`);

  const reqAfterExpire = managerShortTtl.enqueue({ kind: 'khach', prompt: promptExpire });
  assert.equal(reqAfterExpire.cached, false, 'Sau khi hết hạn phải tạo job mới');
  assert.notEqual(reqAfterExpire.jobId, reqExpire1.jobId);
});

test('T802: getJobStatus trả về { status, result, error, isExpired } chính xác theo thời gian timeout', () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });

  // Kiểm tra id không tồn tại
  assert.equal(manager.getJobStatus('khong-ton-tai'), null);
  assert.equal(manager.getJobStatus(null), null);

  // 1. Job mới queued
  const j1 = manager.enqueue({ kind: 'khach', prompt: 'Hỏi CO form E' });
  const st1 = manager.getJobStatus(j1.jobId);
  assert.equal(st1.status, 'queued');
  assert.equal(st1.result, null);
  assert.equal(st1.error, null);
  assert.equal(st1.isExpired, false);

  // 2. Job hoàn thành
  qDb.leaseJob('tab-1');
  qDb.completeJob(j1.jobId, 'tab-1', 'CO form E hợp lệ');
  const stCompleted = manager.getJobStatus(j1.jobId);
  assert.equal(stCompleted.status, 'completed');
  assert.equal(stCompleted.result, 'CO form E hợp lệ');
  assert.equal(stCompleted.error, null);
  assert.equal(stCompleted.isExpired, false);

  // 3. Job thất bại
  const jFail = manager.enqueue({ kind: 'khach', prompt: 'Hỏi lỗi' });
  qDb.leaseJob('tab-2');
  qDb.failJob(jFail.jobId, 'tab-2', 'Tab bị crash');
  const stFail = manager.getJobStatus(jFail.jobId);
  assert.equal(stFail.status, 'failed');
  assert.equal(stFail.result, null);
  assert.equal(stFail.error, 'Tab bị crash');
  assert.equal(stFail.isExpired, false);

  // 4. Job quá hạn (isExpired: true) khi chưa hoàn thành và thời gian trôi qua > timeout_ms
  const jTimeout = manager.enqueue({ kind: 'khach', prompt: 'Hỏi việc bị treo', timeoutMs: 45000 });
  // Giả lập mốc created_at lùi về 60 giây trước trong SQLite
  db.exec(`UPDATE gateway_jobs SET created_at = datetime('now', '-60 seconds') WHERE id = '${jTimeout.jobId}'`);

  const stTimeout = manager.getJobStatus(jTimeout.jobId);
  assert.equal(stTimeout.status, 'queued');
  assert.equal(stTimeout.isExpired, true, 'isExpired phải là true khi created_at + timeout_ms < hiện tại');

  // 5. Job đã completed thì dù created_at cũ cũng KHÔNG bị coi là expired
  db.exec(`UPDATE gateway_jobs SET created_at = datetime('now', '-1000 seconds') WHERE id = '${j1.jobId}'`);
  const stOldCompleted = manager.getJobStatus(j1.jobId);
  assert.equal(stOldCompleted.isExpired, false, 'Job đã completed không bao giờ coi là expired');
});

test('T802: Phân biệt cache theo systemInstruction và schemaJson, đọc trực tiếp từ gateway_cache', () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });

  // Hai job cùng prompt nhưng khác schemaJson -> không trúng cache của nhau
  const j1 = manager.enqueue({
    kind: 'khach',
    prompt: 'Báo giá',
    schemaJson: '{"type":"array"}',
  });
  qDb.leaseJob('tab-1');
  qDb.completeJob(j1.jobId, 'tab-1', 'Kết quả array');

  const j2 = manager.enqueue({
    kind: 'khach',
    prompt: 'Báo giá',
    schemaJson: '{"type":"object"}',
  });
  assert.equal(j2.cached, false, 'Khác schemaJson thì không được lấy cache');

  // Đọc trực tiếp từ bản ghi gateway_cache đã tồn tại sẵn
  const testHash = computePromptHash(null, 'Đã đệm từ trước', null);
  db.prepare(`
    INSERT INTO gateway_cache (prompt_hash, result_text, created_at, expires_at)
    VALUES (?, ?, datetime('now'), datetime('now', '+300 seconds'))
  `).run(testHash, 'Kết quả từ gateway_cache');

  const jPreCached = manager.enqueue({ kind: 'khach', prompt: 'Đã đệm từ trước' });
  assert.equal(jPreCached.cached, true);
  assert.equal(jPreCached.result, 'Kết quả từ gateway_cache');
  assert.ok(jPreCached.jobId);
});

test('T802: createQueueManager kiểm tra tham số đầu vào và fallback kind không xác định', () => {
  assert.throws(
    () => createQueueManager(),
    /queueDb là bắt buộc/,
    'Phải ném lỗi nếu không truyền queueDb'
  );

  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });

  // manager.computePromptHash khớp với hàm export độc lập
  assert.equal(
    manager.computePromptHash('sys', 'prompt', 'schema'),
    computePromptHash('sys', 'prompt', 'schema')
  );

  // Fallback kind không xác định -> priority: 0, timeoutMs: 45000
  const jUnknown = manager.enqueue({ kind: 'la-lung', prompt: 'Loại việc lạ' });
  const row = qDb.getJob(jUnknown.jobId);
  assert.equal(row.priority, 0);
  assert.equal(row.timeout_ms, 45000);
});
