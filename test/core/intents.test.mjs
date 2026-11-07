// T023 — nhận ý khách: "cho em gặp người" (wantsHuman) và "người hay máy" (asksIfBot).
// Hai hàm thuần, chạy trên văn bản: không gửi tin, không I/O (Điều I, Điều IX).
// Bẫy của repo này: bot nói chuyện hàng hoá, nên từ khoá trùng từ vựng nghiệp vụ
// (máy bơm, nhân viên văn phòng, bột mì, đóng gói lại, vận chuyển cho người nhận).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsHuman, asksIfBot, REPLY_HANDOFF, REPLY_IS_BOT } from '../../core/intents.js';

// ---- Bộ khẳng định của tasks.md:408-415 (nguyên văn) ----

test('wantsHuman: khách xin gặp người', () => {
  for (const s of ['cho em gặp nhân viên', 'gọi lại cho anh', 'có ai trực không',
    'muốn nói chuyện với người thật', 'tư vấn viên đâu'])
    assert.equal(wantsHuman(s), true, s);
});

test('asksIfBot: khách hỏi người hay máy', () => {
  for (const s of ['Mày là người hay là AI đấy', 'bạn là bot à', 'đây là máy trả lời tự động hả'])
    assert.equal(asksIfBot(s), true, s);
});

test('tin nghiệp vụ không phải hai ý này', () => {
  for (const s of ['máy bơm nước ly tâm 1.5HP', 'nhân viên văn phòng dùng máy in này', '8413.70.90']) {
    assert.equal(wantsHuman(s), false, s);
    assert.equal(asksIfBot(s), false, s);
  }
});

test('REPLY_IS_BOT nói thật là trợ lý tự động của OZ (Điều VIII)', () => {
  assert.match(REPLY_IS_BOT, /trợ lý tự động của OZ/);
});

// ---- Hai ý tách bạch: ví dụ của ý này không được rơi vào ý kia ----

test('ví dụ xin gặp người không bị coi là hỏi người hay máy, và ngược lại', () => {
  for (const s of ['cho em gặp nhân viên', 'gọi lại cho anh', 'có ai trực không',
    'muốn nói chuyện với người thật', 'tư vấn viên đâu'])
    assert.equal(asksIfBot(s), false, s);
  for (const s of ['Mày là người hay là AI đấy', 'bạn là bot à', 'đây là máy trả lời tự động hả'])
    assert.equal(wantsHuman(s), false, s);
});

// ---- Câu lõi tự soạn phải dùng được ----

test('REPLY_IS_BOT mời gặp người và chỉ đúng câu mà wantsHuman nhận ra', () => {
  assert.match(REPLY_IS_BOT, /gặp nhân viên/);          // câu hướng dẫn khách gõ
  assert.equal(wantsHuman('gặp nhân viên'), true);      // gõ đúng câu đó thì lõi nhận ra
});

test('REPLY_HANDOFF không hứa mốc thời gian, không hứa việc bot không làm được (Điều VIII)', () => {
  assert.ok(REPLY_HANDOFF.length > 20 && REPLY_HANDOFF.length < 400);
  assert.doesNotMatch(REPLY_HANDOFF, /\d+\s*(phút|giờ|ngày)/i);
  assert.doesNotMatch(REPLY_HANDOFF, /gọi điện|gửi mail|gửi email|gửi catalog|gửi file|gửi ảnh/i);
});

