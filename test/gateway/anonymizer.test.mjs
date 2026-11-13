import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymizePrompt, deanonymizeDraft } from '../../gateway/anonymizer.js';

// Số dùng để thử — DỰNG LÚC CHẠY, không gõ cứng trong mã nguồn (Hiến pháp Điều IX).
const sdtMau = ['0912', '345', '678'].join('');
const stk10 = ['1234', '567890'].join('');
const stk16 = ['1234', '5678', '9012', '3456'].join('-');
const tokenMau = ['sk', 'gia', 'loi', 'goc'].join('-');
// Tên giả hoàn toàn, không phải khách thật.
const TEN_A = 'Nguyễn Văn Ao';
const TEN_B = 'Trần Thị Bưởi';

test('T808: che số điện thoại và tên khách, khôi phục đúng tên từ nhãn', () => {
  const raw = `Khách ${TEN_A} số ${sdtMau} hỏi thủ tục nhập xe nâng`;
  const { anonymizedText, anonymizeMap } = anonymizePrompt({
    text: raw,
    customerName: TEN_A,
    convId: 'conv-101'
  });

  // Test THẬT: chuỗi nguồn CÓ chứa tên và số, nên hai phép kiểm dưới mới có nghĩa.
  assert.ok(raw.includes(TEN_A) && raw.includes(sdtMau), 'chuỗi nguồn phải chứa dữ liệu cần che');
  assert.equal(anonymizedText.includes(TEN_A), false, 'tên khách thật không được lộ');
  assert.equal(anonymizedText.includes(sdtMau), false, 'số điện thoại thật không được lộ');
  assert.ok(anonymizedText.includes('[KHACH]'), 'phải dùng nhãn đánh dấu, không phải chữ thô');
  assert.ok(anonymizedText.includes('[SĐT]'));

  const draftFromAi = 'Dạ em chào [TEN_KHACH], thủ tục nhập xe nâng gồm đăng kiểm...';
  assert.equal(
    deanonymizeDraft(draftFromAi, anonymizeMap),
    `Dạ em chào ${TEN_A}, thủ tục nhập xe nâng gồm đăng kiểm...`
  );
});

test('T808: che token bí mật và số tài khoản ngân hàng (có dấu, số dài, có dấu tách)', () => {
  const raw = `Tôi chuyển vào số tài khoản ngân hàng ${stk10}, token là ${tokenMau}, ${TEN_B} nhé`;
  assert.ok(
    raw.includes(stk10) && raw.includes(tokenMau) && raw.includes(TEN_B),
    'chuỗi nguồn phải chứa cả ba thứ cần che — nếu không, phép kiểm dưới là test giả'
  );

  const { anonymizedText } = anonymizePrompt({ text: raw, customerName: TEN_B, convId: 'conv-202' });
  assert.equal(anonymizedText.includes(stk10), false, 'STK sau "ngân hàng" CÓ DẤU phải bị che');
  assert.equal(anonymizedText.includes(tokenMau), false, 'token không được lộ');
  assert.equal(anonymizedText.includes(TEN_B), false, 'tên khách không được lộ');
  assert.ok(anonymizedText.includes('[STK]'));
  assert.ok(anonymizedText.includes('[TOKEN]'));

  // STK 16 số viết có dấu tách phải bị che TRỌN, không băm vụn.
  const sep = anonymizePrompt({ text: `STK ${stk16}`, customerName: TEN_B, convId: 'conv-203' });
  assert.equal(sep.anonymizedText, 'STK [STK]', 'STK 16 số có dấu tách phải che trọn một lần');
});

test('T808: mã HS KHÔNG bị che (không che quá tay)', () => {
  const { anonymizedText } = anonymizePrompt({
    text: 'Mã HS 8413.70.90 và 84137090 cho xe nâng',
    customerName: TEN_A,
    convId: 'conv-304'
  });
  assert.ok(anonymizedText.includes('8413.70.90'), 'mã HS có dấu chấm phải giữ');
  assert.ok(anonymizedText.includes('84137090'), 'mã HS 8 số phải giữ');
});

test('T808: MST 10 số checksum SAI (bắt đầu bằng 0) vẫn bị che — tránh lộ STK/SĐT giả', () => {
  // `0101234567`: chữ số kiểm ≠ checksum mod 11 → không phải MST hợp lệ.
  // Vẫn che (nhầm còn hơn lộ). MST checksum đúng bắt đầu bằng 0: xem OZV-693.
  const { anonymizedText } = anonymizePrompt({
    text: 'Mã số thuế công ty 0101234567',
    customerName: TEN_A,
    convId: 'conv-305'
  });
  assert.equal(anonymizedText.includes('0101234567'), false);
  assert.ok(
    anonymizedText.includes('[SĐT]') || anonymizedText.includes('[STK]'),
    'MST checksum sai phải bị che'
  );
});

