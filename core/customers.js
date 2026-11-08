// Hồ sơ khách: tên, số điện thoại khách tự gõ, nhãn, món quan tâm, ghi chú.
// Ràng buộc hiến pháp Điều IX: tệp này KHÔNG ghi log/audit và KHÔNG gửi tin — chỉ lưu hồ sơ.
// Số điện thoại chỉ được lấy từ chính lời khách gõ (FR-025), không suy ra từ dữ liệu khác.
import { normVi } from './text.js';
import { looksLikeHsCode, isDomestic, isInternational } from './sdt.js';

// Ngữ pháp số điện thoại nằm ở core/sdt.js (nguồn DUY NHẤT cho cả hồ sơ
// khách lẫn che log) — hồ sơ khách chỉ dùng lại, không tự định nghĩa.
export { looksLikeHsCode };

// Nhãn tự động khi khách đã để lại số điện thoại (data-model.md:159).
const NHAN_CO_SDT = 'co-sdt';
// Giữ 20 món quan tâm mới nhất (data-model.md:154).
const MAX_INTERESTS = 20;

/** Chuẩn hoá một số về dạng chỉ chữ số. */
const digitsOf = (s) => String(s ?? '').replace(/\D/g, '');

/**
 * Số điện thoại của công ty về dạng `0xxxxxxxxx` để so với số của khách.
 * Nhận cả dạng chưa chuẩn hoá (`+84 912.345.678`) như `config.companyPhones` đã chuẩn hoá.
 */
function normCompanyPhone(raw) {
  const d = digitsOf(raw);
  if (d.length === 11 && d.startsWith('84')) return '0' + d.slice(2);
  return d;
}

/**
 * Tìm số điện thoại đầu tiên trong câu.
 * Quy tắc: nội địa 10 số (`0` + 3|5|7|8|9) hoặc quốc tế `84` + 9 số;
 * số của công ty bị bỏ qua (không phải ứng viên) rồi đi tìm tiếp — số của
 * công ty không bao giờ được ghi vào hồ sơ, kể cả khi khách nhắc lại nhiều lần;
 * mã HS 8/10 số không phải SĐT.
 * @returns {string|null} số chuẩn hoá `0xxxxxxxxx` hoặc null
 */
export function extractPhone(text, companyPhones = new Set()) {
  // `null` cũng phải coi như không có số của công ty, không ném lỗi.
  const company = new Set([...(companyPhones ?? new Set())].map(normCompanyPhone).filter(Boolean));
  const src = String(text ?? '');
  // Mỗi "chạy" là một dãy số, các số trong chạy có thể nối bằng `.` `-` hoặc khoảng trắng.
  const runs = src.match(/\d+(?:[.\-\s]+\d+)*/g) ?? [];
  for (const run of runs) {
    const groups = run.split(/[.\-\s]+/);
    for (let i = 0; i < groups.length; i++) {
      for (let j = i; j < groups.length; j++) {
        const d = groups.slice(i, j + 1).join('');
        if (d.length > 11) break; // số dài hơn 11 không phải SĐT, thử cách chia khác
        let phone = null;
        if (isDomestic(d)) phone = d;
        else if (isInternational(d)) phone = '0' + d.slice(2);
        else if (looksLikeHsCode(groups.slice(i, j + 1).join('.'))) continue; // mã HS 8/10 số, không phải SĐT
        if (!phone) continue;
        // Số của công ty không bao giờ được ghi vào hồ sơ, kể cả khi khách
        // nhắc lại nhiều lần; số đó bị bỏ qua rồi đi tìm số khác.
        if (company.has(phone)) continue;
        return phone;
      }
    }
  }
  return null;
}

/** Chuẩn hoá tên nhãn: bỏ dấu, thường hoá, khoảng trắng → `-`. */
function normLabel(name) {
  return normVi(name).replace(/\s+/g, '-');
}

/**
 * Hồ sơ khách trên `store.customers`.
 * @param {object} opts
 * @param {object} opts.store store mở sẵn (`openStore`)
 * @param {object} [opts.config] cấu hình, dùng `config.companyPhones`
 * @param {() => Date} [opts.now] nguồn thời gian (mốc lưu đều là UTC ISO 8601)
 */