test('hai câu lõi không lộ gì và không có thẻ định dạng hở', () => {
  for (const s of [REPLY_HANDOFF, REPLY_IS_BOT]) {
    assert.doesNotMatch(s, /\bsk-|\bghp_|https?:\/\/|\d{9,}/);   // Điều IX
    assert.equal((s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length);
  }
});

// ---- Từ vựng hải quan không được kích hoạt (dấu thanh phân biệt gọi≠gói, bột≠bot) ----

test('wantsHuman: tin hàng hoá không phải xin gặp người', () => {
  for (const s of [
    'đóng gói lại giúp em với ạ',               // "gói" không phải "gọi"
    'đóng gói lại cho em nhé',
    'hút chân không gói lại được không',
    'chia gói lại cho đủ 20kg',
    'gói lại cho chắc nhé',
    'máy đóng gói tự động mã HS mấy',
    'gặp người nhận hàng ở cảng thì cần giấy gì',  // "gặp người <vai nghiệp vụ>" là việc hàng hoá
    'liên hệ người bán bên Trung Quốc thế nào',
    'gọi tên hàng thế nào cho đúng',               // "gọi" ở đây là gọi tên, không phải gọi điện
    'vận chuyển cho người nhận ở Hà Nội',       // "chuyển ... người" không phải xin gặp
    'tư vấn giúp em mã HS máy bơm',             // "tư vấn" một mình là yêu cầu thường
    'bên em có mấy nhân viên khai hải quan',
    'người nhập khẩu là ai thì ghi vào tờ khai',
    'máy ép viên nén gỗ, ai cũng hỏi mã này',
    'hàng đóng gói sẵn, 3 thùng',
    '',
    null,
  ]) assert.equal(wantsHuman(s), false, String(s));
});

test('asksIfBot: tin hàng hoá không phải hỏi người hay máy', () => {
  for (const s of [
    'bột mì nhập từ Trung Quốc thuế bao nhiêu',   // "bột" không phải "bot"
    'cái này là bột đá, mã nào ạ',
    'đây là người nhận hàng, ghi vào đâu',
    'cái này là máy bơm ly tâm',
    'bên anh là người khai thuê, không phải chủ hàng',
    'máy bán hàng tự động thuế mấy phần trăm',
    'ai cũng khai mã này',
    '',
    null,
  ]) assert.equal(asksIfBot(s), false, String(s));
});

// Dạng TRẦN của từ mơ hồ — không có danh từ đi sau đỡ, nên chỉ chốt cuối câu mới chặn được.
// Các ca trên đây trượt vì "bột mì"/"máy bơm" có danh từ, không phải vì chốt này.

test('asksIfBot: "ạ" lịch sự không phải "à" hỏi (normVi bỏ dấu làm hai tiểu từ trùng nhau)', () => {
  for (const s of ['dạ cái này là máy ạ', 'cái này là bột ạ', 'dạ đây là máy ạ',
    'hàng này là bột ạ', 'cái này là máy', 'đây là bột', 'dạ vâng cái này là máy ạ',
    'cái này là máy in ạ', 'đây là máy nhé', 'cái đó là máy']) {
    assert.equal(asksIfBot(s), false, s);
  }
  // Cùng câu nhưng tiểu từ hỏi thật thì vẫn phải nhận ra
  for (const s of ['cái này là máy à', 'bạn là bot à', 'đây là máy hả', 'mày là máy à']) {
    assert.equal(asksIfBot(s), true, s);
  }
  // Khách gọi thẳng bot ("bạn/mày") thì không cần tiểu từ: chủ ngữ đã trỏ vào bot.
  assert.equal(asksIfBot('bạn là bot'), true);
});

// Chủ ngữ ngôi thứ nhất ("hàng của anh", "lô của em"): khách tự chỉ MÌNH và hàng của mình, không
// phải gọi bot. Đây là lớp câu đông nhất của bot CSKH hải quan, và là chỗ dễ đi vòng qua chốt
// "ạ"/"à" nhất — nếu chủ ngữ không cần tiểu từ hỏi thì có "ạ" hay không cũng khớp như nhau.
test('asksIfBot: khách tả hàng CỦA MÌNH không phải hỏi danh tính', () => {
  for (const s of ['hàng của anh là máy ạ', 'mặt hàng của chị là bột ạ', 'lô của anh là máy',
    'của em là bột', 'hàng của mình là máy ạ', 'đơn của em là bột ạ',
    'anh là người nhập khẩu', 'em là người khai thuê ạ', 'chị là chủ hàng ạ']) {
    assert.equal(asksIfBot(s), false, s);
  }
  // Nhưng ngôi thứ nhất + tiểu từ hỏi THẬT thì vẫn là hỏi danh tính
  for (const s of ['em là người thật không', 'anh là bot à', 'mình là bot à']) {
    assert.equal(asksIfBot(s), true, s);
  }
});

test('asksIfBot: "chỉ" (only) không phải "chị" — normVi làm hai từ trùng nhau', () => {
  for (const s of ['hàng này chỉ là máy', 'nó chỉ là máy.', 'cái này chỉ là bột ạ',
    'đây chỉ là máy mẫu', 'lô này chỉ là bột đá']) {
    assert.equal(asksIfBot(s), false, s);
  }
});

test('asksIfBot: "đó" chỉ định/nhấn mạnh không phải tiểu từ hỏi', () => {
  for (const s of ['cái này là máy đó ạ', 'đây là bột đó', 'hàng này là máy đó ạ',
    'cái đó là máy đó']) {
    assert.equal(asksIfBot(s), false, s);
  }
});

test('asksIfBot: "không" giữa câu không phải câu hỏi danh tính', () => {
  for (const s of ['cái này là máy không chịu thuế', 'cái này là bột không phải hạt',
    'đây là máy không cần giấy phép']) {
    assert.equal(asksIfBot(s), false, s);
  }
});

test('asksIfBot: "có phải X không" chỉ tính khi X là vị ngữ của "phải"', () => {
  for (const s of ['có phải máy này chịu thuế không', 'có phải bột mì thuế 5% không',
    'có phải ai khai cũng được không', 'có phải máy móc thì miễn thuế không',
    'có phải máy này miễn thuế không', 'có phải bột này cấm nhập không',
    'có phải người nhập khẩu phải ký không']) {
    assert.equal(asksIfBot(s), false, s);
  }
  for (const s of ['có phải bot không', 'có phải là người thật không']) {
    assert.equal(asksIfBot(s), true, s);
  }
});

// ---- Biến thể khách hay gõ ----

test('wantsHuman: các cách nói khác', () => {
  for (const s of ['em muốn gặp người thật', 'cho gặp tư vấn viên với ạ', 'nhân viên đâu rồi ạ',
    'gọi điện cho em nhé', 'cho xin liên hệ nhân viên OZ', 'có nhân viên nào trực không ạ',
    'CHO EM GẶP NHÂN VIÊN', 'cho em gặp người với ạ', 'nối máy cho nhân viên giúp em',
    'chuyển cho nhân viên giúp em'])
    assert.equal(wantsHuman(s), true, s);
});

test('asksIfBot: các cách nói khác', () => {
  for (const s of ['đây là người hay máy ạ', 'có phải bot không', 'bạn là AI à',
    'em là người thật không', 'đang chat với bot hay người thế', 'trợ lý ảo đúng không'])
    assert.equal(asksIfBot(s), true, s);
});

// Xin gặp người theo cách gián tiếp: xin số, xin nối, hỏi có ai hỗ trợ. Bỏ sót nhóm này nặng hơn
// mở phiếu thừa (FR-014) nên để `wantsHuman` nhận.
test('wantsHuman: xin gặp người nói gián tiếp', () => {
  for (const s of ['cho em số điện thoại nhân viên', 'kết nối em với nhân viên',
    'bên mình có ai hỗ trợ không', 'cho em xin số nhân viên tư vấn',
    'nối em với tư vấn viên với', 'nối em qua nhân viên đi', 'có ai tư vấn giúp em không'])
    assert.equal(wantsHuman(s), true, s);
});

// Cái giá của nhóm gián tiếp trên: "nối"/"số" là hai từ nghiệp vụ đụng nhau sau khi bỏ dấu
// ("nội dung", "nơi", "nói"; "số nhân viên" = đếm người, "so sánh"). Ghim lại để lần sau nới
// nhóm gián tiếp thì thấy ngay mình đang mở cửa cho câu nào.
test('wantsHuman: "nối"/"số" trong câu nghiệp vụ không phải xin gặp người', () => {
  for (const s of ['nội dung nhân viên ghi trên tờ khai', 'nơi làm việc của nhân viên khai hải quan',
    'nội dung tư vấn viên nói hôm qua', 'bên em nói nhân viên kia rồi', 'nội thất nhân viên lắp đặt',
    'số nhân viên khai hải quan bên em là 3', 'bên em có số nhân viên ít',
    'so sánh nhân viên hai bên', 'số tờ khai nhân viên đã nộp',
    'ai cũng tư vấn mã này không giống nhau',
    // "số máy" trong tờ khai là số máy/số khung của hàng, không phải số điện thoại
    'số máy trên nhãn nhân viên ghi sai', 'số máy bơm là 8413',
    // "nói qua/sang" là kể lại việc đã làm, không phải xin nối ("nói VỚI nhân viên" thì mới tính —
    // câu đó gần như luôn là lời xin gặp người, nên cố tình nhận: bỏ sót nặng hơn mở phiếu thừa)
    'hàng nói qua nhân viên kho rồi chuyển', 'nói sang tờ khai nhân viên lập'])
    assert.equal(wantsHuman(s), false, s);
});

// Chủ ý: "người phụ trách" là vai NGHIỆP VỤ (người phụ trách lô hàng bên khách), không phải lời xin
// gặp nhân viên OZ. Ghim để lần sau sửa `VAI_NGHIEP_VU` thì thấy ngay mình đang đổi chủ ý này.
test('wantsHuman: "người phụ trách" tính là vai nghiệp vụ, không phải xin gặp nhân viên OZ', () => {
  assert.equal(wantsHuman('em cần gặp người phụ trách'), false);
  assert.equal(wantsHuman('gặp người phụ trách lô hàng này'), false);
  // Nói rõ "nhân viên" thì vẫn nhận
  assert.equal(wantsHuman('em cần gặp nhân viên phụ trách'), true);
});

// Chủ ý: "ai" trần sau "nói chuyện với" là hỏi danh tính người đang trả lời → `asksIfBot`.
test('asksIfBot: "đang nói chuyện với ai" là hỏi danh tính', () => {
  assert.equal(asksIfBot('đang nói chuyện với ai đấy'), true);
  assert.equal(asksIfBot('em đang nói chuyện với ai ạ'), true);
  // Nhưng "ai" trong câu nghiệp vụ thì không
  assert.equal(asksIfBot('ai là người khai hải quan'), false);
});

// ---- "hay" hai nghĩa: "X hay Y" (hỏi danh tính) và "thường hay" (tần suất) ----
// Hướng này nặng hơn hướng kia: bỏ sót lời khách xin gặp người là trái FR-014 (`spec.md:233`).

test('wantsHuman: "hay" nghĩa "thường hay" không được chặn lời xin gặp người', () => {
  for (const s of ['máy hay bị lỗi, cho em gặp nhân viên với',
    'ai hay làm thủ tục này, cho em gặp nhân viên',
    'bot hay trả lời sai, cho em gặp người thật',
    'cái này người hay nhập từ Trung Quốc, cho em gặp tư vấn viên'])
    assert.equal(wantsHuman(s), true, s);
  // "hay" tần suất trong câu tả hàng thuần thì không phải ý nào cả
  for (const s of ['máy hay bị kẹt giấy, mã HS nào', 'ai hay khai mã này nhất',
    'bột hay bị ẩm, đóng gói sao']) {
    assert.equal(wantsHuman(s), false, s);
    assert.equal(asksIfBot(s), false, s);
  }
});

test('wantsHuman: câu hỏi danh tính thuần vẫn không phải lời xin gặp người', () => {
  for (const s of ['bạn là người hay máy', 'đây là người hay bot ạ', 'người hay máy đấy'])
    assert.equal(wantsHuman(s), false, s);
});

test('wantsHuman: "ai ở đây cũng…" nghĩa mọi người, không phải hỏi có ai trực', () => {
  for (const s of ['ai ở đây cũng khai sai mã này', 'ai ở đây cũng bảo mã 8413',
    'ai ở đây cũng làm thế'])
    assert.equal(wantsHuman(s), false, s);
  for (const s of ['có ai ở đây không ạ', 'có ai trực không', 'ai đang trực ạ'])
    assert.equal(wantsHuman(s), true, s);
});

test('không phải chuỗi thì trả false, không ném lỗi', () => {
  for (const v of [undefined, 0, 123, {}, [], true]) {
    assert.equal(wantsHuman(v), false);
    assert.equal(asksIfBot(v), false);
  }
});

test('asksIfBot: "có phải X không" — "không" phải kết thúc mệnh đề, "không" phủ định giữa câu không tính', () => {
  for (const s of ['có phải máy không chịu thuế', 'có phải máy không có C/O thì thuế cao không ạ',
    'có phải bột không có giấy kiểm dịch thì bị giữ không',
    'có phải máy không mới 100% phải xin giấy phép không', 'có phải bot không phải đóng thuế à'])
    assert.equal(asksIfBot(s), false, s);
  for (const s of ['có phải bot không ạ', 'có phải bot không à', 'có phải máy không vậy',
    'có phải bot đó không', 'có phải người thật không?', 'có phải bot không, cho anh hỏi thuế máy bơm'])
    assert.equal(asksIfBot(s), true, s);
});
