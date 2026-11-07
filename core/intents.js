// T023 — hai ý của khách mà lõi phải tự nhận ra: "cho em gặp người" và "người hay máy".
// Hàm thuần trên văn bản: không I/O, không gửi tin, không log (Điều I, Điều IX).
// Lõi dùng kết quả này ở T026 (`specs/001-nen-tang-chung/tasks.md:440`); tệp này chưa gọi ai.
import { normVi } from './text.js';

// Mọi so khớp chạy trên normVi (chữ thường, bỏ dấu) nên phải tự đề phòng các từ nghiệp vụ
// trùng nhau sau khi bỏ dấu — bot này nói chuyện hàng hoá cả ngày:
//   "bột" → bot      ("bột mì", "bột đá")        "gói" → goi ("đóng gói lại")
//   "máy" → may      ("máy bơm", "mày")          "AI"  → ai  (cả đại từ "ai")
//   "ạ"   → a        (lịch sự)                   "à"   → a   (hỏi) — hai tiểu từ TRÙNG NHAU
//   "chị" → chi      (ngôi thứ hai)              "chỉ" → chi (= "chỉ là máy", chỉ mức độ)
//   "đó"  → do       (chỉ định: "cái đó")        "đó"  → do  (nhấn mạnh cuối câu: "là máy đó")
//   "nội/nơi/nói" → noi                          "số máy" (số khung của hàng) ↔ "số máy" (điện thoại)
// Cách né, ba lớp — ghi rõ vì không lớp nào một mình đủ:
//   1. hệ từ: từ mơ hồ chỉ tính khi có "là/phải" đứng trước ("là máy", không phải "máy bơm");
//   2. chủ ngữ: khách gọi THẲNG bot ("bạn/mày là bot") thì chốt ở đó là đủ; còn chủ ngữ CHỈ ĐỊNH
//      ("cái này/đây") trỏ vào hàng cũng được, nên bắt buộc có thêm tiểu từ hỏi cuối câu;
//   3. dấu thanh: cặp chỉ khác nhau ở dấu thì kiểm trên BẢN GỐC trước khi chuẩn hoá
//      ("ạ" vs "à" ở `tieuTu`, "gói" vs "gọi" ở `GOI_RAW`).

const NHAN_SU = String.raw`nhan vien|tu van vien|tong dai|cskh|cham soc khach hang|admin`;
const NGUOI_THAT = String.raw`nguoi (?:that|thuc|thiet)`;

/**
 * Chuẩn hoá tiểu từ cuối câu TRƯỚC khi bỏ dấu, vì normVi làm "ạ" (lịch sự) và "à" (hỏi) trùng thành "a".
 * Khách tả hàng kết câu bằng "ạ" là chuyện thường ngày ("dạ cái này là máy ạ"), nếu coi "a" là tiểu từ
 * hỏi thì bot trả lời "em là trợ lý tự động" thay vì phân loại hàng.
 *   "ạ" → bỏ (không mang nghĩa hỏi) · "à" → "ah" (dạng không nhập nhằng, đã có trong TIEU_TU)
 */
const tieuTu = (raw) => String(raw)
  .replace(/(^|[\s,])ạ(?=[\s?!.,]|$)/gu, '$1 ')
  .replace(/(^|[\s,])à(?=[\s?!.,]|$)/gu, '$1 ah ');

/**
 * Tiểu từ hỏi cuối câu. Phải ở CUỐI câu (cho phép dấu câu đuôi): "là máy không chịu thuế" có chữ
 * "không" giữa câu nhưng không phải câu hỏi danh tính. Không nhận "a" trần — xem `tieuTu`.
 */
const TIEU_TU = String.raw`ah|ha|the|nhi|vay|day|do|z|zay|khong|ko|k|dung khong|phai khong`;
const DUOI = String.raw`(?:\s*[?!]|\s+(?:${TIEU_TU})\s*[?!.,]*$|\s*[.,]?$)`;

/**
 * Mệnh đề hỏi danh tính "X hay Y" (cả hai bên đều là từ chỉ người/máy).
 * Buộc cả hai bên để không chặn "hay" nghĩa "thường hay": "máy hay bị lỗi, cho em gặp nhân viên"
 * vẫn phải là lời xin gặp người (FR-014, `specs/001-nen-tang-chung/spec.md:233`).
 */
const DANH_TINH_NGAN = String.raw`nguoi that|nguoi|bot|chatbot|robot|may|ai|tro ly(?: ao)?`;
const MENH_DE_HOI_HAY = new RegExp(
  String.raw`\b(?:${DANH_TINH_NGAN})\s+hay\s+(?:la\s+)?(?:${DANH_TINH_NGAN})\b`, 'g',
);