export function createCustomers({ store, config = {}, now = () => new Date() }) {
  const companyPhones = config.companyPhones ?? new Set();
  const at = () => now().toISOString();
  const get = (convId) => store.customers.get(convId) ?? null;

  /** Đọc nhãn hiện có của hồ sơ (luôn là mảng). */
  const labelsOf = (convId) => get(convId)?.labels ?? [];

  /**
   * Mốc `last_seen_at` cho lệnh của nhân viên. `last_seen_at` là "lần cuối KHÁCH
   * nhắn" (FR-025) nên nhân viên sửa hồ sơ không được đẩy nó về phía trước:
   * hồ sơ có sẵn thì giữ mốc cũ, hồ sơ mới thì dùng mốc hiện tại.
   */
  const seenAt = (cur, nowIso) => cur?.last_seen_at ?? nowIso;

  /**
   * Gắn nhãn. Nhãn trùng tên không thêm mục mới; nếu mục cũ nguồn `auto`
   * mà lần này nhân viên gắn thì nâng nguồn lên `staff:*` (nhân viên gắn sau
   * cùng vẫn bảo vệ được nhãn của mình). Ngược lại thì giữ nguồn cũ, không đè.
   */
  function addLabels(convId, labels, source = 'auto') {
    const current = labelsOf(convId).map((l) => ({ ...l }));
    // Chuỗi phải là MỘT nhãn chứ không phải mảng ký tự: duyệt chuỗi theo ký tự
    // sẽ sinh nhãn rác ("tra-cuu-hs" → "t","r","a",...). Kiểu khác (null, object)
    // thì bỏ qua, không ném lỗi.
    const items = typeof labels === 'string' ? [labels] : Array.isArray(labels) ? labels : null;
    if (!items) return current;
    const nowIso = at();
    for (const raw of items) {
      const name = normLabel(raw);
      if (!name) continue; // bỏ nhãn rỗng
      const found = current.find((l) => l.nhan === name);
      if (found) {
        if (found.nguon === 'auto' && source !== 'auto') found.nguon = source;
        continue;
      }
      current.push({ nhan: name, nguon: source, at: nowIso });
    }
    store.customers.upsert(convId, { labels: current }, seenAt(get(convId), nowIso));
    return current;
  }

  /**
   * Gỡ nhãn. Máy (`by === 'auto'`) không được gỡ nhãn của nhân viên (spec.md:251);
   * nhân viên (`staff:<id>`) gỡ được mọi mục có tên đó.
   */
  function removeLabel(convId, label, by = 'auto') {
    const nowIso = at();
    const name = normLabel(label);
    // Chưa có hồ sơ thì không gỡ được gì; quan trọng là không tạo hồ sơ rỗng.
    const cur = get(convId);
    if (!cur) return [];
    const current = labelsOf(convId).map((l) => ({ ...l }));
    const kept = current.filter((l) => {
      if (l.nhan !== name) return true;
      if (by === 'auto' && l.nguon !== 'auto') return true; // giữ nhãn của nhân viên
      return false;
    });
    store.customers.upsert(convId, { labels: kept }, seenAt(cur, nowIso));
    return kept;
  }

  /**
   * Thêm món khách quan tâm. Mục mới nhất đứng đầu; chỉ giữ 20 mục mới nhất.
   */
  function addInterests(convId, items) {
    const cur = get(convId);
    const current = [...(cur?.interests ?? [])];
    // Không phải mảng thì bỏ qua (dữ liệu sai từ bên ngoài), không ném lỗi.
    if (!Array.isArray(items)) return current;
    const nowIso = at();
    for (const item of items) {
      const mon = item?.mon == null ? '' : String(item.mon).trim();
      const hs = item?.hs == null ? '' : String(item.hs).trim();
      if (!mon && !hs) continue; // mục rỗng thì không lưu
      const entry = { at: nowIso };
      if (mon) entry.mon = mon;
      if (hs) entry.hs = hs;
      current.unshift(entry);
    }
    const kept = current.slice(0, MAX_INTERESTS);
    store.customers.upsert(convId, { interests: kept }, seenAt(cur, nowIso));
    return kept;
  }

  /** Ghi chú tay của nhân viên; text rỗng thì xoá ghi chú. */
  function setNote(convId, text, by = 'auto') {
    const cur = get(convId);
    const nowIso = at();
    const body = String(text ?? '').trim();
    if (!body) {
      store.customers.upsert(convId, { note: null }, seenAt(cur, nowIso));
      return null;
    }
    const note = JSON.stringify({ text: body, by, at: nowIso });
    store.customers.upsert(convId, { note }, seenAt(cur, nowIso));
    return note;
  }

  /**
   * Cập nhật hồ sơ theo một lượt khách nhắn: đếm lượt, giữ tên hiển thị,
   * lấy SĐT khách tự gõ (kể cả trong caption của ảnh) và gắn nhãn `co-sdt`.
   */
  function touch(turn) {
    const convId = turn?.convId;
    if (!convId) return null;
    const nowIso = at();
    const cur = get(convId);
    const name = String(turn.userName ?? '').trim();
    const phone = extractPhone(turn.text, companyPhones) ?? extractPhone(turn.caption, companyPhones);
    const patch = {
      chat_id: turn.chatId ?? cur?.chat_id ?? null,
      display_name: name || cur?.display_name || null, // chỉ đổi tên khi có tên khác rỗng
      turns: (cur?.turns ?? 0) + 1,
    };
    if (phone) patch.phone = phone; // số mới hợp lệ ghi đè số cũ
    let labels = labelsOf(convId).map((l) => ({ ...l }));
    if (phone) {
      if (!labels.some((l) => l.nhan === NHAN_CO_SDT)) {
        labels.push({ nhan: NHAN_CO_SDT, nguon: 'auto', at: nowIso });
      }
    }
    patch.labels = labels;
    store.customers.upsert(convId, patch, nowIso);
    return get(convId);
  }

  /**
   * Đọc ghi chú của hồ sơ. Cột `note` lưu JSON (`{text, by, at}`) nên phải
   * parse mới lấy được phần chữ; nếu không parse được (dữ liệu cũ, ghi tay)
   * thì dùng nguyên chuỗi thô để không mất thông tin.
   */
  function noteTextOf(cur) {
    const raw = cur?.note;
    if (!raw) return '';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return String(raw);
    }
    if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') return parsed.text;
    if (typeof parsed === 'string') return parsed;
    return String(raw);
  }

  /**
   * Gộp khoảng trắng và xuống dòng thành MỘT dấu cách. Tên hiển thị, ghi chú,
   * nhãn và món do người dùng kiểm soát: nếu chứa `\n` mà để nguyên thì
   * `summary()` sẽ sinh dòng giả (kiểu dòng "Số điện thoại: …" do khách chèn
   * vào) và nhân viên có thể tưởng là dữ liệu thật của hồ sơ.
   */
  const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

  /** Tóm tắt hồ sơ để nhân viên đọc trong Zalo. */
  function summary(convId) {
    const cur = get(convId);
    if (!cur) return 'Chưa có hồ sơ khách.';
    const lines = [];
    lines.push(`Hồ sơ khách: ${oneLine(cur.display_name) || '(chưa có tên)'}`);
    lines.push(`Số điện thoại: ${oneLine(cur.phone) || '(chưa có)'}`);
    const names = (cur.labels ?? []).map((l) => oneLine(l.nhan)).filter(Boolean);
    lines.push(`Nhãn: ${names.length ? names.join(', ') : '(chưa có)'}`);
    // Ghi chú phải hiện ra, nếu không nhân viên không thấy gì đã ghi.
    lines.push(`Ghi chú: ${oneLine(noteTextOf(cur)) || '(chưa có)'}`);
    const top = (cur.interests ?? []).slice(0, 3);
    lines.push('Món quan tâm gần đây:');
    if (!top.length) lines.push('- (chưa có)');
    for (const it of top) {
      const mon = oneLine(it.mon) || '(không rõ món)';
      const hs = oneLine(it.hs);
      lines.push(`- ${mon}${hs ? ` (HS ${hs})` : ''}`);
    }
    lines.push(`Số lượt: ${cur.turns ?? 0}`);
    return lines.join('\n');
  }

  /** Xoá hồ sơ; trả true nếu có dòng bị xoá. */
  function erase(convId) {
    if (!get(convId)) return false;
    store.customers.deleteChat(convId);
    return true;
  }

  return { touch, addLabels, removeLabel, addInterests, setNote, summary, erase };
}
