#!/usr/bin/env node
// Cổng máy cho wiki (docs/wiki): không gọi AI, không dependency.
// Kiểm: trích dẫn trỏ tới file có thật, link nội bộ sống, trang nào cũng có trong mục lục, có dòng cập nhật,
// không còn chỗ trống, không lộ IP nội bộ/khoá/số điện thoại (repo công khai).
// Dùng: node scripts/kiem-wiki.mjs [--nghiem]   (--nghiem: trích dẫn vượt số dòng cũng tính là lỗi)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const GOC = process.cwd();
const WIKI = join(GOC, 'docs/wiki');
const NGHIEM = process.argv.includes('--nghiem');
if (!existsSync(WIKI)) {
  console.log('Chưa có docs/wiki: bỏ qua.');
  process.exit(0);
}

const KHONG_CAN_TRICH = new Set(['index.md', 'log.md', 'thuat-ngu.md']);
const TOI_THIEU_TRICH = 5;
const loi = [];
const canhBao = [];
const them = (trang, ma, moTa, cachSua) => loi.push({ trang, ma, moTa, cachSua });

const trang = readdirSync(WIKI).filter((f) => f.endsWith('.md'));
const soDong = new Map();
const demDong = (p) => {
  if (!soDong.has(p)) soDong.set(p, readFileSync(p, 'utf8').split('\n').length);
  return soDong.get(p);
};
const bo = (s) => s.replace(/```[\s\S]*?```/g, '');

for (const ten of trang) {
  const noiDung = readFileSync(join(WIKI, ten), 'utf8');
  const chu = bo(noiDung);

  if (!/^# \S/m.test(noiDung)) them(ten, 'THIEU_TIEU_DE', 'Không có tiêu đề cấp 1.', 'Thêm dòng "# Tên trang" ở đầu.');
  if (!KHONG_CAN_TRICH.has(ten) && !/Cập nhật: \d{4}-\d{2}-\d{2} · commit: [0-9a-f]{7}/.test(noiDung)) {
    them(ten, 'THIEU_MOC', 'Thiếu dòng mốc cập nhật.', 'Thêm "> Cập nhật: YYYY-MM-DD · commit: abc1234" (commit của code đã đọc).');
  }

  // Trích dẫn dạng `core/gate.js` hoặc `core/gate.js:42` hoặc `core/gate.js:42-60`
  const trich = [...chu.matchAll(/`([A-Za-z0-9_.\-/]+\.(?:js|mjs|json|md|yml|yaml|sh)):?(\d+)?(?:-(\d+))?`/g)];
  let hopLe = 0;
  for (const [, tep, dau, cuoi] of trich) {
    const p = join(GOC, normalize(tep));
    if (!existsSync(p)) {
      them(ten, 'TRICH_DAN_SAI', `Trích dẫn file không có: ${tep}`, 'Sửa đúng đường dẫn hoặc bỏ nhận định chưa kiểm được.');
      continue;
    }
    hopLe++;
    const dong = Number(cuoi || dau || 0);
    if (dong > demDong(p)) {
      const moTa = `${tep}:${dong} vượt độ dài file (${demDong(p)} dòng).`;
      if (NGHIEM) them(ten, 'DONG_SAI', moTa, 'Đọc lại file và sửa số dòng.');
      else canhBao.push(`${ten}: ${moTa}`);
    }
  }
  if (!KHONG_CAN_TRICH.has(ten) && hopLe < TOI_THIEU_TRICH) {
    them(ten, 'IT_TRICH_DAN', `Chỉ có ${hopLe} trích dẫn hợp lệ (cần ≥ ${TOI_THIEU_TRICH}).`, 'Mỗi nhận định về code phải kèm `file:dòng` đã đọc thật.');
  }

  // Link nội bộ
  for (const [, dich] of chu.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)(?:#[^)]*)?\)/g)) {
    if (!existsSync(join(dirname(join(WIKI, ten)), dich))) {
      them(ten, 'LINK_HONG', `Link không tới được: ${dich}`, 'Sửa đường dẫn tương đối hoặc tạo trang đó.');
    }
  }

  // Chỗ trống
  const trong = chu.match(/\bTODO\b|\bTBD\b|\bFIXME\b|\?\?\?|\[(?:điền|cần bổ sung)[^\]]*\]/);
  if (trong) them(ten, 'CON_CHO_TRONG', `Còn chỗ trống: ${trong[0]}`, 'Điền nội dung thật, hoặc ghi "chưa xác minh" nếu chưa kiểm được.');

  // Bí mật: repo công khai
  const lo = noiDung.match(/\b192\.168\.\d+\.\d+|\b10\.\d+\.\d+\.\d+\b|\bsk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|\b0\d{9}\b/);
  if (lo) them(ten, 'LO_BI_MAT', 'Có dấu hiệu IP nội bộ, khoá hoặc số điện thoại.', 'Xoá khỏi wiki: repo công khai.');
}

// Trang mồ côi
if (!trang.includes('index.md')) {
  them('index.md', 'THIEU_MUC_LUC', 'Không có docs/wiki/index.md.', 'Tạo mục lục.');
} else {
  const mucLuc = readFileSync(join(WIKI, 'index.md'), 'utf8');
  for (const ten of trang) {
    if (ten !== 'index.md' && !mucLuc.includes(`(${ten})`) && !mucLuc.includes(`(./${ten})`)) {
      them(ten, 'MO_COI', 'Trang không có trong mục lục.', `Thêm link tới ${ten} vào docs/wiki/index.md.`);
    }
  }
}

// Khớp số liệu Success Criteria (SC) giữa tien-do.md và specs/001-nen-tang-chung/sc-do.md
const scDoPath = join(GOC, 'specs/001-nen-tang-chung/sc-do.md');
if (existsSync(scDoPath)) {
  const scNoiDung = readFileSync(scDoPath, 'utf8');
  const dongTrangThai = scNoiDung.split('\n').find((d) => /Trạng thái:/i.test(d));
  if (dongTrangThai) {
    const scMatches = [...dongTrangThai.matchAll(/(\d+)\/9\b/g)];
    if (scMatches.length >= 2) {
      const x = Number(scMatches[0][1]);
      const y = Number(scMatches[1][1]);
      const hopLeSC = new Set([x, y]);

      const tienDoPath = join(WIKI, 'tien-do.md');
      if (existsSync(tienDoPath)) {
        const tienDoNoiDung = readFileSync(tienDoPath, 'utf8');
        const reSC = /(?:(\d+)\/9(?:\s+tiêu chí)?\s*(?:\*\*\s*)?[đĐ]ạt|[đĐ]ạt\s*(?:\*\*\s*)?(\d+)\/9)/gi;
        let match;
        while ((match = reSC.exec(tienDoNoiDung)) !== null) {
          const n = Number(match[1] || match[2]);
          if (!hopLeSC.has(n)) {
            them(
              'tien-do.md',
              'LECH_SC',
              `Lệch số tiêu chí SC: "${match[0]}" (${n}/9) khác ${x}/9 và ${y}/9 từ sc-do.md.`,
              'chép lại từ sc-do.md'
            );
          }
        }
      }
    }
  }
}

for (const c of canhBao) console.log('! ' + c);
if (loi.length) {
  for (const l of loi) console.log(`✗ ${relative(GOC, join(WIKI, l.trang))} [${l.ma}] ${l.moTa} → ${l.cachSua}`);
  console.log(`\nwiki: CHƯA ĐẠT (${loi.length} lỗi, ${trang.length} trang).`);
  process.exit(1);
}
console.log(`wiki: ĐẠT (${trang.length} trang).`);