// ---------- wantsHuman: khách xin gặp người ----------

// "gặp / nói chuyện với / liên hệ … nhân viên | người thật | người".
// Đích trần "nguoi" là chỗ dễ nhầm nhất: "gặp người nhận hàng ở cảng" là nghiệp vụ, không phải
// xin gặp người. Nên "nguoi" chỉ tính khi KHÔNG có danh từ vai nghiệp vụ đi ngay sau.
const VAI_NGHIEP_VU = String.raw`nhan|ban|mua|khai|nhap|xuat|gui|van chuyen|lao dong|dai dien|uy quyen|phu trach`;
const VERB_GAP = String.raw`gap|noi chuyen voi|noi chuyen truc tiep voi|noi chuyen cung|lien he|chat voi|noi voi`;
const XIN_GAP = new RegExp(
  String.raw`\b(?:${VERB_GAP})\s+(?:\w+\s+){0,3}?(?:(?:${NHAN_SU})|${NGUOI_THAT}|nguoi\b(?!\s+(?:${VAI_NGHIEP_VU})\b))`,
);

// "chuyển / nối máy / kết nối … cho nhân viên" — chặn "vận chuyển" vì đó là nghiệp vụ.
// "nối" trần thì KHÔNG tính: normVi làm nó trùng "nội" ("nội dung nhân viên ghi"), "nơi"
// ("nơi làm việc của nhân viên") và "nói" ("bên em nói nhân viên kia rồi"). Chỉ tính khi có
// giới từ nối sang người ("nối em VỚI nhân viên").
const XIN_CHUYEN = new RegExp(
  String.raw`(?<!\bvan )\b(?:chuyen|noi may|noi dien thoai|ket noi|nhuong)\s+(?:\w+\s+){0,3}?(?:${NHAN_SU})\b`
  + String.raw`|\bnoi\s+(?:\w+\s+){0,2}?voi\s+(?:\w+\s+){0,2}?(?:${NHAN_SU})\b`
  + String.raw`|\bnoi\s+(?:em|anh|chi|minh|toi|chau|con)\s+(?:voi|qua|sang|toi)\s+(?:\w+\s+){0,2}?(?:${NHAN_SU})\b`,
);

// Xin gián tiếp: "cho em số điện thoại nhân viên", "bên mình có ai hỗ trợ không".
// Bỏ sót nhóm này nặng hơn mở phiếu thừa (FR-014), nên để `wantsHuman` nhận.
// "số" trần cũng là từ nghiệp vụ: "số nhân viên bên em là 3" là đếm người, "số tờ khai nhân viên
// đã nộp" là số giấy. Nên "số" trần chỉ tính khi có động từ XIN đi trước và đứng LIỀN tên vai.
// "số máy" thì càng phải liền: trong tờ khai "số máy" là số máy/số khung của hàng, không phải số
// điện thoại ("số máy trên nhãn nhân viên ghi sai").
const XIN_SO = new RegExp(
  String.raw`\b(?:so dien thoai|sdt|lien he|contact)\s+(?:\w+\s+){0,3}?(?:${NHAN_SU})\b`
  + String.raw`|\b(?:xin|cho)\s+(?:\w+\s+){0,3}?\bso(?: may)?\s+(?:${NHAN_SU})\b`,
);
// "có ai hỗ trợ không". Loại "ai cũng/đều …" (= mọi người) như `AI_TRUC`.
const AI_HO_TRO = new RegExp(
  String.raw`\bai\b(?!\s+(?:cung|deu)\b)(?:\s+\w+){0,2}\s+(?:ho tro|giup|tu van|phu trach|xu ly)\b`
  + String.raw`[^.?!]{0,20}?\b(?:khong|ko|k)\b`,
);

// "nhân viên đâu", "có nhân viên nào trực không", "tư vấn viên online không".
const NHAN_SU_DAU = new RegExp(
  String.raw`\b(?:${NHAN_SU})\b(?:\s+\w+){0,2}\s+(?:dau|o dau|co day|co do|truc|dang truc|online|ranh)\b`,
);

// "có ai trực không", "có ai đó không", "có ai ở đây không".
// Né "ai cũng khai mã này", "người nhập khẩu là ai", và "ai ở đây cũng…" (= mọi người, không phải
// hỏi có ai trực): nhánh vị trí ("ở đây/đó") chỉ tính khi KHÔNG có "cũng/đều" theo sau.
const AI_TRUC = new RegExp(
  String.raw`\bai\b(?:\s+(?:dang|con))?\s+(?:truc|online)\b`
  + String.raw`|\bai\b\s+(?:o day|o do|day|do)\b(?!\s*(?:cung|deu)\b)\s*(?:khong|ko|k)\b`
  + String.raw`|\bco ai\b(?:\s+(?:do|o day|o do))?\s*(?:khong|ko|k)\b`,
);

