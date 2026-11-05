// Kiểu dùng chung của lõi (chỉ JSDoc, không có mã chạy). Theo specs/001-nen-tang-chung/contracts/.

/**
 * @typedef {object} Update  Một sự kiện đã chuẩn hoá từ kênh (contracts/channel.md).
 * @property {string} updateKey  message_id nếu có, nếu không thì sha1 của JSON raw
 * @property {string} event
 * @property {string|null} chatId
 * @property {string|null} userId
 * @property {string|null} userName
 * @property {string|null} chatType
 * @property {string|null} text
 * @property {string|null} photoUrl
 * @property {string|null} caption
 * @property {string|null} messageId
 * @property {object} raw
 */

/**
 * @typedef {object} Turn  Một lượt khách, lõi đưa vào gói, chỉ đọc.
 * @property {string} turnId  = updateKey
 * @property {string} chatId
 * @property {string} userId
 * @property {string} userName
 * @property {boolean} isGroup
 * @property {string|null} text  đã bỏ "@Tên bot"
 * @property {string|null} photoUrl
 * @property {string|null} caption
 * @property {string} receivedAt  ISO UTC
 * @property {boolean} isStaff  userId có trong STAFF_USERS
 */

/**
 * @typedef {object} Ctx  Ngữ cảnh lõi đưa vào gói (contracts/pack.md).
 * @property {{ callTool(name: string, args?: object): Promise<any>, listTools(): Promise<any> }} mcp
 * @property {Set<string>|null} tools  công cụ Cổng đang có
 * @property {{ get(): object, set(patch: object): void }} session
 * @property {(n?: number) => Array<{ speaker: string, text: string, at: string }>} history  cũ -> mới, chỉ đọc
 * @property {{ displayName: string, phone: string|null, labels: string[], interests: object[] }|null} customer
 * @property {{ readSpecs(url: string, caption?: string): Promise<any> }|null} vision
 * @property {() => Date} now
 * @property {{ info: Function, error: Function }} log
 */

/**
 * @typedef {object} Job  Việc nền để lõi hỏi kết quả.
 * @property {string} maLuot
 * @property {string} resultTool
 * @property {object} [context]
 */

/**
 * @typedef {object} PackResult  Kết quả một lượt; gói không tự gửi tin.
 * @property {Array<{ text: string }>} replies
 * @property {any[]} [evidence]
 * @property {Job[]} [jobs]
 * @property {{ reason: string }|null} [handoff]
 * @property {string[]} [labels]
 * @property {Array<{ mon: string, hs?: string }>} [interests]
 */

/**
 * @typedef {object} Pack  Gói nghiệp vụ, mặc định export từ packs/<id>/index.js.
 * @property {string} id  a-z0-9-, duy nhất
 * @property {string} ten
 * @property {string} version
 * @property {'public'|'staff'} audience
 * @property {boolean} [moneyCheck]
 * @property {string[]} [requiresTools]
 * @property {number} priority  số lớn hỏi trước
 * @property {(turn: Turn, ctx: Ctx) => boolean} match
 * @property {(turn: Turn, ctx: Ctx) => Promise<PackResult>} handle
 * @property {(job: Job, result: any, ctx: Ctx) => Promise<PackResult>} [onJobResult]
 * @property {(ctx: Ctx) => string} [footer]
 */

export {};
