// core/health.js — payload /health: nói thời điểm container khởi động và version đang chạy.
// Mục đích: xác minh production đã build lại với code mới mà không cần log.
export function createHealthPayload({ mode, startedAt = new Date(), version } = {}) {
  return {
    ok: true,
    mode,
    startedAt: new Date(startedAt).toISOString(),
    ...(version ? { version } : {}),
  };
}