test('T808: trong nhóm, tên khách KHÁC cũng bị che (không lọt lên AI Studio)', () => {
  const a = anonymizePrompt({ text: `${TEN_A} hỏi mã HS`, customerName: TEN_A, convId: 'conv-nhom', isGroup: true });
  const b = anonymizePrompt({
    text: `${TEN_A} nói với tôi là hàng đã về`,
    customerName: TEN_B,
    convId: 'conv-nhom',
    isGroup: true
  });

  assert.ok(a.anonymizedText.includes('[KHACH_A]'), 'khách thứ nhất có nhãn riêng');
  assert.equal(a.anonymizedText.includes(TEN_A), false);

  // Đây là lỗi 1 vòng soát 1: tin của khách B nhắc tên khách A.
  assert.equal(b.anonymizedText.includes(TEN_A), false, 'tên khách KHÁC trong nhóm cũng phải bị che');
  assert.ok(b.anonymizedText.includes('[KHACH_A]'), 'tên khách A phải thành nhãn của A');
  assert.ok(b.anonymizeMap.get('[KHACH_B]') === TEN_B);

  assert.equal(deanonymizeDraft('Anh [KHACH_A] ơi', a.anonymizeMap), `Anh ${TEN_A} ơi`);
  assert.equal(deanonymizeDraft('Chị [KHACH_B] ơi', b.anonymizeMap), `Chị ${TEN_B} ơi`);
});

test('T808: thiếu convId thì hai khách KHÔNG dùng chung bản đồ', () => {
  const c1 = anonymizePrompt({ text: `tôi là ${TEN_A}`, customerName: TEN_A });
  const c2 = anonymizePrompt({ text: `tôi là ${TEN_B}`, customerName: TEN_B });

  assert.equal(c1.anonymizedText.includes(TEN_A), false);
  assert.equal(c2.anonymizedText.includes(TEN_B), false);

  // Đây là lỗi 2 vòng soát 1: bản đồ của khách 2 từng chứa tên khách 1.
  const giaTri2 = [...c2.anonymizeMap.values()];
  assert.equal(giaTri2.includes(TEN_A), false, 'bản đồ khách 2 không được chứa tên khách 1');
  assert.deepEqual(new Set(giaTri2), new Set([TEN_B]), 'bản đồ chỉ chứa đúng khách của lượt này');

  // Và khôi phục không được trả tên khách khác.
  assert.equal(deanonymizeDraft('Dạ em chào [TEN_KHACH]', c2.anonymizeMap), `Dạ em chào ${TEN_B}`);
});

test('T808: tên ngắn không làm vỡ văn bản (ranh giới từ)', () => {
  // Đây là lỗi 5 vòng soát 1: tên "An" từng cắt "Anh chị" thành "Kháchh chị".
  const { anonymizedText } = anonymizePrompt({
    text: 'Anh chị An cứ yên tâm, Ancol thì khác',
    customerName: 'An',
    convId: 'conv-ngan'
  });
  assert.ok(anonymizedText.startsWith('Anh chị '), 'không được cắt vào giữa chữ "Anh"');
  assert.ok(anonymizedText.includes('Ancol'), 'không được cắt vào giữa chữ "Ancol"');
  assert.ok(anonymizedText.includes('[KHACH]'), 'tên đứng riêng thì vẫn phải che');
});

test('T808: khôi phục KHÔNG thay chữ "Khách" thô trong văn bản', () => {
  // Đây là lỗi 6 vòng soát 1: "Khách hàng" từng thành "<tên> hàng".
  const { anonymizeMap } = anonymizePrompt({ text: `tôi là ${TEN_A}`, customerName: TEN_A, convId: 'conv-tho' });
  const ra = deanonymizeDraft('Gửi Khách hàng của mình: [TEN_KHACH] nhé', anonymizeMap);
  assert.ok(ra.includes('Khách hàng của mình'), 'chữ "Khách hàng" phải giữ nguyên nghĩa');
  assert.equal(ra, `Gửi Khách hàng của mình: ${TEN_A} nhé`);
});

