// scripts/giam-sat/time-util.js
// Tiện ích xử lý mốc thời gian lọc dữ liệu cho agent giám sát theo múi giờ Việt Nam (UTC+7).
import { vnDateKey } from '../../core/time.js';

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Trả về mốc thời gian đầu ngày và cuối ngày theo giờ VN, biểu diễn dưới dạng chuỗi ISO UTC.
 * @param {string} [ngayYmd] Chuỗi ngày định dạng 'YYYY-MM-DD'. Nếu bỏ trống sẽ lấy ngày VN hiện tại.
 * @returns {{ ngayVn: string, dauNgayUtc: string, cuoiNgayUtc: string }}
 */
export function layKhoangNgayVnUtc(ngayYmd) {
  const ngayVn = ngayYmd || vnDateKey(new Date());
  const [y, m, d] = ngayVn.split('-').map(Number);

  // 00:00:00.000 giờ VN = 17:00:00.000 UTC của ngày hôm trước
  const dauNgayMs = Date.UTC(y, m - 1, d) - VN_OFFSET_MS;
  // 23:59:59.999 giờ VN = 16:59:59.999 UTC của ngày hôm nay
  const cuoiNgayMs = dauNgayMs + DAY_MS - 1;

  return {
    ngayVn,
    dauNgayUtc: new Date(dauNgayMs).toISOString(),
    cuoiNgayUtc: new Date(cuoiNgayMs).toISOString()
  };
}
