# Contract: Gói (Pack)

Một gói là một thư mục `packs/<id>/` có `index.js` export mặc định một object. Lõi tự nạp mọi thư mục trong `packs/`.
Gói **không** import gì từ `channels/`, và không nhận client Zalo. Gói chỉ trả dữ liệu; mọi tin ra do lõi gửi qua cửa.

```js
/** @type {import('../../core/types.js').Pack} */
export default {
  id: 'hs',                       // a-z0-9-, duy nhất
  ten: 'Tra cứu hải quan',
  version: '1.0.0',
  audience: 'public',             // 'public' | 'staff'
  moneyCheck: false,              // true → cửa kiểm số tiền theo bằng chứng (Hiến pháp III)
  requiresTools: ['tra_thue'],    // công cụ Cổng OZ tối thiểu; thiếu thì gói ẩn
  priority: 10,                   // gói nào được hỏi trước khi chọn gói tự động (số lớn trước)

  /** Có nhận tin này không? Gọi theo `priority`, gói đầu tiên trả true thì nhận. */
  match(turn, ctx) { return true; },

  /** Xử lý một lượt. Không được gửi tin, chỉ trả kết quả. */
  async handle(turn, ctx) {
    return {
      replies: [{ text: '...' }],            // theo thứ tự; lõi gán chỉ số cho khoá idempotency
      evidence: [/* kết quả công cụ đã dùng */],
      jobs: [{ maLuot, resultTool, context }],  // việc nền để lõi hỏi kết quả
      handoff: null,                          // { reason } → lõi mở phiếu, chuyển phòng sang human
      labels: ['tra-cuu-hs'],                 // nhãn gói muốn gắn (nguồn auto)
      interests: [{ mon: 'máy bơm ly tâm', hs: '84137090' }],
    };
  },

  /** Việc nền xong (hoặc hết hạn). Trả tin kết quả. */
  async onJobResult(job, result, ctx) {
    return { replies: [{ text: '...' }], evidence: [result] };
  },

  /** Không bắt buộc: trả dòng menu để lõi dùng cho tin LÕI tự soạn (câu báo lỗi chung, REPLY_HANDOFF…).
      Lõi KHÔNG nối footer vào replies của gói: gói tự nhúng footer vào câu của mình (review T014 I1). */
  footer(ctx) { return ''; },
};
```

## `turn` (lõi đưa vào, chỉ đọc)
| Trường | Kiểu | |
|---|---|---|
| `turnId` | string | = `update_key` |
| `chatId`, `userId`, `userName` | string | |
| `isGroup` | boolean | |
| `text` | string \| null | đã bỏ "@Tên bot" |
| `caption` | string \| null | chú thích ảnh, cũng đã bỏ "@Tên bot" (review T014 I2) |
| `photoUrl` | string \| null | |
| `receivedAt` | string | ISO UTC |
| `isStaff` | boolean | `userId` có trong `STAFF_USERS` |

## `ctx` (lõi đưa vào)
| Trường | Kiểu | |
|---|---|---|
| `mcp` | `{ callTool(name, args), listTools() }` | mỗi lần gọi tự ghi audit `tool` |
| `tools` | `Set<string> \| null` | công cụ Cổng đang có |
| `session` | `{ get(): object, set(patch): void }` | lưu bền theo khoá phiên |
| `history(n = 20)` | `() => Array<{speaker, text, at}>` | tin gần nhất của phòng, cũ → mới, chỉ đọc |
| `customer` | `{ displayName, phone, labels, interests } \| null` | hồ sơ phòng, chỉ đọc |
| `vision` | `{ readSpecs(url, caption) } \| null` | |
| `now()` | `() => Date` | tiêm vào được để test |
| `log` | `{ info, error }` | đã che bí mật |

## Luật
1. `handle` không được chờ việc nền trong lượt. Gặp `DANG_XU_LY` thì trả `jobs` cùng một câu "⏳ đang xử lý…".
2. Gói muốn nói "chuyển người" thì trả `handoff`, không tự viết câu hứa gọi lại.
3. Gói `audience: 'staff'` chỉ nhận `turn` có `isStaff = true`; lõi lọc trước khi gọi `match`.
4. Lỗi ném ra từ `handle` → lõi gửi câu báo chung (FR-022), ghi audit `error`, không thử lại.
5. Gói được phép có test riêng trong `packs/<id>/test/*.test.mjs`; `npm test` chạy hết.