test('T808: khách tên có chữ "Khách" vẫn ẩn danh và khôi phục đúng', () => {
  const ten = 'Khách Minh';
  const { anonymizedText, anonymizeMap } = anonymizePrompt({
    text: `${ten} cần báo giá`,
    customerName: ten,
    convId: 'conv-trung'
  });
  assert.equal(anonymizedText.includes(ten), false, 'tên có chữ "Khách" cũng phải bị che');
  assert.equal(deanonymizeDraft('Dạ [TEN_KHACH] ơi', anonymizeMap), `Dạ ${ten} ơi`);
});

// —— OZV-685 / T808 vòng 3: STK không từ khoá · tên NFD/không dấu · mã đơn · nhóm ——

const stk8 = ['1234', '5678'].join('');
const stk9 = ['123', '456', '789'].join('');
const stk10Tran = ['1234', '567890'].join('');
const stkCham = ['1234', '5678', '9012', '3456'].join('.');
const stkGach = ['1234', '5678', '9012', '3456'].join('-');
const maDon14 = ['2026', '1113', '120000'].join(''); // YYYYMMDDHHmmss — không phải STK
const so20 = Array.from({ length: 20 }, (_, i) => String((i + 1) % 10)).join('');

test('OZV-685: STK 8/9/10 số KHÔNG từ khoá vẫn bị che', () => {
  for (const [so, nhan] of [
    [stk8, '8 số'],
    [stk9, '9 số'],
    [stk10Tran, '10 số']
  ]) {
    const raw = `số của tôi là ${so}`;
    assert.ok(raw.includes(so), `nguồn phải chứa ${nhan}`);
    const { anonymizedText } = anonymizePrompt({
      text: raw,
      customerName: TEN_A,
      convId: `stk-tran-${so.length}`
    });
    assert.equal(anonymizedText.includes(so), false, `STK ${nhan} không từ khoá không được lộ`);
    assert.ok(anonymizedText.includes('[STK]'), `STK ${nhan} phải thành [STK]`);
  }
});

test('OZV-685: STK có dấu chấm / gạch (không từ khoá) che trọn', () => {
  for (const so of [stkCham, stkGach]) {
    const raw = `chuyển vào ${so}`;
    assert.ok(raw.includes(so));
    const { anonymizedText } = anonymizePrompt({
      text: raw,
      customerName: TEN_A,
      convId: `stk-sep-${so.length}`
    });
    assert.equal(anonymizedText.includes(so), false, 'STK có dấu tách không được lộ');
    assert.equal(anonymizedText, 'chuyển vào [STK]');
  }
});

test('OZV-685: tên khách NFD vẫn bị che (so khớp qua norm)', () => {
  const tenNfd = 'Nguyễn Văn Ao'.normalize('NFD');
  const raw = `tôi là ${tenNfd}`;
  assert.ok(raw.includes(tenNfd) || raw.normalize('NFKC').includes('Nguyễn'), 'nguồn có tên NFD');
  const { anonymizedText } = anonymizePrompt({
    text: raw,
    customerName: tenNfd,
    convId: 'ten-nfd'
  });
  assert.equal(anonymizedText.includes('Nguyễn'), false, 'tên NFD không được lộ sau NFKC');
  assert.ok(anonymizedText.includes('[KHACH]'));
});

test('OZV-685: tên không dấu khớp tên có dấu (và ngược lại)', () => {
  const coDau = TEN_A; // Nguyễn Văn Ao
  const khongDau = 'Nguyen Van Ao';
  const a = anonymizePrompt({
    text: `xin chào ${khongDau}`,
    customerName: coDau,
    convId: 'ten-ascii-1'
  });
  assert.equal(a.anonymizedText.includes(khongDau), false, 'bản không dấu phải bị che khi customerName có dấu');
  assert.ok(a.anonymizedText.includes('[KHACH]'));

  const b = anonymizePrompt({
    text: `xin chào ${coDau}`,
    customerName: khongDau,
    convId: 'ten-ascii-2'
  });
  assert.equal(b.anonymizedText.includes(coDau), false, 'bản có dấu phải bị che khi customerName không dấu');
});

test('OZV-685: khác hoa/thường vẫn che tên', () => {
  const raw = `gặp ${TEN_A.toUpperCase()} hôm nay`;
  assert.ok(raw.includes(TEN_A.toUpperCase()));
  const { anonymizedText } = anonymizePrompt({
    text: raw,
    customerName: TEN_A,
    convId: 'ten-hoa'
  });
  assert.equal(anonymizedText.includes(TEN_A.toUpperCase()), false);
  assert.ok(anonymizedText.includes('[KHACH]'));
});

