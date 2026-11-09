// Mở/append GitHub issue từ phát hiện giám sát — spec 007 User Story 2
// Không trùng (chống trùng theo fingerprint), ẩn danh bằng chứng, trần 5 issue mới/repo/ngày, mở lại sau 3 ngày.
// Dùng GitHub REST API (fetch hoặc client được tiêm) — không cần gh CLI trong container.
// Env: GITHUB_TOKEN (PAT có quyền issue:write trên các repo đích)
import { createHash } from 'node:crypto';
import { anDanhVanBan } from './an-danh.js';

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

/** Lấy fingerprint định danh phát hiện */
export function layFingerprint(p) {
  return p.fingerprint || `${p.ma}${p.cheDo ? `:${p.cheDo}` : ''}`;
}

/** Sinh nhãn fingerprint fp:<8 ký tự sha256> */
export function layFpLabel(p) {
  const fp = layFingerprint(p);
  const h8 = createHash('sha256').update(fp).digest('hex').slice(0, 8);
  return `fp:${h8}`;
}

/** Kiểm tra phát hiện có vượt ngưỡng 3 ngày liền đối với issue đã đóng không (FR-008) */
function laVuotNguong3Ngay(p, issue) {
  if (typeof p.ngayLienTiep === 'number' && p.ngayLienTiep >= 3) return true;
  if (typeof p.soNgayVuot === 'number' && p.soNgayVuot >= 3) return true;
  if (typeof p.ngayVuotNguong === 'number' && p.ngayVuotNguong >= 3) return true;
  if (issue && typeof issue.comments === 'number' && issue.comments >= 3) return true;
  return false;
}

/** Ghi nhận lỗi vào ketQua.loi (mảng khi có lỗi, null khi không có lỗi để tương thích) */
function ghiLoi(ketQua, thongTinLoi) {
  if (!ketQua.loi) {
    ketQua.loi = [];
  }
  ketQua.loi.push(thongTinLoi);
}

