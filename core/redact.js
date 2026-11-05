// Che bí mật khỏi log và phát hiện nội dung không được phép lộ ra khách (contracts/send-gate.md, mục 7).

const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BOT_TOKEN = /\bbot[0-9]+:[A-Za-z0-9_-]+/gi;
const LONG_RUN = /[A-Za-z0-9+/_]{32,}={0,2}/g;

const PATH = /(?:^|[\s@"'(=:])(?:\/home\/|\/opt\/|[A-Za-z]:\\)/;
// Chỉ `at <tên> (<đường dẫn>:dòng:cột)` hoặc `at <tệp>.js|mjs|cjs:dòng:cột`; "at 9:30:00" không tính.
const STACK = /\bat\s+(?:async\s+)?[^\s()]+\s+\([^()\s]+:\d+:\d+\)|\bat\s+[^\s()]+\.(?:js|mjs|cjs):\d+:\d+/;
// Dạng token rõ ràng; chuỗi dài chung chung xét riêng (phải có cả chữ và số).
const SECRET_SHAPES = /\bBearer\s+\S+|\bbot\d+:[\w-]+|\bsk-[\w-]{16,}|\bEAA[A-Za-z0-9]{20,}/;
const URL_RE = /https?:\/\/\S+|\b[\w-]+\.(?:com|vn|net|org|cn)\S*/gi;
const looksSecret = (run) => /\d/.test(run) && /[A-Za-z]/.test(run);

/** Thay bí mật bằng '***'. Không động tới văn bản thường (mã HS, số tiền). */
export function redact(s) {
  return String(s ?? '')
    .replace(BEARER, 'Bearer ***')
    .replace(BOT_TOKEN, 'bot***')
    .replace(LONG_RUN, (m) => (looksSecret(m) ? '***' : m));
}

/** null nếu sạch; ngược lại loại lộ đầu tiên tìm thấy. */
export function findLeak(s, banned = []) {
  const text = String(s ?? '');
  if (PATH.test(text)) return 'path';
  if (STACK.test(text)) return 'stack';
  const noUrl = text.replace(URL_RE, ' ');
  if (SECRET_SHAPES.test(noUrl)) return 'secret';
  for (const run of noUrl.match(LONG_RUN) || []) if (looksSecret(run)) return 'secret';
  for (const re of banned) {
    re.lastIndex = 0;
    if (re.test(text)) return 'banned';
  }
  return null;
}
