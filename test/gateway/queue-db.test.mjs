import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createQueueDb } from '../../gateway/queue-db.js';

test('T801: createQueueDb khởi tạo bảng và thực hiện thuê việc nguyên tử (atomic lease)', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  q.createJob({ id: 'job-1', kind: 'khach', priority: 0, prompt: 'Chào bot', timeoutMs: 45000 });
  q.createJob({ id: 'job-2', kind: 'lo', priority: 9, prompt: 'Việc lô', timeoutMs: 3600000 });

  const leased = q.leaseJob('tab-alpha');
  assert.equal(leased?.id, 'job-1', 'Việc khách (priority 0) phải được thuê trước việc lô');
  assert.equal(leased?.status, 'leased');
  assert.equal(leased?.assigned_tab, 'tab-alpha');

  const secondLease = q.leaseJob('tab-beta');
  assert.equal(secondLease?.id, 'job-2', 'Tab tiếp theo nhận việc lô còn lại');
  assert.equal(secondLease?.status, 'leased');
  assert.equal(secondLease?.assigned_tab, 'tab-beta');

  const thirdLease = q.leaseJob('tab-gamma');
  assert.equal(thirdLease, null, 'Hết việc trong hàng đợi thì trả về null');
});

test('T801: reclaimExpiredLeases thu hồi việc bị treo quá 120s về trạng thái queued', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  q.createJob({ id: 'job-timeout', kind: 'khach', priority: 0, prompt: 'Gấp', timeoutMs: 45000 });
  const leased = q.leaseJob('tab-dead');
  assert.ok(leased);

  // Giả lập mốc lease_expires_at trong quá khứ
  db.exec("UPDATE gateway_jobs SET lease_expires_at = datetime('now', '-5 seconds') WHERE id = 'job-timeout'");

  const reclaimedCount = q.reclaimExpiredLeases();
  assert.equal(reclaimedCount, 1, 'Phải thu hồi đúng 1 việc quá hạn thuê');

  const job = q.getJob('job-timeout');
  assert.equal(job.status, 'queued', 'Việc thu hồi phải quay về trạng thái queued');
  assert.equal(job.assigned_tab, null);

  // Sau khi thu hồi, việc có thể được tab khác thuê lại
  const releasable = q.leaseJob('tab-alive');
  assert.equal(releasable?.id, 'job-timeout');
  assert.equal(releasable?.assigned_tab, 'tab-alive');
});

test('T801: createJob lưu đầy đủ các trường và tự sinh id / priority mặc định nếu thiếu', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  const job1 = q.createJob({
    id: 'job-full',
    kind: 'nhan-vien',
    priority: 1,
    prompt: 'Soạn nháp email',
    systemInstruction: 'Bạn là chuyên viên OZ',
    schemaJson: '{"type":"object"}',
    timeoutMs: 60000,
  });

  assert.equal(job1.id, 'job-full');
  assert.equal(job1.kind, 'nhan-vien');
  assert.equal(job1.priority, 1);
  assert.equal(job1.prompt, 'Soạn nháp email');
  assert.equal(job1.system_instruction, 'Bạn là chuyên viên OZ');
  assert.equal(job1.schema_json, '{"type":"object"}');
  assert.equal(job1.timeout_ms, 60000);
  assert.equal(job1.status, 'queued');

  // Kiểm tra tự sinh id và tự suy luận priority mặc định theo kind
  const jobAutoKhach = q.createJob({ prompt: 'Tra cứu mã HS' });
  assert.ok(jobAutoKhach.id);
  assert.equal(jobAutoKhach.kind, 'khach');
  assert.equal(jobAutoKhach.priority, 0);

  const jobAutoLo = q.createJob({ kind: 'lo', prompt: 'Lô 500 dòng' });
  assert.equal(jobAutoLo.priority, 9);

  // Kiểm tra getJob
  const fetched = q.getJob('job-full');
  assert.equal(fetched?.id, 'job-full');
  assert.equal(fetched?.prompt, 'Soạn nháp email');

  assert.equal(q.getJob('khong-ton-tai'), null);
});