// Xin gọi lại / gọi điện. Đây là chỗ nhập nhằng nhất: normVi bỏ dấu nên "gọi" và "gói" cùng ra
// "goi", mà "gói lại" là việc đóng gói hàng. Ba lớp lọc:
//   1. phải có đích của cuộc gọi ("cho", "điện", "số") — "gói lại được không" không có;
//   2. không đứng sau động từ đóng gói — "đóng gói lại cho em nhé";
//   3. nếu khách gõ có dấu thì tin dấu: có "gói" mà không có "gọi" thì là đóng gói (GOI_RAW).
// Giới hạn đã biết: khách gõ không dấu "goi lai cho em" thì hai nghĩa trùng nhau hoàn toàn,
// luật này chọn nghĩa "gọi lại" (xin gặp người) — mở phiếu cho nhân viên còn hơn bỏ lời khách.
const GOI_LAI = new RegExp(
  String.raw`(?<!\b(?:dong|bao|boc|hut|niem|chia|tach) )\bgoi (?:dien|dt)\b`
  + String.raw`|(?<!\b(?:dong|bao|boc|hut|niem|chia|tach) )\bgoi (?:lai )?(?:cho|vao so|so dien thoai|so)\b`,
);
const GOI_RAW = { goi: /gói/i, goiCall: /gọi/i };

/**
 * Khách muốn gặp người thật (FR-014, `specs/001-nen-tang-chung/spec.md:233`).
 * @param {unknown} text tin khách (đã bỏ "@Tên bot" bởi lõi)
 * @returns {boolean}
 */
export function wantsHuman(text) {
  if (typeof text !== 'string') return false;
  const t = normVi(text);
  if (!t) return false;
  // Bỏ RIÊNG mệnh đề hỏi danh tính ("người hay máy") rồi mới dò trên phần còn lại: mệnh đề đó thuộc
  // `asksIfBot`, nhưng không được chặn cả câu — "máy hay bị lỗi, cho em gặp nhân viên với" vẫn là lời
  // xin gặp người, bỏ sót thì trái FR-014. Khoanh hẹp hơn cũng an toàn hơn: bỏ sót lời khách nặng hơn
  // mở phiếu thừa cho nhân viên.
  const conLai = t.replace(MENH_DE_HOI_HAY, ' ');
  if (XIN_GAP.test(conLai) || XIN_CHUYEN.test(conLai) || NHAN_SU_DAU.test(conLai)
    || AI_TRUC.test(conLai) || XIN_SO.test(conLai) || AI_HO_TRO.test(conLai)) return true;
  // Khách gõ có dấu: "gói" mà không có "gọi" thì là đóng gói hàng, không phải xin gọi lại.
  if (GOI_RAW.goi.test(text) && !GOI_RAW.goiCall.test(text)) return false;
  return GOI_LAI.test(t);
}

// ---------- asksIfBot: khách hỏi người hay máy ----------

const DANH_TINH = String.raw`ai|bot|chatbot|robot|may|${NGUOI_THAT}|nguoi may|tro ly ao`;

// Chủ ngữ chia hai loại, vì mức nhập nhằng khác nhau:
//   - GỌI THẲNG bot ("bạn", "mày", "cậu"): chỉ trỏ vào người đang trả lời, không trỏ vào hàng được,
//     nên tính là hỏi danh tính kể cả khi không có tiểu từ ("bạn là bot").
//   - CÒN LẠI — chỉ định ("cái này", "đây") VÀ ngôi thứ nhất ("em", "anh", "chị", "mình"):
//     bắt buộc phải có tiểu từ hỏi THẬT. Ngôi thứ nhất nằm ở đây vì khách dùng nó để tự chỉ mình và
//     hàng của mình ("hàng của anh là máy ạ", "lô của em là bột") — đó là lớp câu đông nhất của bot
//     CSKH hải quan. Nếu cho nhóm này khỏi cần tiểu từ thì nó đi vòng qua đúng chốt "ạ"/"à" ở trên:
//     có "ạ" hay không cũng khớp như nhau. "em là người thật không" vẫn nhận, vì có tiểu từ hỏi.
const CHU_NGU_GOI = String.raw`ban|may|cau`;
const CHU_NGU_CHI = String.raw`day|cai nay|ben nay|hang nay|cai do|do|minh|em|anh|chi|no|lo nay|cai do nay`;

