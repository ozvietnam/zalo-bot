// scripts/qa-that-cong-gia.mjs — Cổng OZ giả + Vision giả cho chế độ `--mock` của bộ QA chạy thật.
//
// Tách khỏi `scripts/qa-that.mjs` (issue #168 mục D): bộ chạy QA đã 653 dòng, vượt mức 300 dòng của
// Hiến pháp VI; ca KB1–KB8 cần bộ giả trả đủ dữ liệu CĂN CỨ nên phần giả lập còn dài thêm nữa.
// Tách ra là cách duy nhất để cả hai tệp đi về phía dưới 300 dòng.
//
// Hình dạng dữ liệu ở đây ĐO THẬT từ Cổng OZ ngày 10/11/2026 (xem `.van-phong/ke-hoach.md` mục "Nền đã đo"),
// trùng với bộ fixture `eval/fixtures/kb01-…` → `kb10-…`. Giữ nguyên lỗi lệch của Cổng ở mã 85094000
// (`canCu.mfn` ghi số hiệu biểu thuế năm hiện hành, `canCuChiTiet.mfn` ghi số hiệu nghị định gốc) để
// ca QA đo được luật "ưu tiên `canCuChiTiet`" (mục E), không phải để bot đoán.
//
// Không khoá, không token, không dữ liệu khách thật.

/** Căn cứ thuế chung mọi mã: nghị định biểu thuế + ACFTA + VAT (số hiệu Cổng thật trả). */
const CAN_CU_CHI_TIET = {
  mfn: { vanBan: '26/2023/NĐ-CP', hieuLuc: '15/07/2023' },
  acfta: { vanBan: '118/2022/NĐ-CP', hieuLuc: '30/12/2022' },
  vat: { vanBan: '181/2025/NĐ-CP', hieuLuc: '01/07/2025' },
};

/** Lỗi lệch mục E: Cổng ghi số hiệu biểu thuế 2026 ở `canCu`, số hiệu nghị định gốc ở `canCuChiTiet`. */
const CAN_CU_LECH = { mfn: { vanBan: 'NĐ 26/2025/NĐ-CP (biểu thuế 2026)' } };

/** Văn bản quản lý chuyên ngành của hàng điện gia dụng, kèm tình trạng hiệu lực Cổng trả. */
const HIEU_LUC = {
  conHieuLuc: {
    soHieu: '36/2026/TT-BKHCN',
    ten: 'Danh mục sản phẩm, hàng hoá phải chứng nhận hợp quy',
    tinhTrang: 'CON_HIEU_LUC',
    hieuLucDaDoiChieu: true,
    xacMinh: 'NGUON_A',
  },
  daBaiBo: {
    soHieu: '08/2023/TT-BCT',
    ten: 'Quy định dán nhãn năng lượng',
    tinhTrang: 'HET_HIEU_LUC_MOT_PHAN',
    hetHieuLucTu: '2026-06-01',
    biBaiBoBoi: ['48/2026/TT-BCT'],
    hieuLucDaDoiChieu: true,
    xacMinh: 'NGUON_A',
  },
};

/** Nhận dạng nhóm hàng từ chữ khách gõ hoặc mã HS, để bộ giả trả đúng một mã ổn định. */
function nhomHang(text = '') {
  const t = String(text);
  if (t.includes('8516') || /b[ìi]nh ([đd])un|n[óo]ng l[ạa]nh/i.test(t)) return '85161090';
  if (t.includes('8413') || t.includes('bơm')) return '84137090';
  if (t.includes('8504') || t.includes('biến đổi')) return '85044090';
  if (t.includes('8509') || t.includes('xay') || t.includes('sinh tố')) return '85094000';
  return '85371099';
}

const TEN_VI = {
  85161090: 'Bình đun nước nóng kiểu tức thời',
  84137090: 'Máy bơm ly tâm',
  85044090: 'Bộ biến đổi tĩnh điện',
  85094000: 'Máy xay, ép trái cây gia dụng',
  85371099: 'Bàn điều khiển cầm tay',
};

