// Mở/append GitHub issue từ phát hiện giám sát — spec 007 User Story 2
// Không trùng (cùng mã + chế độ → comment vào issue cũ), ẩn danh bằng chứng, giới hạn 5 issue mới/repo/ngày.
import { execFileSync } from 'child_process';

const GH = (args, input) =>
  execFileSync('gh', input ? [...args, '--body-file', '-'] : args, { encoding: 'utf8', input });

const LABELS = { 'zalo-bot': 'ozvietnam/zalo-bot', 'ozplugin': 'ozvietnam/ozplugin', 'hs-code-api': 'ozvietnam/hs-code-api' };
const MAX_ISSUE_MOI_NGAY = 5;

/**
 * @param {Array} phatHien — từ tinhHieu()
 * @param {object} opts — { dryRun?: boolean, ngay: string, redactFn?: (s)=>string }
 * @returns {{moi:Array, comment:Array, boViGioiHan:Array}}
 */
export function xuLyIssue(phatHien, { dryRun = false, ngay, redactFn = (s) => s } = {}) {
  const ketQua = { moi: [], comment: [], boViGioiHan: [] };
  const demMoi = {}; // repo → số issue mới hôm nay

  for (const p of phatHien) {
    const repo = LABELS[p.repo] || LABELS['zalo-bot'];
    const tieuDe = `[giám sát] ${p.ma}${p.cheDo ? `: ${p.cheDo}` : ''} — ${p.moTa.slice(0, 60)}`;
    const nhan = `giam-sat,${p.ma}`;
    const body = dichVanBan(p, ngay, redactFn);

    // Tìm issue cũ cùng mã đã mở (chưa đóng)
    const query = `repo:${repo} is:issue is:open label:giam-sat label:${p.ma}`;
    let cu = null;
    if (!dryRun) {
      try {
        const out = GH(['search', 'issues', query, '--json', 'number,title', '--limit', '1']);
        const list = JSON.parse(out);
        if (list.length > 0) cu = list[0];
      } catch { /* offline / chưa có gh */ }
    }

    if (cu) {
      // append comment vào issue cũ
      const comment = `**+1 ngày (${ngay}):** ${p.soDo}`;
      if (!dryRun) {
        try { GH(['issue', 'comment', String(cu.number), '-R', repo], comment); } catch {}
      }
      ketQua.comment.push({ repo, issue: cu.number, ma: p.ma });
    } else {
      // giới hạn issue mới / repo / ngày
      demMoi[repo] = (demMoi[repo] || 0) + 1;
      if (demMoi[repo] > MAX_ISSUE_MOI_NGAY) {
        ketQua.boViGioiHan.push({ repo, ma: p.ma, lyDo: `đã mở ${MAX_ISSUE_MOI_NGAY} issue mới cho ${repo} hôm nay` });
        continue;
      }
      if (!dryRun) {
        try { GH(['issue', 'create', '-R', repo, '--title', tieuDe, '--label', nhan], body); } catch {}
      }
      ketQua.moi.push({ repo, tieuDe, ma: p.ma });
    }
  }
  return ketQua;
}

function dichVanBan(p, ngay, redact) {
  const bangChung = (p.bangChung || []).map((b, i) => {
    const j = JSON.stringify(b);
    return `${i + 1}. \`${redact(j.slice(0, 200))}\``;
  }).join('\n');
  return `## Số đo
${p.soDo} — ngày ${ngay}

## Bằng chứng (đã ẩn danh)
${bangChung || '(không có)'}

## Câu hỏi cho repo
${cauHoi(p.ma)}

## Cách đo lại
Chạy lại \`scripts/giam-sat.mjs\` ngày mai; tín hiệu giảm dưới ngưỡng = đã xử lý.

---
*Sinh tự động bởi agent giám sát (spec 007) — không phải con người viết.*`;
}

function cauHoi(ma) {
  const Q = {
    'GATE-LEAK': 'Tin nào bị lộ? Xem audit log để tìm đường lộ và bịt.',
    'GATE-MONEY': 'Gói nào soạn số tiền không có căn cứ? Kiểm tra prompt soạn câu.',
    'TOOL-ERR': 'Công cụ này có cần timeout riêng / retry / fallback không?',
    'TOOL-EMPTY': 'Đầu vào nào khiến công cụ trả rỗng? Có cần thêm dữ liệu hay sửa prompt?',
    'JOB-EXPIRED': 'Việc nền treo vì lỗi gì? Tăng expires_at hay thêm cơ chế dọn việc chết?',
    'HOI-LAI': 'Câu trả lời bot thiếu thông tin gì khiến khách phải hỏi lại?',
    'NGUOI-THAY': 'Câu trả lời bot chưa đủ ở điểm nào khiến nhân viên phải vào?',
    'KHACH-BUC': 'Khách thất vọng về điều gì? Câu chữ, tốc độ, hay chất lượng câu trả lời?',
    'XIN-LOI-TAY': 'Bot đã gửi gì sai? Nhân viên phải xin lỗi thay bot ở đâu?',
  };
  return Q[ma] || 'Xem bằng chứng để quyết định cần nâng cấp gì.';
}
