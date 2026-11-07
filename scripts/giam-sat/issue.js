// Mở/append GitHub issue từ phát hiện giám sát — spec 007 User Story 2
// Không trùng (cùng mã + chế độ → comment vào issue cũ), ẩn danh bằng chứng, giới hạn 5 issue mới/repo/ngày.
// Dùng GitHub REST API (fetch) — không cần gh CLI trong container.
// Env: GITHUB_TOKEN (PAT có quyền issue:write trên các repo đích)

const LABELS = { 'zalo-bot': 'ozvietnam/zalo-bot', 'ozplugin': 'ozvietnam/ozplugin', 'hs-code-api': 'ozvietnam/hs-code-api' };
const MAX_ISSUE_MOI_NGAY = 5;

const GH_API = 'https://api.github.com';

async function gh(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('Thiếu GITHUB_TOKEN env');
  const r = await fetch(`${GH_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`GitHub API ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.json();
}

/** Tạo label nếu chưa có (idempotent, 404 = tạo mới) */
async function taoLabel(repo, name) {
  try {
    await gh(`/repos/${repo}/labels`, { method: 'POST', body: JSON.stringify({ name, color: 'd73a4a', description: 'Phát hiện bởi agent giám sát (spec 007)' }) });
  } catch (e) {
    if (!String(e.message).includes('422')) throw e; // 422 = đã có, OK
  }
}

/** Tìm issue mở cùng mã tín hiệu */
async function timIssueCu(repo, ma) {
  const q = `repo:${repo} is:issue is:open label:giam-sat label:${ma}`;
  const list = await gh(`/search/issues?q=${encodeURIComponent(q)}&per_page=1`);
  return list.items?.[0] || null;
}

/**
 * @param {Array} phatHien — từ tinhHieu()
 * @param {object} opts — { dryRun?: boolean, ngay: string, redactFn?: (s)=>string }
 * @returns {{moi:Array, comment:Array, boViGioiHan:Array, loi?:string}}
 */
export async function xuLyIssue(phatHien, { dryRun = false, ngay, redactFn = (s) => s } = {}) {
  const ketQua = { moi: [], comment: [], boViGioiHan: [], loi: null };
  const demMoi = {};
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  if (!token && !dryRun) {
    ketQua.loi = 'Thiếu GITHUB_TOKEN — không mở issue được (chỉ in console)';
    return ketQua;
  }

  // Tạo labels cần thiết một lần (chạy song song)
  if (!dryRun) {
    const tatCaLabel = new Set(phatHien.flatMap(p => ['giam-sat', p.ma]));
    for (const repo of new Set(phatHien.map(p => LABELS[p.repo]))) {
      for (const lb of tatCaLabel) {
        await taoLabel(repo, lb).catch(() => {});
      }
    }
  }

  for (const p of phatHien) {
    const repo = LABELS[p.repo] || LABELS['zalo-bot'];
    const tieuDe = `[giám sát] ${p.ma}${p.cheDo ? `: ${p.cheDo}` : ''} — ${p.moTa.slice(0, 60)}`;
    const labels = ['giam-sat', p.ma];
    const body = dichVanBan(p, ngay, redactFn);

    let cu = null;
    if (!dryRun) {
      cu = await timIssueCu(repo, p.ma).catch(() => null);
    }

    if (cu) {
      if (!dryRun) {
        await gh(`/repos/${repo}/issues/${cu.number}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body: `**+1 ngày (${ngay}):** ${p.soDo}` }),
        }).catch(() => {});
      }
      ketQua.comment.push({ repo, issue: cu.number, ma: p.ma });
    } else {
      demMoi[repo] = (demMoi[repo] || 0) + 1;
      if (demMoi[repo] > MAX_ISSUE_MOI_NGAY) {
        ketQua.boViGioiHan.push({ repo, ma: p.ma, lyDo: `đã mở ${MAX_ISSUE_MOI_NGAY} issue mới cho ${repo} hôm nay` });
        continue;
      }
      if (!dryRun) {
        await gh(`/repos/${repo}/issues`, {
          method: 'POST',
          body: JSON.stringify({ title: tieuDe, body, labels }),
        }).catch(() => {});
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