test('OZV-685: mã đơn dạng ngày giờ 14 số KHÔNG bị che; dãy 20 số PHẢI bị che', () => {
  const don = anonymizePrompt({
    text: `mã đơn ${maDon14}`,
    customerName: TEN_A,
    convId: 'ma-don'
  });
  assert.ok(don.anonymizedText.includes(maDon14), 'mã đơn YYYYMMDDHHmmss không phải STK');
  assert.equal(don.anonymizedText.includes('[STK]'), false, 'không được che quá tay mã đơn');

  assert.ok(so20.length === 20 && /^\d+$/.test(so20), 'mẫu 20 số phải dựng đủ');
  const dai = anonymizePrompt({
    text: `số ${so20}`,
    customerName: TEN_A,
    convId: 'so-20'
  });
  assert.equal(dai.anonymizedText.includes(so20), false, 'dãy 20 số không được lộ');
  assert.ok(dai.anonymizedText.includes('[STK]'));
});

test('OZV-685: mã HS 8 số vẫn giữ; MST hợp lệ 10 số không bị che thành STK', () => {
  const hs = anonymizePrompt({
    text: 'Mã HS 84137090 cho máy bơm',
    customerName: TEN_A,
    convId: 'hs-8'
  });
  assert.ok(hs.anonymizedText.includes('84137090'), 'mã HS 8 số phải giữ');

  // MST mẫu không bắt đầu bằng 0 (tránh trùng dạng SĐT) — checksum TT105: 10-(sum%11).
  const w = [31, 29, 23, 19, 17, 13, 7, 5, 3];
  const base = '310012345';
  const sum = base.split('').reduce((s, c, i) => s + Number(c) * w[i], 0);
  const rem = sum % 11;
  assert.notEqual(rem, 0, 'sum%11=0 → không có chữ số kiểm 0..9 theo TT105');
  const check = 10 - rem;
  const mst = base + String(check);
  assert.equal(mst, '3100123459');
  const raw = `MST công ty ${mst}`;
  assert.ok(raw.includes(mst));
  const { anonymizedText } = anonymizePrompt({
    text: raw,
    customerName: TEN_A,
    convId: 'mst-10'
  });
  assert.ok(anonymizedText.includes(mst), 'MST hợp lệ 10 số không bị che thành [STK]');
  assert.equal(anonymizedText.includes('[STK]'), false);
});

test('OZV-685: nhóm — che tên thành viên khác qua memberNames', () => {
  const raw = 'nhóm có An và Bình';
  assert.ok(raw.includes('An') && raw.includes('Bình'));
  const { anonymizedText } = anonymizePrompt({
    text: raw,
    customerName: 'Bình',
    convId: 'nhom-tv',
    isGroup: true,
    memberNames: ['An', 'Bình']
  });
  assert.equal(anonymizedText.includes('An'), false, 'tên thành viên khác không được lộ');
  assert.equal(anonymizedText.includes('Bình'), false, 'tên khách gửi cũng phải che');
  assert.ok(anonymizedText.includes('[KHACH_'), 'phải dùng nhãn nhóm');
});