/** Tạo label nếu chưa có (idempotent, 422 = đã có, OK) */
async function taoLabel(client, repo, name) {
  try {
    await client(`/repos/${repo}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name, color: 'd73a4a', description: 'Phát hiện bởi agent giám sát (spec 007)' }),
    });
  } catch (e) {
    if (!String(e.message).includes('422')) throw e; // 422 = đã có, OK
  }
}

/** Tìm issue cũ theo fingerprint (ưu tiên open, sau đó đến closed) */
async function timIssueCu(client, repo, fpLabel) {
  const q = `repo:${repo} is:issue label:giam-sat label:${fpLabel}`;
  const list = await client(`/search/issues?q=${encodeURIComponent(q)}&per_page=5`);
  const items = list?.items || [];
  const open = items.find(it => it.state === 'open');
  if (open) return open;
  const closed = items.find(it => it.state === 'closed');
  return closed || null;
}

/**
 * @param {Array} phatHien — từ tinhHieu()
 * @param {object} opts — { dryRun?: boolean, ngay: string, redactFn?: (s)=>string, mapKhach?: Map, ghClient?: Function }
 * @returns {Promise<{moi:Array, comment:Array, reopen:Array, boViGioiHan:Array, loi:Array|null}>}
 */
export async function xuLyIssue(phatHien, { dryRun = false, ngay, redactFn = (s) => s, mapKhach, ghClient } = {}) {
  const ketQua = { moi: [], comment: [], reopen: [], boViGioiHan: [], loi: null };
  const demMoi = {};
  const client = ghClient || gh;

  if (!dryRun && !ghClient) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      ghiLoi(ketQua, { loi: 'Thiếu GITHUB_TOKEN — không mở issue được (chỉ in console)' });
      return ketQua;
    }
  }

  // Tạo labels cần thiết một lần
  if (!dryRun) {
    const tatCaLabel = new Set();
    for (const p of phatHien) {
      tatCaLabel.add('giam-sat');
      tatCaLabel.add(p.ma);
      tatCaLabel.add(layFpLabel(p));
    }
    for (const repo of new Set(phatHien.map(p => LABELS[p.repo] || LABELS['zalo-bot']))) {
      for (const lb of tatCaLabel) {
        await taoLabel(client, repo, lb).catch(() => {});
      }
    }
  }

  for (const p of phatHien) {
    const repo = LABELS[p.repo] || LABELS['zalo-bot'];
    const fp = layFingerprint(p);
    const fpLabel = layFpLabel(p);
    const tieuDe = `[giám sát] ${p.ma}${p.cheDo ? `: ${p.cheDo}` : ''} — ${p.moTa.slice(0, 60)}`;
    const labels = ['giam-sat', p.ma, fpLabel];
    const body = dichVanBan(p, ngay, redactFn, mapKhach);

    let cu = null;
    if (!dryRun) {
      try {
        cu = await timIssueCu(client, repo, fpLabel);
      } catch (err) {
        ghiLoi(ketQua, { repo, ma: p.ma, fingerprint: fp, thaoTac: 'tim_issue', loi: err.message });
      }
    }

    if (cu && cu.state === 'open') {
      if (!dryRun) {
        try {
          await client(`/repos/${repo}/issues/${cu.number}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body: `**+1 ngày (${ngay}):** ${p.soDo}` }),
          });
          ketQua.comment.push({ repo, issue: cu.number, ma: p.ma, fingerprint: fp });
        } catch (err) {
          ghiLoi(ketQua, { repo, issue: cu.number, ma: p.ma, fingerprint: fp, thaoTac: 'comment', loi: err.message });
        }
      } else {
        ketQua.comment.push({ repo, issue: cu.number, ma: p.ma, fingerprint: fp });
      }
    } else if (cu && cu.state === 'closed') {
      if (laVuotNguong3Ngay(p, cu)) {
        if (!dryRun) {
          try {
            await client(`/repos/${repo}/issues/${cu.number}`, {
              method: 'PATCH',
              body: JSON.stringify({ state: 'open' }),
            });
            await client(`/repos/${repo}/issues/${cu.number}/comments`, {
              method: 'POST',
              body: JSON.stringify({ body: `**Mở lại sau 3 ngày vượt ngưỡng (${ngay}):** ${p.soDo}` }),
            }).catch(() => {});
            ketQua.reopen.push({ repo, issue: cu.number, ma: p.ma, fingerprint: fp, soDo: p.soDo });
          } catch (err) {
            ghiLoi(ketQua, { repo, issue: cu.number, ma: p.ma, fingerprint: fp, thaoTac: 'reopen', loi: err.message });
          }
        } else {
          ketQua.reopen.push({ repo, issue: cu.number, ma: p.ma, fingerprint: fp, soDo: p.soDo });
        }
      }
    } else {
      demMoi[repo] = (demMoi[repo] || 0) + 1;
      if (demMoi[repo] > MAX_ISSUE_MOI_NGAY) {
        ketQua.boViGioiHan.push({ repo, ma: p.ma, fingerprint: fp, lyDo: `đã mở ${MAX_ISSUE_MOI_NGAY} issue mới cho ${repo} hôm nay` });
        continue;
      }
      if (!dryRun) {
        try {
          await client(`/repos/${repo}/issues`, {
            method: 'POST',
            body: JSON.stringify({ title: tieuDe, body, labels }),
          });
          ketQua.moi.push({ repo, tieuDe, ma: p.ma, fingerprint: fp });
        } catch (err) {
          ghiLoi(ketQua, { repo, ma: p.ma, fingerprint: fp, thaoTac: 'tao_issue', loi: err.message });
        }
      } else {
        ketQua.moi.push({ repo, tieuDe, ma: p.ma, fingerprint: fp });
      }
    }
  }
  return ketQua;
}

export function dichVanBan(p, ngay, redact, mapKhach = new Map()) {
  const bangChung = (p.bangChung || []).map((b, i) => {
    const raw = typeof b === 'string' ? b : JSON.stringify(b);
    let sach = anDanhVanBan(raw, mapKhach);
    if (typeof redact === 'function') {
      sach = redact(sach);
    }
    return `${i + 1}. \`${sach.slice(0, 200)}\``;
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
