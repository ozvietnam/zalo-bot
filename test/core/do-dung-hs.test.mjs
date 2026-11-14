// Test cho bộ đo độ đúng phân loại HS (scripts/do-dung-hs.mjs) — issue #177 yêu cầu 5.
// Đỏ trước: bộ đo phải CHẤM ĐÚNG trên đường bot thật, và bộ đề phải dựng từ VĂN BẢN PHÁP LUẬT
// (tên dòng biểu thuế + Thông báo kết quả phân loại), KHÔNG lấy từ oz-gold-final.jsonl hay tờ khai cũ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { docBoDe, chamMotCa, tongHop, docMaTuTin, chayBoDo, dungBaoCao, DUONG_BO_DE, CHO_MOT_CA_MS } from '../../scripts/do-dung-hs.mjs';
import { renderPhanLoaiDayDu, renderClassify } from '../../packs/hs/render.js';
import { renderPhanLoaiGiongQuyen } from '../../packs/hs/giong-quyen.js';

const ROOT = resolve(process.cwd());

test('bộ đề: có ≥ 30 ca, mỗi ca đủ mã 8 số + câu khách + căn cứ pháp luật', () => {
  const boDe = docBoDe();
  assert.ok(boDe.length >= 30, `bộ đề phải có ≥ 30 ca, đang có ${boDe.length}`);
  for (const ca of boDe) {
    assert.match(ca.ma, /^\d{8}$/, `mã đáp án phải là 8 số: ${ca.ma}`);
    assert.ok(ca.cauKhach.length >= 40, `câu khách quá ngắn ở ca ${ca.ma}`);
    // Căn cứ pháp luật: tên dòng biểu thuế + số hiệu Thông báo/công văn + trích nguyên văn.
    assert.ok(ca.tenDongBieuThue, `ca ${ca.ma} thiếu tên dòng biểu thuế`);
    assert.match(ca.nguon.soHieu, /\//, `ca ${ca.ma} thiếu số hiệu văn bản`);
    assert.ok(ca.nguon.trich.length >= 30, `ca ${ca.ma} thiếu trích nguyên văn căn cứ`);
    assert.match(ca.nguon.tepBieuThue, /tax\.json#\d{8}$/, `ca ${ca.ma} thiếu trỏ về dòng biểu thuế`);
  }
});

test('bộ đề: câu hỏi của khách KHÔNG chứa sẵn mã HS (không mớm đáp án)', () => {
  for (const ca of docBoDe()) {
    assert.doesNotMatch(ca.cauKhach, /\d{4}[.\s]?\d{2}[.\s]?\d{2}/,
      `ca ${ca.ma}: câu khách lộ mã HS nên phép đo thành vô nghĩa`);
  }
});

test('bộ đề: KHÔNG lấy từ bộ vàng oz-gold-final.jsonl hay tờ khai cũ (CEO 10/11 — bám luật)', () => {
  const raw = readFileSync(join(ROOT, DUONG_BO_DE), 'utf8');
  assert.doesNotMatch(raw, /oz-gold/i, 'bộ đề không được dẫn nguồn oz-gold-final.jsonl');
  assert.doesNotMatch(raw, /to-khai|tờ khai|ecus/i, 'bộ đề không được lấy từ tờ khai cũ');
  for (const ca of docBoDe()) {
    assert.match(ca.nguon.loai, /TB-TCHQ|CBP-CROSS-RULING|ABF-TCO|BIEU_THUE/,
      `ca ${ca.ma}: nguồn phải là văn bản pháp luật, đang là "${ca.nguon.loai}"`);
  }
});

test('bộ đề: ca có mã dễ lẫn thì mã lẫn phải khác mã đáp án', () => {
  for (const ca of docBoDe()) {
    for (const m of ca.maLan) {
      assert.match(m, /^\d{8}$/, `ca ${ca.ma}: mã lẫn sai khuôn ${m}`);
      assert.notEqual(m, ca.ma, `ca ${ca.ma}: mã lẫn trùng mã đáp án`);
    }
  }
});

// Người soát PR #204 điểm 2: hai ca chép tên nhóm/dòng biểu thuế vào ô "khách gõ".
// Khách thật không bao giờ gõ nguyên văn tên nhóm trong ngoặc kép của Thông báo; chép như vậy
// thì ca thiếu hẳn dữ kiện nhận dạng (polyme acrylic/vinyl…) và chấm bot trượt dù bot làm đúng luật.
const CHU = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

test('bộ đề: câu khách KHÔNG được chép nguyên văn tên nhóm/dòng biểu thuế trong trích dẫn', () => {
  for (const ca of docBoDe()) {
    const trongNgoac = [...ca.nguon.trich.matchAll(/[“"]([^”"]{20,})[”"]/g)].map((m) => CHU(m[1]));
    const dau = CHU(ca.cauKhach).slice(0, 50);
    for (const ten of trongNgoac) {
      assert.ok(!dau || !ten.includes(dau),
        `ca ${ca.ma}: câu khách là tên nhóm/dòng biểu thuế chép lại, không phải mô tả mặt hàng — "${ca.cauKhach.slice(0, 60)}…"`);
    }
  }
});

test('bộ đề: câu khách không bị cắt cụt giữa câu', () => {
  for (const ca of docBoDe()) {
    assert.doesNotMatch(CHU(ca.cauKhach), /\b(hoặc|và|của|trong|với|theo|từ|là|cho|khi)$/,
      `ca ${ca.ma}: câu khách cắt cụt giữa câu — "…${ca.cauKhach.slice(-40)}"`);
  }
});

test('bộ đề: KHÔNG dùng thông báo đính chính làm nguồn của một ca', () => {
  // Thông báo đính chính chỉ sửa câu chữ của một Thông báo khác: không có tên hàng, và mã trong
  // phần "nội dung đã ban hành" chính là mã SAI đang được sửa. Lấy làm đáp án là chấm theo mã sai.
  for (const ca of docBoDe()) {
    const nhacTbKhac = /Thông báo số\s*(\d+)\/TB-TCHQ/.exec(ca.nguon.trich);
    const soCuaCa = ca.nguon.soHieu.split('/')[0];
    assert.ok(!nhacTbKhac || nhacTbKhac[1] === soCuaCa,
      `ca ${ca.ma}: nguồn ${ca.nguon.soHieu} là đính chính của ${nhacTbKhac?.[1]}/TB-TCHQ, không phải thông báo phân loại gốc`);
  }
});

test('chấm một ca: đúng mã 8 số ở vị trí 1 → top-1 đạt và top-3 đạt', () => {
  const ca = { ma: '84137090', cauKhach: 'máy bơm nước ly tâm', maLan: [] };
  const r = chamMotCa(ca, ['84137090', '84139100', '84138190']);
  assert.equal(r.top1, true);
  assert.equal(r.top3, true);
  assert.equal(r.maBot, '84137090');
});

test('chấm một ca: đúng mã ở vị trí 3 → top-1 TRƯỢT, top-3 đạt', () => {
  const ca = { ma: '85094000', cauKhach: 'máy xay sinh tố gia dụng', maLan: [] };
  const r = chamMotCa(ca, ['85371099', '84381000', '85094000']);
  assert.equal(r.top1, false);
  assert.equal(r.top3, true);
});

test('chấm một ca: bot không ra mã nào → trượt cả hai, ghi rõ là không có mã', () => {
  const ca = { ma: '85094000', cauKhach: 'máy xay sinh tố', maLan: [] };
  const r = chamMotCa(ca, []);
  assert.equal(r.top1, false);
  assert.equal(r.top3, false);
  assert.equal(r.maBot, null);
  assert.match(r.lyDo, /không ra mã/i);
});

test('chấm một ca: chỉ đúng 6 số đầu thì KHÔNG tính là đúng (đo tám số)', () => {
  const ca = { ma: '85094000', cauKhach: 'máy xay sinh tố', maLan: [] };
  const r = chamMotCa(ca, ['85094090']);
  assert.equal(r.top1, false);
  assert.equal(r.top3, false);
  assert.equal(r.dung6So, true, 'phải ghi nhận đúng 6 số để người đọc biết lệch ở cấp nào');
});

test('chấm một ca: bot rơi vào đúng mã dễ lẫn của văn bản → ghi cờ roiVaoMaLan', () => {
  const ca = { ma: '70060090', cauKhach: 'mặt kính bảo vệ đã gia công', maLan: ['85369099', '70071990'] };
  const r = chamMotCa(ca, ['85369099']);
  assert.equal(r.top1, false);
  assert.equal(r.roiVaoMaLan, '85369099');
});

// Người soát PR #204 điểm 3: mã dễ lẫn hay cùng 6 số đầu với mã đúng (bộ đề có 6 ca như vậy).
// `dung6So` chặn trước thì lý do in ra là "lệch 2 số cuối" — nghe như sai nhỏ, trong khi thật ra
// bot đã rơi vào đúng cái mã văn bản loại trừ. Đó là lỗi nặng hơn và phải được gọi tên đúng.
test('chấm một ca: mã dễ lẫn cùng 6 số đầu → gọi tên "rơi vào mã dễ lẫn", không phải "lệch 2 số cuối"', () => {
  // Ca thật trong bộ đề: sạc pin 8504.40.19, mã văn bản loại trừ 8504.40.11 — cùng 6 số đầu.
  const ca = { ma: '85044019', cauKhach: 'sạc pin cho điện thoại di động', maLan: ['85044011', '85044090'] };
  const r = chamMotCa(ca, ['85044011']);
  assert.equal(r.top1, false);
  assert.equal(r.roiVaoMaLan, '85044011');
  assert.equal(r.dung6So, true, 'vẫn ghi nhận lệch ở cấp 2 số cuối để đếm được');
  assert.match(r.lyDo, /mã dễ lẫn/, `lý do phải nói rõ rơi vào mã dễ lẫn, đang là: ${r.lyDo}`);
});

test('bộ đề: còn đủ ca mã dễ lẫn cùng 6 số đầu để thứ tự chấm có ý nghĩa', () => {
  const soCa = docBoDe().filter((ca) => ca.maLan.some((m) => m.slice(0, 6) === ca.ma.slice(0, 6))).length;
  assert.ok(soCa >= 5, `bộ đề phải còn ≥ 5 ca mã lẫn cùng 6 số đầu, đang có ${soCa}`);
});

// Người soát PR #204 điểm 1: bot thật trả lời khách ở chat riêng bằng GIỌNG QUYÊN
// (packs/hs/giong-quyen.js) — "mã phù hợp nhất là {b}8509.40.00{/b}". Bộ đọc mã chỉ biết khuôn
// form đầy đủ thì mọi ca giọng Quyên bị chấm "không ra mã" → độ đúng thấp giả.
test('đọc mã từ tin: khuôn giọng Quyên — lấy được mã ở câu "mã phù hợp nhất là …"', () => {
  const tin = renderPhanLoaiGiongQuyen({
    tenHang: 'máy xay sinh tố gia dụng 350W',
    maHs: '85094000',
    phanLoai: { ketQua: { results: [{ hs: '85094000', nameVi: '- Máy chế biến thực phẩm' }] } },
    thue: { results: [{ hsCode: '85094000', nameVi: '- Loại khác', unitVi: 'cái', taxNkPreferential: 20, taxVat: 8 }] },
  });
  assert.deepEqual(docMaTuTin([tin]), ['85094000'], `không đọc được mã trong tin giọng Quyên:\n${tin}`);
});

test('đọc mã từ tin: khuôn giọng Quyên có giả định xuất xứ vẫn lấy đúng mã', () => {
  const tin = renderPhanLoaiGiongQuyen({
    tenHang: 'bột đậu nành đã rang',
    maHs: '12081000',
    phanLoai: { ketQua: { results: [{ hs: '12081000', nameVi: '- Từ đậu tương' }] } },
    thue: { results: [{ hsCode: '12081000', nameVi: '- Từ đậu tương', unitVi: 'kg', taxNkPreferential: 5 }] },
    giaDinh: 'xuất xứ Trung Quốc',
  });
  assert.deepEqual(docMaTuTin([tin]), ['12081000'], `không đọc được mã trong tin giọng Quyên có giả định:\n${tin}`);
});

test('đọc mã từ tin: KHÔNG nhặt mã trong dòng thuế/lưu ý của giọng Quyên', () => {
  // Dòng "• Thuế NK 20% (123/2023/TT-BTC)" và dòng lưu ý không mang mã bot đề xuất.
  const ds = docMaTuTin([[
    'Dạ máy xay sinh tố thì mã phù hợp nhất là {b}8509.40.00{/b} (máy chế biến thực phẩm) anh/chị nhé.',
    '• Thuế NK 20% (123/2023/TT-BTC); có C/O mẫu E hợp lệ thì còn 0%',
    '• Lưu ý: thuộc Danh mục 1810/2021/QĐ-BKHCN phải công bố hợp quy',
    'Anh/chị muốn em soạn luôn mô tả khai báo ạ?',
  ].join('\n')]);
  assert.deepEqual(ds, ['85094000'], `chỉ được lấy mã bot đề xuất, đang lấy: ${ds.join(', ')}`);
});

// Bộ đo chấm trên TIN GỬI KHÁCH, nên phải đọc đúng khuôn mà packs/hs/render.js thật đang in.
// Dựng tin bằng chính hàm render (không gõ tay chuỗi) để render đổi khuôn là test đỏ ngay.
test('đọc mã từ tin: khuôn kết quả đã chốt — mã đề xuất đứng trước 3 mã cân nhắc', () => {
  const tin = renderPhanLoaiDayDu({
    tenHang: 'bột đậu nành đã rang',
    maHs: '12081000',
    phanLoai: { ketQua: { results: [
      { hs: '12081000', reason: 'bột từ hạt có dầu chưa khử béo' },
      { hs: '21061000', reason: 'không phải chế phẩm thực phẩm 2106.90.00 vì chưa pha trộn' },
      { hs: '23040090', reason: 'không phải bã đậu tương' },
    ] } },
    thue: { results: [{ hsCode: '12081000', nameVi: '- Từ đậu tương', unitVi: 'kg', mfn: 5 }] },
  });
  assert.deepEqual(docMaTuTin([tin]).slice(0, 3), ['12081000', '21061000', '23040090']);
});

test('đọc mã từ tin: khuôn renderClassify — lấy đúng thứ tự 1,2,3', () => {
  const tin = renderClassify({ ketQua: { results: [
    { hs: '85094000', reason: 'máy xay thực phẩm gia dụng' },
    { hs: '85101000', reason: 'không phải máy cạo râu 8510.20.00' },
  ] } }, { title: 'Kết quả' });
  assert.deepEqual(docMaTuTin([tin]).slice(0, 2), ['85094000', '85101000']);
});

test('đọc mã từ tin: KHÔNG nhặt mã nằm trong lý do hay mục thuế/căn cứ', () => {
  const tin = renderPhanLoaiDayDu({
    tenHang: 'mặt kính bảo vệ',
    maHs: '70060090',
    phanLoai: { ketQua: { results: [{ hs: '70060090', reason: 'kính đã gia công, không phải 8536.90.99' }] } },
    thue: { results: [{ hsCode: '70060090', nameVi: '- Loại khác', unitVi: 'kg', mfn: 10 }] },
    thuTuc: { results: [{ vanBan: [{ so: '1810/TB-TCHQ' }] }] },
  });
  const ds = docMaTuTin([tin]);
  assert.deepEqual(ds, ['70060090'], `chỉ được lấy mã bot đề xuất, đang lấy: ${ds.join(', ')}`);
});

test('tổng hợp: báo top-1, top-3 tám số và thời gian trung bình', () => {
  const ketQua = [
    { ma: 'a', top1: true, top3: true, msCho: 1000 },
    { ma: 'b', top1: false, top3: true, msCho: 3000 },
    { ma: 'c', top1: false, top3: false, msCho: 2000 },
    { ma: 'd', top1: true, top3: true, msCho: 2000 },
  ];
  const t = tongHop(ketQua);
  assert.equal(t.tong, 4);
  assert.equal(t.top1, 2);
  assert.equal(t.top3, 3);
  assert.equal(t.top1Pct, '50.0');
  assert.equal(t.top3Pct, '75.0');
  assert.equal(t.msTrungBinh, 2000);
});

test('tổng hợp: 0 ca thì không chia cho 0', () => {
  const t = tongHop([]);
  assert.equal(t.tong, 0);
  assert.equal(t.top1Pct, '0.0');
  assert.equal(t.msTrungBinh, 0);
});

// TỰ KIỂM CÁI THƯỚC: chạy qua lõi thật với Cổng kịch bản.
// Cổng trả ĐÚNG mã của văn bản → bộ đo phải ra 100%; trả SAI → phải ra 0%.
// Thiếu test này thì một bộ đo luôn báo 0% (vì đọc sai tin, sai tên công cụ…) trông y như
// một con bot kém, và cả phép đo thành vô nghĩa.
function congKichBan(traMa) {
  const tools = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'kiem_tra_shtt']
    .map((name) => ({ name, description: name }));
  const calls = [];
  return {
    calls,
    async listTools() { return tools; },
    async callTool(name, args = {}) {
      calls.push({ name, args });
      const maHs = traMa(String(args.tenHang || args.moTa || args.maLuot || ''));
      if (name === 'phan_loai_hs' || name === 'ket_qua_phan_loai') {
        return { ok: true, maLuot: `ML-${maHs}`, trangThai: 'XONG', maHs, doChac: 0.95,
          data: { maHs, ketQua: { results: [{ hsCode: maHs, nameVi: 'Hàng kiểm thử', confidence: 0.95 }] } } };
      }
      if (name === 'tra_thue') {
        return { ok: true, data: { results: [{ hsCode: maHs, nameVi: 'Hàng kiểm thử', unitVi: 'kg', mfn: 5 }] } };
      }
      return { ok: true, data: { results: [] } };
    },
  };
}

// Chữ đệm mà lamGonCauHoi được phép bỏ ("của", "em", "shop"…). So khớp bỏ qua chúng để
// bài kiểm đo đúng cái cần đo: dữ kiện hàng hoá có còn đủ không, chứ không bắt bẻ chữ đệm.
const CHU_DEM = ['của', 'em', 'anh', 'chị', 'bạn', 'ad', 'shop', 'thì', 'vậy', 'nhé', 'nhỉ', 'ạ', 'ơi'];
function vanTay(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ').filter((w) => w && !CHU_DEM.includes(w)).join(' ');
}

test('tự kiểm cái thước: Cổng kịch bản trả ĐÚNG mã của văn bản → bộ đo báo 100%', async () => {
  const boDe = docBoDe();
  // Tra theo tên hàng khách gõ → mã đúng của ca đó, như một Cổng "biết hết".
  const theoTen = boDe.map((ca) => [vanTay(ca.cauKhach), ca.ma]);
  const res = await chayBoDo({
    boDe,
    env: {},
    im: true,
    customMcp: congKichBan((t) => {
      const vt = vanTay(t);
      for (const [ten, ma] of theoTen) if (vt.includes(ten)) return ma;
      return '85371099';
    }),
  });
  assert.equal(res.ok, true);
  const truot = res.ketQua.filter((r) => !r.top1).map((r) => `${r.ma}: ${r.lyDo}`);
  assert.equal(res.tomTat.top1, boDe.length, `bộ đo phải chấm đạt cả ${boDe.length} ca, lý do trượt: ${truot.join(' | ')}`);
  assert.equal(res.tomTat.top1Pct, '100.0');
});

test('giữ nguyên dữ kiện sau dấu ";": cả 50 ca của bộ đề đều tới phan_loai_hs đủ chữ', async () => {
  const boDe = docBoDe();
  const cong = congKichBan(() => '85371099');
  const res = await chayBoDo({ boDe, env: {}, im: true, customMcp: cong });
  assert.equal(res.ok, true);

  const daGui = cong.calls.filter((c) => c.name === 'phan_loai_hs').map((c) => vanTay(c.args.tenHang));
  assert.equal(daGui.length, boDe.length, 'mỗi ca phải gọi phan_loai_hs đúng một lần');

  const thieu = [];
  for (const ca of boDe) {
    // Mọi mệnh đề của câu khách — kể cả phần sau dấu ";" — phải còn trong tenHang đã gửi.
    const menhDe = ca.cauKhach.split(';').map((m) => vanTay(m)).filter((m) => m.length >= 3);
    const hit = daGui.find((t) => menhDe.every((m) => t.includes(m)));
    if (!hit) {
      const mat = menhDe.filter((m) => !daGui.some((t) => t.includes(m)));
      thieu.push(`${ca.ma} mất: ${mat.join(' / ').slice(0, 120)}`);
    }
  }
  assert.deepEqual(thieu, [], `các ca bị cắt dữ kiện:\n${thieu.join('\n')}`);
});

test('tự kiểm cái thước: Cổng kịch bản trả SAI mã → bộ đo báo 0%, không báo đạt bừa', async () => {
  const boDe = docBoDe().slice(0, 3);
  const res = await chayBoDo({ boDe, env: {}, im: true, customMcp: congKichBan(() => '85371099') });
  assert.equal(res.ok, true);
  assert.equal(res.tomTat.top1, 0);
  assert.equal(res.tomTat.top1Pct, '0.0');
});

// OZV-842: trần chờ mỗi ca phải phủ hết nhịp hỏi việc nền của lõi (6→18→42→90→150s, core/jobs.js:18-33)
// và vòng goiLai RETRY (20s + 60s). Trần cũ 120s cắt ngang giữa poll 4 và poll 5 → bài đo Cổng thật
// 13/11 mất 13/27 ca đúng mốc 120.0–121.0s, bị ghi oan là "bot không ra mã nào cho khách".
test('trần chờ mỗi ca phủ được nhịp poll 150s và vòng RETRY (≥ 180s)', () => {
  assert.ok(CHO_MOT_CA_MS >= 180_000, `trần chờ mỗi ca là ${CHO_MOT_CA_MS}ms, phải ≥ 180000ms`);
});

test('ca hết hạn chờ khi Cổng còn DANG_XU_LY → ghi hetHanCho, không tính là bot ra sai mã', async () => {
  const boDe = docBoDe().slice(0, 1);
  // Cổng nhận việc rồi treo mãi ở DANG_XU_LY: trần chờ ngắn (60ms) nên ca chắc chắn hết hạn.
  const congTreo = {
    calls: [],
    async listTools() {
      return ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'kiem_tra_shtt']
        .map((name) => ({ name, description: name }));
    },
    async callTool(name, args = {}) {
      this.calls.push({ name, args });
      if (name === 'phan_loai_hs') return { ok: true, data: { maLuot: 'ML-TREO', trangThai: 'DANG_XU_LY' } };
      if (name === 'ket_qua_phan_loai') return { ok: true, data: { maLuot: 'ML-TREO', trangThai: 'DANG_XU_LY' } };
      return { ok: true, data: { results: [] } };
    },
  };
  const res = await chayBoDo({ boDe, env: {}, im: true, customMcp: congTreo, timeoutMs: 60 });
  assert.equal(res.ok, true);
  const r = res.ketQua[0];
  assert.equal(r.maBot, null, 'ca treo thì không có mã nào của bot');
  assert.equal(r.hetHanCho, true, `phải đánh dấu hết hạn chờ, lyDo đang là: ${r.lyDo}`);
  assert.match(r.lyDo, /CHƯA có kết quả|hết hạn chờ/i, 'lý do phải nói rõ chưa có kết quả trong thời gian chờ');
  assert.doesNotMatch(r.lyDo, /không ra mã nào cho khách/, 'đừng ghi oan là bot không ra mã');
});

// OZV-852: ca Cổng treo (hetHanCho) là lỗi CÁI THƯỚC/Cổng, không phải "bot không ra mã".
// Gộp hai số vào một dòng thì bảng tổng hợp đọc ra tỷ lệ bot kém giả — phải đếm tách.
test('tổng hợp: ca hết hạn chờ Cổng đếm riêng, không cộng vào khongRaMa', () => {
  const ketQua = [
    { ma: 'a', maBot: '85071000', top1: true, top3: true, msCho: 1000 },
    { ma: 'b', maBot: null, hetHanCho: true, msCho: 240_000 },
    { ma: 'c', maBot: null, hetHanCho: true, msCho: 240_000 },
    { ma: 'd', maBot: null, msCho: 2000 },
  ];
  const t = tongHop(ketQua);
  assert.equal(t.tong, 4);
  assert.equal(t.hetHanCho, 2, 'phải đếm riêng 2 ca hết hạn chờ Cổng');
  assert.equal(t.khongRaMa, 1, 'chỉ ca không ra mã mà KHÔNG phải treo Cổng mới tính khongRaMa');
});

test('báo cáo: bảng Kết quả có dòng riêng cho ca hết hạn chờ Cổng', () => {
  const ketQua = [
    { ma: '85071000', maBot: '85071000', top1: true, top3: true, msCho: 1000, cauKhach: 'x', nguon: { soHieu: 'TB-1' } },
    { ma: '85072000', maBot: null, hetHanCho: true, msCho: 240_000, cauKhach: 'y', lyDo: 'CHƯA có kết quả', nguon: { soHieu: 'TB-2' } },
  ];
  const md = dungBaoCao({ ketQua, tomTat: tongHop(ketQua), isMock: false });
  assert.match(md, /Hết hạn chờ Cổng/, 'bảng Kết quả phải có dòng hết hạn chờ Cổng');
  assert.match(md, /\| Hết hạn chờ Cổng[^|]*\| 1\/2 \| 50\.0% \|/, `dòng hết hạn chờ phải ra 1/2 — 50.0%, bảng đang là:\n${md}`);
  assert.match(md, /\| Bot không ra mã nào \| 0\/2 \| 0\.0% \|/, 'ca treo Cổng không được cộng vào dòng bot không ra mã');
});
