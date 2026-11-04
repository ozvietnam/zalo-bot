// Che bí mật khỏi log và phát hiện nội dung không được phép lộ ra khách (contracts/send-gate.md, mục 7).

const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BOT_TOKEN = /\bbot[0-9]+:[A-Za-z0-9_-]+/gi;
const LONG_TOKEN = /[A-Za-z0-9+/_-]{32,}={0,2}/g;

const PATH = /(?:^|[\s@"'(=:])(?:\/home\/|\/opt\/|[A-Za-z]:\\)/;
const STACK = /\bat\s+(?:async\s+)?[^\s()]+\s+\([^()\s]*:\d+(?::\d+)?\)|\bat\s+[^\s()]+:\d+:\d+/;
const SECRET = /\bBearer\s|[A-Za-z0-9+/_-]{32,}/i;

/** Thay bí mật bằng '***'. Không động tới văn bản thường (mã HS, số tiền). */
export function redact(s) {
  return String(s ?? '')
    .replace(BEARER, 'Bearer ***')
    .replace(BOT_TOKEN, 'bot***')
    .replace(LONG_TOKEN, '***');
}

/** null nếu sạch; ngược lại loại lộ đầu tiên tìm thấy. */
export function findLeak(s, banned = []) {
  const text = String(s ?? '');
  if (PATH.test(text)) return 'path';
  if (STACK.test(text)) return 'stack';
  if (SECRET.test(text)) return 'secret';
  for (const re of banned) {
    re.lastIndex = 0;
    if (re.test(text)) return 'banned';
  }
  return null;
}
