// Soạn dòng chữ cho nhóm nhân viên: che TỪNG DÒNG, giờ VN, cắt cho gọn mắt.
// Tách khỏi `core/handoff-ticket.js` ở T036 để `core/handoff-hoso.js` (lệnh `/ho-so`) dùng ĐÚNG luật che
// của phiếu thay vì chép lại — chép thì hai bản sẽ lệch nhau ở lần sửa sau (Điều VI, Điều IX).
//
// Luật che TỪNG DÒNG là điểm cốt tử (học từ T024/T035): `redact` chỉ xoá dạng đã biết (Bearer, token
// dài), không bắt đường dẫn máy chủ hay stack. Nếu để cửa dò trên CẢ tin thì một dòng bẩn (tên Zalo
// của khách đặt là `/home/...`) làm mất CẢ tin — Điều IX chặn được, nhưng nhân viên không biết khách
// đang chờ, trái Điều II. Che từng dòng thì chỉ dòng bẩn bị thay, các dòng khác vẫn tới tay người.
import { redact, findLeak } from './redact.js';
import { vnGioNgay } from './time.js';

/** Cắt mỗi dòng tin cho gọn mắt; cửa vẫn tự chia tin dài nếu cần. */
export const LINE_MAX = 200;

const SPEAKER = { khach: 'khách', bot: 'bot', 'nhan-vien': 'nhân viên' };

/**
 * @param {object} o
 * @param {RegExp[]} [o.banned] `config.bannedPatterns`
 */
export function taoDong({ banned = [] } = {}) {
  /**
   * Một dòng chữ NGƯỜI NGOÀI gõ được (lời khách, tên khách, dòng hồ sơ, ghi chú của nhân viên).
   * Hai việc bắt buộc: gộp khoảng trắng về MỘT dấu cách (lời khách còn `\n` sẽ sinh dòng giả — khách
   * gõ "Lý do: …" và nhân viên tưởng là dòng thật của phiếu), rồi `redact` + `findLeak` trên CHÍNH
   * dòng này.
   */
  function dongSach(s, nhan = 'dòng') {
    const raw = redact(String(s ?? '')).replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    return findLeak(raw, banned) ? `(${nhan} bị che: có dấu hiệu lộ thông tin nội bộ)` : raw;
  }

  /** Một dòng tin cho nhóm: `- <giờ VN> <ai>: <nội dung đã che>`. */
  function dongTin(m) {
    const who = SPEAKER[m.speaker] ?? m.speaker;
    const body = dongSach(m.text);
    const cut = body.length > LINE_MAX ? `${body.slice(0, LINE_MAX)}…` : body;
    return `- ${vnGioNgay(m.at)} ${who}: ${cut || '(tin rỗng)'}`;
  }

  /** Tên khách để nhân viên nhận ra ai đang chờ; tên do khách đặt nên cũng phải che và gộp dòng. */
  const nhanDang = (convId, row) => `${dongSach(row?.display_name, 'tên') || '(chưa có tên)'} (${convId})`;

  /** Nhiều dòng từ một khối chữ nhiều dòng (tóm tắt hồ sơ): che từng dòng, bỏ dòng rỗng. */
  const khoiSach = (text) => String(text ?? '').split('\n').map((d) => dongSach(d)).filter(Boolean);

  return { dongSach, dongTin, nhanDang, khoiSach };
}