// "bạn là bot à", "em là người thật không", "cái này là máy à".
// `DUOI_HOI` KHÔNG nhận "do": "đó" thường là chỉ định/nhấn mạnh ("cái này là máy đó ạ"), không phải
// lời hỏi. Giữ "do" ở `TIEU_TU` cho `DUOI` và `CO_PHAI` ("có phải bot đó không") nhưng bỏ ở nhánh này.
const TIEU_TU_HOI = String.raw`ah|ha|the|nhi|vay|z|zay|khong|ko|k|dung khong|phai khong`;
const DUOI_HOI = String.raw`(?:\s*[?!]|\s+(?:${TIEU_TU_HOI})\s*[?!.,]*$)`;
const LA_GI = new RegExp(
  String.raw`\b(?:${CHU_NGU_GOI})\s+(?:la|phai)\s+(?:la\s+)?(?:${DANH_TINH})${DUOI}`
  + String.raw`|\b(?:${CHU_NGU_CHI})\s+(?:la|phai)\s+(?:la\s+)?(?:${DANH_TINH})${DUOI_HOI}`,
);

// "có phải bot không", "có phải là người thật không".
// Từ chỉ danh tính phải là VỊ NGỮ của "phải" (đứng ngay sau), rồi chỉ còn tiểu từ hỏi tới HẾT MỆNH ĐỀ.
// Thiếu một trong hai thì câu nghiệp vụ rất thường gặp bị nhận sai: "có phải máy này chịu thuế không"
// ("máy" là chủ ngữ mệnh đề sau), "có phải máy không chịu thuế" ("không" là PHỦ ĐỊNH, không phải
// tiểu từ hỏi) — ở T026 bot sẽ trả "em là trợ lý tự động" thay vì trả lời câu hỏi thuế.
const CO_PHAI = new RegExp(String.raw`\b(?:co )?phai\s+(?:la\s+)?(?:${DANH_TINH})(?:\s+(?:${TIEU_TU}))+\s*(?:[?!.,;]|$)`);

// "người hay máy", "bot hay người thật".
const NGUOI_HAY_MAY = new RegExp(
  String.raw`\bnguoi\s+hay\s+(?:la\s+)?(?:may|bot|ai|robot|chatbot|tro ly)\b` +
  String.raw`|\b(?:may|bot|ai|robot|chatbot)\s+hay\s+(?:la\s+)?nguoi\b`,
);

// "đang chat với bot à".
const CHAT_VOI_BOT = new RegExp(String.raw`\b(?:chat|noi chuyen|nhan tin)\s+voi\s+(?:bot|chatbot|robot|may|ai)${DUOI}`);

// "máy trả lời tự động", "trợ lý ảo", "chatbot": tên gọi của máy, không cần tiểu từ.
const TEN_MAY = new RegExp(String.raw`\btra loi tu dong\b|\btro ly (?:ao|tu dong|may)\b|\bchatbot\b|\bbot tu dong\b`);

/**
 * Khách hỏi đang nói với người hay với máy (Điều VIII, `spec.md:90`).
 * @param {unknown} text
 * @returns {boolean}
 */
export function asksIfBot(text) {
  if (typeof text !== 'string') return false;
  // `tieuTu` chạy TRƯỚC normVi: sau khi bỏ dấu thì "ạ" và "à" không còn phân biệt được nữa.
  const t = normVi(tieuTu(text));
  if (!t) return false;
  return NGUOI_HAY_MAY.test(t) || LA_GI.test(t) || CO_PHAI.test(t) || CHAT_VOI_BOT.test(t) || TEN_MAY.test(t);
}

// ---------- Hai câu do LÕI tự soạn ----------
// Lõi không nối footer của gói vào đây (contract `contracts/pack.md:37`).

/** Trả lời khi chuyển phòng cho người. Không hứa mốc thời gian, không hứa việc bot không làm được. */
export const REPLY_HANDOFF =
  'Dạ em đã chuyển cuộc trò chuyện này cho nhân viên OZ. Anh/chị chờ nhân viên vào trả lời giúp em nhé, '
  + 'trong lúc đó em tạm dừng trả lời tự động ạ.';

/** Trả lời khi khách hỏi người hay máy: nói thật, rồi chỉ đúng câu mà `wantsHuman` nhận ra. */
export const REPLY_IS_BOT =
  'Dạ em là trợ lý tự động của OZ, không phải người thật ạ. Em tra cứu mã HS, thuế và thủ tục hải quan; '
  + 'cần người thật thì anh/chị gõ "gặp nhân viên", em chuyển cuộc trò chuyện cho nhân viên OZ.';
