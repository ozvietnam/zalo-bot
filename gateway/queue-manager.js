// Quản lý logic hàng đợi cho Cổng AI Studio (Spec 008, FR-002, US1)
// Xếp hàng ưu tiên (khach: 0, nhan-vien: 1, lo: 9), hạn chờ tương ứng và đệm kết quả trùng lặp (10 phút).
import { createHash } from 'node:crypto';

/**
 * Mức ưu tiên chuẩn theo loại việc.
 * Số càng nhỏ thì mức ưu tiên càng cao (0 là cao nhất).
 */
const DEFAULT_PRIORITY = Object.freeze({
  khach: 0,
  'nhan-vien': 1,
  lo: 9,
});

/**
 * Hạn chờ mặc định theo loại việc (mili-giây).
 */
const DEFAULT_TIMEOUT_MS = Object.freeze({
  khach: 45000,
  'nhan-vien': 60000,
  lo: 3600000,
});

/**
 * Tính chuỗi băm SHA-256 từ nội dung yêu cầu để chống trùng lặp.
 * Chuẩn hoá null/undefined thành chuỗi rỗng và serialize mảng JSON để tránh xung đột ghép chuỗi.
 * @param {string | null} [systemInstruction]
 * @param {string} prompt
 * @param {string | null} [schemaJson]
 * @returns {string} Chuỗi băm SHA-256 dạng hex (64 ký tự)
 */
export function computePromptHash(systemInstruction, prompt, schemaJson) {
  const normSys = systemInstruction ?? '';
  const normPrompt = prompt ?? '';
  const normSchema = schemaJson ?? '';
  return createHash('sha256')
    .update(JSON.stringify([normSys, normPrompt, normSchema]))
    .digest('hex');
}

/**
 * Khởi tạo bộ quản lý hàng đợi và đệm kết quả cho Cổng AI Studio.
 * @param {object} options
 * @param {object} options.queueDb - Đối tượng kho lưu trữ queueDb từ createQueueDb
 * @param {number} [options.cacheTtlMs=600000] - Thời gian sống của cache (mặc định 10 phút = 600.000 ms)
 */