/** Cổng OZ giả phục vụ chế độ --mock khi không có kết nối mạng thật. */
export function createMockMcp() {
  const tools = [
    { name: 'phan_loai_hs', description: 'Phân loại HS' },
    { name: 'ket_qua_phan_loai', description: 'Kết quả phân loại' },
    { name: 'tra_thue', description: 'Tra cứu thuế' },
    { name: 'tra_thu_tuc_nhap_khau', description: 'Thủ tục nhập khẩu' },
    { name: 'tim_ma_hs', description: 'Tìm mã HS' },
    { name: 'kiem_tra_shtt', description: 'Kiểm tra SHTT' },
    // Bổ sung cho ca KB3–KB8 của #168: trước đây các công cụ này rơi vào nhánh mặc định
    // `{ ok: true, data: 'mock-ok' }`, nên gói 3/4/5/7 không đo được gì.
    { name: 'sinh_mo_ta_khai_bao', description: 'Sinh mô tả khai báo' },
    { name: 'soat_to_khai', description: 'Soát tờ khai' },
    { name: 'tra_hieu_luc_van_ban', description: 'Tra hiệu lực văn bản' },
    { name: 'tra_tien_le', description: 'Tra tiền lệ phân loại' },
    { name: 'soan_ho_so_giai_trinh', description: 'Soạn hồ sơ giải trình' },
  ];

  return {
    calls: [],
    async listTools() {
      return tools;
    },
    async callTool(name, args = {}) {
      this.calls.push({ name, args, at: new Date() });
      if (name === 'phan_loai_hs') {
        const maHs = nhomHang(String(args.tenHang || args.moTa || ''));
        const nameVi = TEN_VI[maHs];
        return {
          ok: true,
          maLuot: 'ML-TEST-' + maHs,
          trangThai: 'XONG',
          maHs,
          doChac: 0.95,
          data: {
            maHs,
            ketQua: { results: [{ hsCode: maHs, nameVi, confidence: 0.95, reasoning: nameVi }] },
          },
        };
      }
      if (name === 'ket_qua_phan_loai') {
        const maHs = nhomHang(String(args.maLuot || ''));
        const nameVi = TEN_VI[maHs];
        return {
          ok: true,
          maHs,
          trangThai: 'XONG',
          data: { maHs, ketQua: { results: [{ hsCode: maHs, nameVi, confidence: 0.95 }] } },
          deXuat: [{ ma: maHs, moTa: nameVi }],
        };
      }
      if (name === 'tra_thue') {
        const ma = String(args.maHs || '84137090');
        const is8509 = ma.startsWith('8509');
        const is8516 = ma.startsWith('8516');
        return {
          ok: true,
          data: {
            hsCode: ma,
            nameVi: is8509 ? 'máy xay, ép trái cây gia dụng'
              : (is8516 ? 'Bình đun nước nóng kiểu tức thời'
                : (ma.startsWith('8413') ? 'Máy bơm ly tâm khác'
                  : (ma.startsWith('8504') ? 'Bộ biến đổi tĩnh điện khác' : 'Thiết bị điều khiển cầm tay'))),
            taxNkPreferential: is8509 ? 25 : (is8516 ? 20 : 0),
            taxVat: is8509 || is8516 ? 8 : 10,
            vatReduction: is8509 ? { noteVi: 'áp tới hết 2026' } : null,
            // Hàng 8516 của ca KB3 không nêu ACFTA: căn cứ FTA chỉ được nêu khi Cổng nói hàng được hưởng.
            taxAcftaChina: is8516 ? null : { eligible: true, rate: is8509 ? 5 : 0 },
            // Căn cứ pháp lý (#168 mục B): giữ cả `canCu` lệch và `canCuChiTiet` đúng để đo luật mục E.
            canCu: CAN_CU_LECH,
            canCuChiTiet: is8516
              ? { mfn: CAN_CU_CHI_TIET.mfn, vat: CAN_CU_CHI_TIET.vat }
              : CAN_CU_CHI_TIET,
            hsListings: is8516
              ? [{ soHieu: '36/2026/TT-BKHCN', ten: HIEU_LUC.conHieuLuc.ten, loaiTacDong: 'CONG_BO_HOP_QUY', tinhTrang: 'CON_HIEU_LUC', effectiveFrom: '2026-03-01' }]
              : [],
          },
        };
      }
      if (name === 'tra_thu_tuc_nhap_khau') {
        const ma = String(args.maHs || '');
        const is8509 = ma.startsWith('8509');
        const is8516 = ma.startsWith('8516');
        if (is8516) {
          // Ca KB3: một chính sách dẫn từ văn bản ĐÃ BỊ BÃI BỎ → luật UX-02 buộc gắn nhãn cho khách.
          return {
            ok: true,
            data: {
              hsCode: ma,
              kiemTraChuyenNganh: [{ label: 'chứng nhận hợp quy' }],
              giayPhep: [],
              chinhSach: {
                policyLines: [
                  { text: 'Chứng nhận hợp quy và dán nhãn CR trước khi thông quan', soHieu: '36/2026/TT-BKHCN' },
                  { text: 'Dán nhãn năng lượng', soHieu: '08/2023/TT-BCT' },
                ],
              },
              vanBanQuanLy: [
                { soHieu: '36/2026/TT-BKHCN', hieuLuc: HIEU_LUC.conHieuLuc },
                { soHieu: '08/2023/TT-BCT', hieuLuc: HIEU_LUC.daBaiBo },
              ],
            },
          };
        }
        return {
          ok: true,
          data: {
            kiemTraChuyenNganh: is8509 ? [{ label: 'công bố hợp quy' }] : [],
            giayPhep: [],
            vanBanQuanLy: [],
            chinhSach: is8509
              ? { policyLines: [{ text: 'Đồ điện gia dụng phải công bố hợp quy trước khi bán' }] }
              : { policyLines: [] },
          },
        };
      }
      if (name === 'tim_ma_hs') {
        const q = String(args.tuKhoa || '');
        const maHs = nhomHang(q);
        return {
          ok: true,
          results: [{
            hsCode: maHs,
            nameVi: maHs === '84137090' ? 'Máy bơm ly tâm khác' : (maHs === '85044090' ? 'Bộ biến đổi tĩnh điện khác' : TEN_VI[maHs]),
            taxNkPreferential: 0,
            taxVat: 10,
          }],
        };
      }
      if (name === 'kiem_tra_shtt') {
        // Trước ca KB7 công cụ này không có nhánh nên gói 6 in đúng chữ "mock-ok" — không đo được gì.
        // Hình dạng lấy theo `eval/fixtures/kb07-nhan-hieu-shtt.jsonl`.
        const nhan = String(args.thuongHieu || args.tenNhan || 'Philips');
        return {
          ok: true,
          data: {
            tenNhan: nhan,
            maHs: String(args.maHs || '85094000'),
            den: 'VANG',
            nhanRuiRo: 'Nhãn hiệu đã đăng ký tại Việt Nam, chưa thấy yêu cầu kiểm soát biên giới',
            ketLuan: 'Cần giấy uỷ quyền hoặc hợp đồng phân phối để tránh bị tạm giữ',
          },
        };
      }
      if (name === 'sinh_mo_ta_khai_bao') {
        // Mô tả khai báo phải do Cổng soạn (Hiến pháp V): bộ giả trả nguyên văn, bot chỉ dẫn lại.
        const ma = String(args.maHs || '85094000');
        const nhan = args.thuongHieu ? `, nhãn hiệu ${args.thuongHieu}` : '';
        return {
          ok: true,
          data: {
            maHs: ma,
            customsDescription: `${args.tenHang || TEN_VI[nhomHang(ma)]}${nhan}, vỏ nhựa, động cơ điện 350W, điện áp 220V, mới 100%`,
            diemTuanThu: { score: 92, level: 'TOT' },
          },
        };
      }
      if (name === 'soat_to_khai') {
        // Cảnh báo lồng trong từng dòng hàng: ca KB6 chốt bot không được ăn mất chúng.
        const dong = (args.dongHang || [{}])[0] || {};
        return {
          ok: true,
          data: {
            dongHang: [{
              stt: 1,
              maHs: String(dong.maHs || '85094000'),
              ketLuan: 'Mô tả đủ chỉ tiêu 1.78',
              canhBao: [{ level: 'NOTICE', messageVi: 'Chưa nêu nhãn hiệu trong mô tả — Hải quan có thể yêu cầu bổ sung' }],
            }],
            diemTuanThu: { score: 78, level: 'TRUNG_BINH' },
          },
        };
      }
      if (name === 'tra_hieu_luc_van_ban') {
        const so = [].concat(args.soHieu || []).map(String);
        const items = [HIEU_LUC.daBaiBo, HIEU_LUC.conHieuLuc]
          .filter((h) => !so.length || so.some((s) => s.includes(h.soHieu.split('/')[0])));
        return {
          ok: true,
          data: { registry: { registryVersion: '2026-11-09', total: 2436 }, items: items.length ? items : [HIEU_LUC.conHieuLuc] },
        };
      }
      if (name === 'tra_tien_le') {
        return {
          ok: true,
          data: {
            items: [{
              tbTchqNumber: '5676/TCHQ-TXNK',
              girRule: 'Quy tắc 1',
              issuedDate: '2024-10-28',
              maHs: '85094000',
              tomTat: 'Máy xay thực phẩm gia dụng có động cơ gắn liền thuộc nhóm 8509',
            }],
          },
        };
      }
      if (name === 'soan_ho_so_giai_trinh') {
        return {
          ok: true,
          data: {
            maKhai: String(args.maKhai || '85094000'),
            maHaiQuan: String(args.maHaiQuan || '85098000'),
            danY: [
              'Quy tắc 1: nhóm 8509 ghi rõ máy xay thực phẩm',
              'Quy tắc 3a: mã 8509.40 cụ thể hơn 8509.80',
            ],
            congVan: 'Kính gửi Chi cục Hải quan… (bản nháp)',
            hoSoKemTheo: ['Catalogue nhà sản xuất', 'Hợp đồng mua bán', 'Ảnh hàng thực tế'],
            diemYeu: ['Chưa có kết quả phân tích phân loại của Hải quan'],
          },
        };
      }
      return { ok: true, data: 'mock-ok' };
    },
  };
}

/** Mock Vision phục vụ chế độ --mock. */
export function createMockVision() {
  return {
    async readSpecs() {
      return {
        tenHang: 'Bộ điều khiển lập trình và cảm biến áp suất',
        thuongHieu: 'Omron',
        model: 'E2B-M12KS04',
        chatLieu: 'Vỏ kim loại, linh kiện điện tử',
        congDung: 'Điều khiển và phát hiện vị trí trong dây chuyền',
        thongSo: { 'Điện áp': '12-24V DC', 'Khoảng cách': '4mm' },
        chuTrongAnh: 'OMRON PROXIMITY SENSOR E2B-M12KS04 12-24VDC MADE IN JAPAN',
        khongChac: [],
      };
    },
  };
}
