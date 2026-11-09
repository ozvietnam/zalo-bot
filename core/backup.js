// Sao lưu db mỗi ngày 03:00 giờ VN (T036, FR-028 `specs/001-nen-tang-chung/spec.md:253`;
// lược đồ ở `specs/001-nen-tang-chung/data-model.md:172`).
//
// run() → sao `DATA_DIR/bot.db` sang `DATA_DIR/backup/bot-<ngày VN>.db`, giữ 7 bản mới nhất
//
// Ba điều đã khoá bằng test ở `test/core/backup.test.mjs`:
//  1. Ngày trong TÊN TỆP là ngày VN (`vnDateKey`), mốc trong `meta.last_backup_at` là ISO UTC. 03:00 VN
//     rơi vào 20:00 UTC của NGÀY TRƯỚC, nên lấy ngày UTC thì tên tệp lệch một ngày.
//  2. Điều kiện chạy gồm CẢ `meta.last_backup_at` khác ngày VN, không chỉ `vnHour === 3`: bộ quét gọi
//     mỗi phút nên trong giờ 03 có 60 lần gọi, thiếu mốc này thì lần thứ hai ném "output file already
//     exists" mỗi phút suốt một giờ.
//  3. KHÔNG ném ra ngoài. Bộ quét nền của `server.js` gọi hàm này; một lỗi đĩa đầy làm cả bộ quét chết
//     thì tin hoãn và phiếu gộp cũng dừng theo (Điều VII: sai thì dừng *việc đó*, không kéo cả bot).
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { vnDateKey, vnHour } from './time.js';
import { redact } from './redact.js';

/** Giờ VN chạy sao lưu: 03:00, lúc ít khách nhất (FR-028). */
export const GIO_SAO_LUU = 3;
/** Số bản sao giữ lại (FR-028). Bản thứ 8 trở đi bị xoá, cũ nhất trước. */
export const SO_BAN_GIU = 7;
/** Tên bản sao: `bot-YYYY-MM-DD.db`. Dùng cả để tạo và để nhận ra bản của bot khi dọn. */
const TEN_RE = /^bot-(\d{4}-\d{2}-\d{2})\.db$/;

/**
 * @param {object} o
 * @param {object} o.store      store đang mở (`core/store.js`) — dùng `vacuumInto` và `meta`
 * @param {string} o.dataDir    `config.dataDir`; bản sao vào `<dataDir>/backup/`
 * @param {() => Date} o.now
 * @param {(...a: any[]) => void} [o.log]
 */
export function createBackup({ store, dataDir, now, log = () => {} }) {
  const thuMuc = join(dataDir, 'backup');
  const bo = (reason, extra = {}) => ({ status: 'skipped', reason, ...extra });

  /** Bản sao của bot trong thư mục, mới nhất đứng cuối. Tệp khác (ghi chú của người vận hành, bản sao
   *  tay) KHÔNG vào danh sách này nên không bao giờ bị dọn. */
  function danhSach() {
    try {
      return readdirSync(thuMuc).filter((f) => TEN_RE.test(f)).sort();
    } catch {
      return []; // chưa có thư mục: lần sao lưu đầu tiên
    }
  }

  /** Giữ `SO_BAN_GIU` bản mới nhất; trả tên các bản đã xoá. Xoá lỗi thì bỏ qua: bản sao mới đã có rồi. */
  function don() {
    const cu = danhSach();
    const xoa = cu.slice(0, Math.max(0, cu.length - SO_BAN_GIU));
    const daXoa = [];
    for (const f of xoa) {
      try { rmSync(join(thuMuc, f)); daXoa.push(f); }
      catch (e) { log('không xoá được bản sao cũ', f, redact(e?.message)); }
    }
    return daXoa;
  }

  /**
   * Một nhịp sao lưu. Chỉ thật sự sao khi ĐANG ở giờ 03 giờ VN và hôm nay (theo ngày VN) chưa sao.
   * @returns {Promise<{status:'created'|'skipped'|'error', reason?:string, path?:string, xoa?:string[]}>}
   */
  async function run() {
    const hienTai = now();
    if (vnHour(hienTai) !== GIO_SAO_LUU) return bo('khong-dung-gio');
    const ngay = vnDateKey(hienTai);
    const path = join(thuMuc, `bot-${ngay}.db`);
    try {
      // Mốc cũ so theo NGÀY VN, không so chuỗi: mốc lưu là ISO UTC nên 03:00 và 03:30 VN cùng ngày VN
      // mà khác chuỗi hoàn toàn.
      const truoc = store.meta.get('last_backup_at');
      if (truoc && vnDateKey(truoc) === ngay) return bo('da-sao-luu-hom-nay', { path });
      mkdirSync(thuMuc, { recursive: true });
      // Tệp của hôm nay đã có mà `meta` không biết (db bị phục hồi từ bản cũ, hoặc người vận hành
      // sao tay): `VACUUM INTO` sẽ ném vì SQLite không ghi đè. Ghi lại mốc rồi thôi — đè lên bản sao
      // đã có là tự tay phá chính cái mình đang giữ.
      if (danhSach().includes(`bot-${ngay}.db`)) {
        store.meta.set('last_backup_at', hienTai.toISOString());
        return bo('da-co-tep', { path });
      }
      store.vacuumInto(path);
      // Mốc ghi SAU khi bản sao đã nằm trên đĩa: ghi trước mà VACUUM lỗi thì hôm đó không còn bản nào
      // và `meta` lại khai là đã sao (Điều IV: bằng chứng thắng lời khai).
      store.meta.set('last_backup_at', hienTai.toISOString());
      const xoa = don();
      log(`đã sao lưu db: bot-${ngay}.db${xoa.length ? `, xoá ${xoa.length} bản cũ` : ''}`);
      return { status: 'created', path, xoa };
    } catch (e) {
      log('sao lưu db lỗi', redact(e?.message));
      return { status: 'error', reason: 'loi', path };
    }
  }

  return { run, thuMuc, GIO_SAO_LUU, SO_BAN_GIU };
}
