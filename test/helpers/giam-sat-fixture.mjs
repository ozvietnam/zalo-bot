// Fixture sinh dữ liệu mẫu chứa đủ 9 loại lỗi cho agent giám sát (spec 007, SC-001)
// Cấm để lộ token thật, số điện thoại thật (chỉ dùng 0912345678 nếu có), IP nội bộ.

/**
 * Sinh dữ liệu mẫu chứa chính xác 9 loại lỗi vượt ngưỡng của tinhHieu, không dư lỗi nào.
 * @param {string} [ngay='2026-11-06'] Ngày phân tích (định dạng YYYY-MM-DD)
 * @returns {{ messages: Array, outbox: Array, jobs: Array, audit: Array, ngay: string, hienTai: string }}
 */
export function taoDbMau9Loi(ngay = '2026-11-06') {
  const hienTai = `${ngay}T23:59:59Z`;

  // 1. GATE-LEAK: min 1 -> 1 bản ghi outbox chặn vì lộ bí mật
  // 2. GATE-MONEY: min 1 -> 1 bản ghi outbox chặn vì số tiền
  const outbox = [
    {
      chat_id: 'chat-leak-001',
      turn_id: 'turn-leak-001',
      decision: 'block',
      reason: 'leak:sk-gia-loi-goc',
      created_at: `${ngay}T08:00:00Z`,
      sent_at: null,
    },
    {
      chat_id: 'chat-money-001',
      turn_id: 'turn-money-001',
      decision: 'block',
      reason: 'money:khong-can-cu',
      created_at: `${ngay}T08:15:00Z`,
      sent_at: null,
    },
  ];

  // 3. TOOL-ERR: min 3 -> 3 audit tool_error với tool 'tra_thue'
  // 4. TOOL-EMPTY: min 3 -> 3 audit tool_empty với tool 'tra_bieu_thue'
  const audit = [
    {
      at: `${ngay}T09:00:00Z`,
      turn_id: 'turn-tool-err-001',
      chat_id: 'chat-tool-err-001',
      type: 'tool_error',
      data: JSON.stringify({ tool: 'tra_thue', error: 'Cổng báo timeout' }),
    },
    {
      at: `${ngay}T09:01:00Z`,
      turn_id: 'turn-tool-err-002',
      chat_id: 'chat-tool-err-001',
      type: 'tool_error',
      data: JSON.stringify({ tool: 'tra_thue', error: 'Cổng 502' }),
    },
    {
      at: `${ngay}T09:02:00Z`,
      turn_id: 'turn-tool-err-003',
      chat_id: 'chat-tool-err-002',
      type: 'tool_error',
      data: JSON.stringify({ tool: 'tra_thue', error: 'Mất kết nối' }),
    },
    {
      at: `${ngay}T09:10:00Z`,
      turn_id: 'turn-tool-empty-001',
      chat_id: 'chat-tool-empty-001',
      type: 'tool_empty',
      data: JSON.stringify({ tool: 'tra_bieu_thue' }),
    },
    {
      at: `${ngay}T09:11:00Z`,
      turn_id: 'turn-tool-empty-002',
      chat_id: 'chat-tool-empty-001',
      type: 'tool_empty',
      data: JSON.stringify({ tool: 'tra_bieu_thue' }),
    },
    {
      at: `${ngay}T09:12:00Z`,
      turn_id: 'turn-tool-empty-003',
      chat_id: 'chat-tool-empty-002',
      type: 'tool_empty',
      data: JSON.stringify({ tool: 'tra_bieu_thue' }),
    },
  ];

  // 5. JOB-EXPIRED: min 1 -> 1 job status pending và expires_at < now
  const jobs = [
    {
      pack: 'hs',
      ma_luot: 'turn-job-exp-001',
      status: 'pending',
      expires_at: `${ngay}T07:00:00Z`,
      done_at: null,
      created_at: `${ngay}T06:30:00Z`,
    },
  ];

  // 6. HOI-LAI: min 3 phòng -> 3 phòng có khách hỏi câu tương tự trong 30 phút sau bot
  // 7. NGUOI-THAY: min 3 phòng -> 3 phòng nhân viên trả lời trong 15 phút sau bot
  // 8. KHACH-BUC: min 2 phòng -> 2 phòng có từ khoá khách bực
  // 9. XIN-LOI-TAY: min 1 -> 1 phòng nhân viên gõ xin lỗi ngay sau tin bot
  const messages = [
    // --- HOI-LAI (3 phòng) ---
    {
      chat_id: 'chat-hoi-lai-001',
      turn_id: 'turn-hl-1a',
      speaker: 'khach',
      text: 'thủ tục nhập khẩu son môi từ hàn quốc',
      at: `${ngay}T10:00:00Z`,
    },
    {
      chat_id: 'chat-hoi-lai-001',
      turn_id: 'turn-hl-1b',
      speaker: 'bot',
      text: 'Thủ tục nhập khẩu son môi gồm công bố mỹ phẩm và kiểm tra chất lượng.',
      at: `${ngay}T10:00:05Z`,
    },
    {
      chat_id: 'chat-hoi-lai-001',
      turn_id: 'turn-hl-1c',
      speaker: 'khach',
      text: 'thủ tục nhập khẩu son môi từ hàn quốc thế nào ạ',
      at: `${ngay}T10:05:00Z`,
    },

    {
      chat_id: 'chat-hoi-lai-002',
      turn_id: 'turn-hl-2a',
      speaker: 'khach',
      text: 'thuế nhập khẩu máy may công nghiệp',
      at: `${ngay}T10:10:00Z`,
    },
    {
      chat_id: 'chat-hoi-lai-002',
      turn_id: 'turn-hl-2b',
      speaker: 'bot',
      text: 'Thuế nhập khẩu máy may công nghiệp là 0%.',
      at: `${ngay}T10:10:05Z`,
    },
    {
      chat_id: 'chat-hoi-lai-002',
      turn_id: 'turn-hl-2c',
      speaker: 'khach',
      text: 'thuế nhập khẩu máy may công nghiệp ạ',
      at: `${ngay}T10:15:00Z`,
    },

    {
      chat_id: 'chat-hoi-lai-003',
      turn_id: 'turn-hl-3a',
      speaker: 'khach',
      text: 'mã hs cho hạt nhựa nguyên sinh',
      at: `${ngay}T10:20:00Z`,
    },
    {
      chat_id: 'chat-hoi-lai-003',
      turn_id: 'turn-hl-3b',
      speaker: 'bot',
      text: 'Mã HS hạt nhựa nguyên sinh thuộc nhóm 3901.',
      at: `${ngay}T10:20:05Z`,
    },
    {
      chat_id: 'chat-hoi-lai-003',
      turn_id: 'turn-hl-3c',
      speaker: 'khach',
      text: 'mã hs cho hạt nhựa nguyên sinh',
      at: `${ngay}T10:25:00Z`,
    },

    // --- NGUOI-THAY (3 phòng) ---
    {
      chat_id: 'chat-nguoi-thay-001',
      turn_id: 'turn-nt-1a',
      speaker: 'bot',
      text: 'Dạ bot chào anh chị.',
      at: `${ngay}T11:00:00Z`,
    },
    {
      chat_id: 'chat-nguoi-thay-001',
      turn_id: 'turn-nt-1b',
      speaker: 'nhan-vien',
      text: 'Chào anh, em là Hùng bên OZ hỗ trợ tiếp tục hồ sơ này.',
      at: `${ngay}T11:05:00Z`,
    },

    {
      chat_id: 'chat-nguoi-thay-002',
      turn_id: 'turn-nt-2a',
      speaker: 'bot',
      text: 'Bot trả lời câu hỏi.',
      at: `${ngay}T11:10:00Z`,
    },
    {
      chat_id: 'chat-nguoi-thay-002',
      turn_id: 'turn-nt-2b',
      speaker: 'nhan-vien',
      text: 'Chào chị Lan, chuyên viên xuất nhập khẩu tiếp quản ạ.',
      at: `${ngay}T11:12:00Z`,
    },

    {
      chat_id: 'chat-nguoi-thay-003',
      turn_id: 'turn-nt-3a',
      speaker: 'bot',
      text: 'Bot hướng dẫn tra cứu.',
      at: `${ngay}T11:20:00Z`,
    },
    {
      chat_id: 'chat-nguoi-thay-003',
      turn_id: 'turn-nt-3b',
      speaker: 'nhan-vien',
      text: 'Em tiếp nhận trao đổi thêm chi tiết lô hàng.',
      at: `${ngay}T11:25:00Z`,
    },

    // --- KHACH-BUC (2 phòng) ---
    {
      chat_id: 'chat-khach-buc-001',
      turn_id: 'turn-kb-001',
      speaker: 'khach',
      text: 'chả hiểu bot nói cái gì nữa',
      at: `${ngay}T13:00:00Z`,
    },
    {
      chat_id: 'chat-khach-buc-002',
      turn_id: 'turn-kb-002',
      speaker: 'khach',
      text: 'ko hiểu cách làm này thật sự',
      at: `${ngay}T13:05:00Z`,
    },

    // --- XIN-LOI-TAY (1 phòng) ---
    {
      chat_id: 'chat-xin-loi-001',
      turn_id: 'turn-xl-001a',
      speaker: 'bot',
      text: 'Gợi ý mã HS là 84713020.',
      at: `${ngay}T14:00:00Z`,
    },
    {
      chat_id: 'chat-xin-loi-001',
      turn_id: 'turn-xl-001b',
      speaker: 'nhan-vien',
      text: 'Dạ em xin lỗi gửi nhầm mã thuế của lô hàng trước.',
      at: `${ngay}T14:01:00Z`,
    },
  ];

  return { messages, outbox, jobs, audit, ngay, hienTai };
}
