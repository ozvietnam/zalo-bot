// core/queue.js — hàng đợi tuần tự theo khoá (T019).
// Cùng khoá (convId — theo NGƯỜI, xem core/conv.js) thì một lượt tại một thời điểm;
// khác khoá thì chạy song song. Tệp này thuần túy: không gửi tin, không log
// (Điều I — chỉ core/gate.js được gửi; Điều IX — khoá là mã cuộc trò chuyện, không log).
const noop = () => {};

/**
 * @returns {{ run: (key: string, fn: () => Promise<any>) => Promise<any>, size: () => number }}
 */
export function createQueue() {
  // key -> promise của chuỗi đang chờ (promise ĐÃ nuốt lỗi để lượt sau không bị nhiễm)
  const chuoi = new Map();

  /**
   * @param {string} key
   * @param {() => Promise<any>} fn
   * @returns {Promise<any>} kết quả của fn; reject nếu fn ném lỗi.
   */
  const run = (key, fn) => {
    const truoc = chuoi.get(key) ?? Promise.resolve();
    // `viec` là chuỗi CÔNG KHAI: trả về cho người gọi, phải reject khi fn lỗi.
    const viec = truoc.then(() => fn());
    // `duoi` là chuỗi NỘI BỘ: nuốt lỗi để lượt sau cùng khoá vẫn chạy.
    const duoi = viec.then(noop, noop);
    chuoi.set(key, duoi);
    // Dọn khoá khi chuỗi rỗng, nhưng CÓ ĐIỀU KIỆN: chỉ xoá khi khoá vẫn trỏ tới chính
    // chuỗi này (không xoá nhầm chuỗi mới vừa nối vào). `finally` chạy TRƯỚC khi promise
    // trả về settle → `await q.run(...)` xong là size() đã về 0 (test không flaky).
    return viec.finally(() => {
      if (chuoi.get(key) === duoi) chuoi.delete(key);
    });
  };

  return { run, size: () => chuoi.size };
}