test('T801: leaseJob ưu tiên created_at ASC khi cùng priority', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  q.createJob({ id: 'job-early', kind: 'khach', priority: 0, prompt: 'Đến trước' });
  // Chèn việc sau với created_at muộn hơn
  db.exec("INSERT INTO gateway_jobs (id, kind, priority, prompt, status, created_at) VALUES ('job-late', 'khach', 0, 'Đến sau', 'queued', datetime('now', '+1 second'))");

  const first = q.leaseJob('tab-1');
  assert.equal(first?.id, 'job-early', 'Cùng priority thì việc đến trước phải được thuê trước');
});

test('T801: heartbeatJob gia hạn lease thành công khi đúng tabId, từ chối khi sai', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  q.createJob({ id: 'job-hb', kind: 'khach', prompt: 'Cần xử lý lâu' });
  const leased = q.leaseJob('tab-owner');
  assert.ok(leased);

  // Gia hạn với đúng tabId
  const ok = q.heartbeatJob('job-hb', 'tab-owner', 60);
  assert.equal(ok, true, 'Heartbeat với đúng tabId phải thành công');

  // Thử gia hạn với sai tabId
  const failWrongTab = q.heartbeatJob('job-hb', 'tab-impostor', 60);
  assert.equal(failWrongTab, false, 'Heartbeat với tabId giả mạo phải thất bại');

  // Thử gia hạn việc không tồn tại
  const failNonExist = q.heartbeatJob('job-ghost', 'tab-owner', 60);
  assert.equal(failNonExist, false);
});

test('T801: completeJob cập nhật kết quả và trạng thái completed, từ chối khi sai tabId', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  q.createJob({ id: 'job-c', kind: 'khach', prompt: 'Tính thuế' });
  q.leaseJob('tab-worker');

  // Sai tabId không được complete
  const failTab = q.completeJob('job-c', 'tab-other', 'Thuế 10%');
  assert.equal(failTab, false);
  assert.equal(q.getJob('job-c')?.status, 'leased');

  // Đúng tabId hoàn thành công việc
  const ok = q.completeJob('job-c', 'tab-worker', 'Thuế 10%');
  assert.equal(ok, true);

  const doneJob = q.getJob('job-c');
  assert.equal(doneJob?.status, 'completed');
  assert.equal(doneJob?.result_text, 'Thuế 10%');

  // Không thể complete lần nữa khi đã completed
  const okSecond = q.completeJob('job-c', 'tab-worker', 'Đè kết quả');
  assert.equal(okSecond, false);
});

test('T801: failJob ghi nhận lỗi và trạng thái failed, từ chối khi sai tabId', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  q.createJob({ id: 'job-f', kind: 'lo', prompt: 'Dịch thuật' });
  q.leaseJob('tab-worker');

  // Sai tabId không được fail
  const failTab = q.failJob('job-f', 'tab-other', 'Lỗi mạng');
  assert.equal(failTab, false);

  // Đúng tabId ghi nhận lỗi
  const ok = q.failJob('job-f', 'tab-worker', 'Lỗi rate limit 429');
  assert.equal(ok, true);

  const failedJob = q.getJob('job-f');
  assert.equal(failedJob?.status, 'failed');
  assert.equal(failedJob?.error_reason, 'Lỗi rate limit 429');

  // Không thể fail lần nữa khi đã failed
  const okSecond = q.failJob('job-f', 'tab-worker', 'Lỗi khác');
  assert.equal(okSecond, false);
});

test('T801: createQueueDb hỗ trợ mở bằng đường dẫn chuỗi và tạo bảng gateway_cache', () => {
  const q = createQueueDb(':memory:');
  q.init();

  // Kiểm tra bảng gateway_cache tồn tại
  const job = q.createJob({ id: 'job-cache-test', prompt: 'test' });
  assert.ok(job);

  // Kiểm tra bảng gateway_cache có cấu trúc đúng
  assert.doesNotThrow(() => {
    q.db.exec("INSERT INTO gateway_cache (prompt_hash, result_text) VALUES ('hash-1', 'result-1')");
  });
  const cached = q.db.prepare("SELECT * FROM gateway_cache WHERE prompt_hash = 'hash-1'").get();
  assert.equal(cached.result_text, 'result-1');

  q.close();
});