test('OZV-693: MST DN công khai checksum TT105 GIỮ; SĐT đầu số di động vẫn CHE kể cả trùng checksum', () => {
  // MST doanh nghiệp công khai (tỉnh 01 — không khớp đầu số di động 03/05/07/08/09).
  // Chuẩn TT105: hợp lệ khi 10-(sum%11) === chữ số cuối; sum%11===0 → không hợp lệ.
  const mstGiu = ['0100109106', '0101243150'];
  for (const mst of mstGiu) {
    const giu = anonymizePrompt({
      text: `MST công ty ${mst}`,
      customerName: TEN_A,
      convId: `mst-giu-${mst}`
    });
    assert.ok(
      giu.anonymizedText.includes(mst),
      `MST TT105 hợp lệ ${mst} phải giữ nguyên, không thành [SĐT]/[STK]`
    );
    assert.equal(giu.anonymizedText.includes('[SĐT]'), false);
    assert.equal(giu.anonymizedText.includes('[STK]'), false);
  }

  // Checksum sai (tỉnh 01): vẫn che.
  const sai = '0101234567';
  const cheSai = anonymizePrompt({
    text: `MST công ty ${sai}`,
    customerName: TEN_A,
    convId: 'mst-0-sai'
  });
  assert.equal(cheSai.anonymizedText.includes(sai), false, 'MST checksum sai vẫn phải bị che');
  assert.ok(
    cheSai.anonymizedText.includes('[SĐT]') || cheSai.anonymizedText.includes('[STK]'),
    'MST checksum sai → [SĐT] hoặc [STK]'
  );

  // SĐT di động thỏa checksum (rem=0 với công thức cũ / trùng TT105 nếu map 10→0):
  // luôn che — an toàn hơn tiện lợi (không lộ số khách sang AI Studio).
  const sdtTrungChecksum = '0320045000';
  const cheSdt = anonymizePrompt({
    text: `So dien thoai cua toi la ${sdtTrungChecksum} nhe`,
    customerName: TEN_A,
    convId: 'sdt-trung-mst'
  });
  assert.equal(
    cheSdt.anonymizedText.includes(sdtTrungChecksum),
    false,
    'SĐT đầu số di động phải bị che kể cả khi trùng dạng checksum MST'
  );
  assert.ok(cheSdt.anonymizedText.includes('[SĐT]'), 'SĐT → [SĐT]');

  // MST HCM (đầu 03 trùng di động) + đuôi chi nhánh -XXX, checksum TT105 đúng → giữ.
  // (0316871235 sai chữ số kiểm theo TT105 — đúng phải là 0316871236.)
  const mstHcm = '0316871236-001';
  const giuHcm = anonymizePrompt({
    text: `MST don vi ${mstHcm}`,
    customerName: TEN_A,
    convId: 'mst-hcm-chinhanh'
  });
  assert.ok(
    giuHcm.anonymizedText.includes(mstHcm),
    'MST 03…-XXX checksum TT105 đúng phải giữ (không che nửa thành [SĐT]-001)'
  );

  // MST tỉnh 03 dạng 10 số TRẦN + từ khoá MST → giữ (Vinamilk, TGDD công khai).
  // Trước đây isDomestic nuốt hết vì chỉ tha khi có đuôi -XXX.
  const mstHcmTran = ['0300588569', '0303217354', '0302682687'];
  for (const mst of mstHcmTran) {
    const giu = anonymizePrompt({
      text: `MST don vi ${mst}`,
      customerName: TEN_A,
      convId: `mst-hcm-tran-${mst}`
    });
    assert.ok(
      giu.anonymizedText.includes(mst),
      `MST 03… trần ${mst} + từ khoá MST phải giữ, không thành [SĐT]`
    );
    assert.equal(giu.anonymizedText.includes('[SĐT]'), false);
  }

  // Không từ khoá MST: số 03… trần vẫn che (có thể là SĐT khách).
  const tranKhongTuKhoa = anonymizePrompt({
    text: `Lien he toi qua ${mstHcmTran[0]} nhe`,
    customerName: TEN_A,
    convId: 'mst-03-khong-tukhoa'
  });
  assert.equal(
    tranKhongTuKhoa.anonymizedText.includes(mstHcmTran[0]),
    false,
    '03… trần không từ khoá MST vẫn phải che'
  );
  assert.ok(tranKhongTuKhoa.anonymizedText.includes('[SĐT]'));

  // Vòng 4: từ khoá MST sớm trong câu KHÔNG tha SĐT đứng sau (cửa sổ 40 ký tự cũ lộ).
  // Số giả dựng hình dạng — không dùng SĐT khách thật.
  const caLoSdtSauMst = [
    {
      text: 'Ben em MST 0100109106, so dt cua em la 0320000009',
      mst: '0100109106',
      sdt: '0320000009',
      id: 'mst-roi-sdt-1'
    },
    {
      text: 'ma so thue cty em, goi lai so 0330000008 nhe',
      mst: null,
      sdt: '0330000008',
      id: 'mst-roi-sdt-2'
    },
    {
      text: 'MST 0100109106 va so 0340000007',
      mst: '0100109106',
      sdt: '0340000007',
      id: 'mst-roi-sdt-3'
    }
  ];
  for (const ca of caLoSdtSauMst) {
    const out = anonymizePrompt({
      text: ca.text,
      customerName: TEN_A,
      convId: ca.id
    }).anonymizedText;
    if (ca.mst) {
      assert.ok(out.includes(ca.mst), `MST liền từ khoá ${ca.mst} vẫn giữ (${ca.id})`);
    }
    assert.equal(
      out.includes(ca.sdt),
      false,
      `SĐT sau MST trong cùng câu phải che (${ca.id}): ${out}`
    );
    assert.ok(out.includes('[SĐT]'), `SĐT → [SĐT] (${ca.id})`);
  }
});