export function createQueueManager({ queueDb, cacheTtlMs = 600000 } = {}) {
  if (!queueDb) {
    throw new Error('queueDb là bắt buộc để khởi tạo QueueManager');
  }

  const db = queueDb.db;

  /**
   * Đẩy một yêu cầu vào hàng đợi hoặc trả về kết quả đệm nếu trùng lặp.
   * @param {object} params
   * @param {string} [params.kind='khach'] - Loại việc ('khach', 'nhan-vien', 'lo')
   * @param {string} params.prompt - Nội dung prompt cần AI xử lý
   * @param {string} [params.systemInstruction=null] - Chỉ dẫn hệ thống
   * @param {string} [params.schemaJson=null] - Khuôn JSON mong muốn
   * @param {boolean} [params.forceRefresh=false] - Bỏ qua cache, ép chạy lại
   * @param {number} [params.priority] - Độ ưu tiên ghi đè tường minh
   * @param {number} [params.timeoutMs] - Hạn chờ ghi đè tường minh
   * @returns {{ jobId: string, cached: boolean, result?: string }}
   */
  function enqueue({
    kind = 'khach',
    prompt,
    systemInstruction = null,
    schemaJson = null,
    forceRefresh = false,
    priority,
    timeoutMs,
  } = {}) {
    const prio = priority !== undefined && priority !== null
      ? Number(priority)
      : (DEFAULT_PRIORITY[kind] ?? 0);

    const tMs = timeoutMs !== undefined && timeoutMs !== null
      ? Number(timeoutMs)
      : (DEFAULT_TIMEOUT_MS[kind] ?? 45000);

    const promptText = prompt ?? '';
    const promptHash = computePromptHash(systemInstruction, promptText, schemaJson);
    const ttlSeconds = Math.max(1, Math.ceil(cacheTtlMs / 1000));

    // Kiểm tra đệm kết quả trùng lặp khi không có cờ ép chạy lại
    if (!forceRefresh) {
      // 1. Kiểm tra trực tiếp bảng gateway_cache
      const cacheStmt = db.prepare(`
        SELECT prompt_hash, result_text, created_at, expires_at
        FROM gateway_cache
        WHERE prompt_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
      `);
      const cachedRow = cacheStmt.get(promptHash);

      if (cachedRow) {
        // Tìm job completed gần nhất trong gateway_jobs để lấy jobId tham chiếu nếu có
        const jobStmt = db.prepare(`
          SELECT id FROM gateway_jobs
          WHERE prompt = ?
            AND system_instruction IS ?
            AND schema_json IS ?
            AND status = 'completed'
          ORDER BY updated_at DESC LIMIT 1
        `);
        const prevJob = jobStmt.get(promptText, systemInstruction ?? null, schemaJson ?? null);
        const jobId = prevJob?.id ?? `cache-${promptHash.slice(0, 16)}`;

        return {
          jobId,
          cached: true,
          result: cachedRow.result_text,
        };
      }

      // 2. Kiểm tra các việc đã hoàn thành gần đây trong gateway_jobs trong vòng cacheTtlMs
      const recentJobStmt = db.prepare(`
        SELECT id, result_text, updated_at
        FROM gateway_jobs
        WHERE prompt = ?
          AND system_instruction IS ?
          AND schema_json IS ?
          AND status = 'completed'
          AND result_text IS NOT NULL
          AND updated_at >= datetime('now', '-' || ? || ' seconds')
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      const recentJob = recentJobStmt.get(
        promptText,
        systemInstruction ?? null,
        schemaJson ?? null,
        ttlSeconds
      );

      if (recentJob) {
        // Đồng bộ ghi nhận kết quả vào gateway_cache cho các lần tra cứu sau
        const saveCacheStmt = db.prepare(`
          INSERT INTO gateway_cache (prompt_hash, result_text, created_at, expires_at)
          VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' seconds'))
          ON CONFLICT(prompt_hash) DO UPDATE SET
            result_text = excluded.result_text,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `);
        saveCacheStmt.run(promptHash, recentJob.result_text, ttlSeconds);

        return {
          jobId: recentJob.id,
          cached: true,
          result: recentJob.result_text,
        };
      }
    }

    // Không trúng cache hoặc cờ forceRefresh: true -> Tạo job mới trong hàng đợi
    const newJob = queueDb.createJob({
      kind,
      priority: prio,
      prompt: promptText,
      systemInstruction,
      schemaJson,
      timeoutMs: tMs,
    });

    return {
      jobId: newJob.id,
      cached: false,
    };
  }

  /**
   * Lấy trạng thái hiện tại của một công việc.
   * @param {string} jobId
   * @returns {{ status: string, result: string | null, error: string | null, isExpired: boolean } | null}
   */
  function getJobStatus(jobId) {
    if (!jobId) return null;
    const job = queueDb.getJob(jobId);
    if (!job) return null;

    let isExpired = false;
    if (job.status !== 'completed' && job.status !== 'failed') {
      if (job.created_at) {
        const isoStr = job.created_at.includes('T')
          ? (job.created_at.endsWith('Z') ? job.created_at : `${job.created_at}Z`)
          : `${job.created_at.replace(' ', 'T')}Z`;
        const createdAtMs = Date.parse(isoStr);
        if (!Number.isNaN(createdAtMs) && (Date.now() > createdAtMs + (job.timeout_ms || 45000))) {
          isExpired = true;
        }
      }
    }

    return {
      status: job.status,
      result: job.result_text ?? null,
      error: job.error_reason ?? null,
      isExpired,
    };
  }

  return {
    enqueue,
    getJobStatus,
    computePromptHash,
  };
}
