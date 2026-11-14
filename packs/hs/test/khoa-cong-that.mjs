// packs/hs/test/khoa-cong-that.mjs — KHOÁ CÂU HỎI THẬT mà Cổng OZ sinh ra cho `so_tay_questions`.
// Chép ngày 14/11/2026 từ repo công khai `github.com/ozvietnam/hs-code-api` (tra bằng MCP sourcebot).
// Dữ liệu công khai; không có thông tin khách, khoá hay địa chỉ nội bộ.
//
// NGUỒN — `api/so-tay-questions.js` dòng 104–144 sinh khoá theo đúng ba bước, mỗi bước một `loai`:
//   1. `loai: 'DONG_BIEU'` — từ `chotDong8(...).missingFacts`: `chat_lieu` (nhánh vật liệu) và các
//      khoá đại lượng có nhãn trong `FACT_LABELS` (`api/so-tay-questions.js:33-47`, 13 khoá).
//      Fact LẠ (không nhãn) vẫn ra câu hỏi với `key` y nguyên fact → xem `KHOA_LA` dưới đây.
//   2. `loai: 'CONG'` — `gate_<GATE>` từ `soTayGates(...).challenges`, 4 cổng trong
//      `lib/so-tay-gates.js`: SO_TAY_LOAI_TRU (:269), SO_TAY_NGUONG (:285), SO_TAY_BO_PHAN (:302),
//      SO_TAY_DONG8 (:332). Khoá thật còn nối `_<target>` khi câu hỏi nhắm một mã cụ thể.
//   3. `loai: 'TT39'` — khoá trường khai báo của `missingStructured()` (`lib/declaration-fields.js`),
//      lấy từ `data/chapter-declaration-fields.json`: grep ra 103 mục nhưng `application` nằm hai
//      chương (dòng 35 "Công dụng", dòng 111 "Công dụng cụ thể") nên khoá RIÊNG là 102.
//
// `loai` CHỈ nhận ba giá trị trên. KHÔNG có `thuoc_tinh` — chữ đó chỉ tồn tại trong fixture bịa của
// PR #228 và chính là gốc lỗi rụng tên hàng (OZV-782). Đừng thêm lại.

/** Bước 1 — `FACT_LABELS` (13 khoá) + `chat_lieu`. */
export const KHOA_DONG_BIEU = [
  'chat_lieu',
  'duong_kinh', 'chieu_rong', 'chieu_dai', 'chieu_cao', 'be_day', 'khoi_luong', 'trong_luong',
  'cong_suat', 'dien_ap', 'dong_dien', 'dung_tich', 'ham_luong', 'ap_suat',
];

/** Bước 2 — bốn cổng của `lib/so-tay-gates.js`, kèm một ca có `_<target>` như Cổng thật nối. */
export const KHOA_CONG = [
  'gate_SO_TAY_LOAI_TRU', 'gate_SO_TAY_NGUONG', 'gate_SO_TAY_BO_PHAN', 'gate_SO_TAY_DONG8',
  'gate_SO_TAY_DONG8_84818087',
];

/** Bước 3 — khoá trường khai báo TT39 (`data/chapter-declaration-fields.json`, 102 khoá riêng). */
export const KHOA_TT39 = [
  'power', 'voltage', 'frequency', 'polymerType', 'form', 'fiberContent', 'constructionType',
  'targetGroup', 'activeIngredient', 'dosageForm', 'hasSim', 'modelNumber', 'fragranceType',
  'volumeMl', 'cosmeticFunction', 'viscosityGrade', 'baseOilType', 'applicationSurface', 'meltIndex',
  'color', 'dimensions', 'thickness', 'rubberType', 'moisturePercent', 'tireSize', 'plyRating',
  'application', 'garmentType', 'size', 'articleType', 'engineDisplacement', 'cylinderCount',
  'fuelType', 'flowRate', 'pumpType', 'headPressure', 'pressureRating', 'coolingCapacity',
  'refrigerant', 'liftCapacity', 'liftHeight', 'operatingWeight', 'bucketCapacity', 'workingWidth',
  'machineFunction', 'spindlePower', 'controlType', 'tableSize', 'cpuModel', 'ramCapacity',
  'storageCapacity', 'printTechnology', 'printSpeed', 'rpm', 'phaseCount', 'voltagePrimary',
  'voltageSecondary', 'capacityAh', 'batteryChemistry', 'networkGeneration', 'screenSize',
  'resolution', 'panelType', 'partNumber', 'function', 'packageType', 'currentRating', 'poleCount',
  'applianceFunction', 'pipeDiameter', 'loadIndex', 'speedRating', 'connectorType', 'connectivity',
  'upperMaterial', 'soleMaterial', 'glassType', 'steelGrade', 'toolType', 'bladeMaterial',
  'measurementType', 'principle', 'lightType', 'conductorMaterial', 'crossSection', 'cableLength',
  'valveType', 'material', 'boreDiameter', 'strokeLength', 'outputVoltage', 'brand', 'lensMaterial',
  'frameMaterial', 'lensPower', 'eyewearType', 'focalLength', 'magnification', 'powerSource',
  'bodyContact', 'riskClass', 'furnitureType',
];

/**
 * Khoá CHƯA TỪNG THẤY — Cổng thêm câu hỏi mới là việc bình thường và không ai báo repo này; bước 1
 * cũng sinh thẳng `key: fact` cho fact không có nhãn. Chuỗi cố định (không random) để ca test lặp
 * lại được khi đỏ.
 */
export const KHOA_LA = ['do_rung_lac_truc_x', 'zz_khoa_chua_tung_thay_2026'];

/** Toàn bộ khoá thật + khoá lạ, dạng câu hỏi Cổng gửi về (`questions[]`). */
export const CAU_HOI_CONG = [
  ...KHOA_DONG_BIEU.map((key) => ({ key, loai: 'DONG_BIEU' })),
  ...KHOA_CONG.map((key) => ({ key, loai: 'CONG' })),
  ...KHOA_TT39.map((key) => ({ key, loai: 'TT39' })),
  ...KHOA_LA.map((key) => ({ key, loai: 'DONG_BIEU' })),
].map((q) => ({
  ...q,
  // Câu hỏi tiếng Việt: nội dung không ảnh hưởng phép đo (ta đo tên hàng tới Cổng), nhưng phải CÓ —
  // `mucCau` bỏ câu rỗng, mà câu rỗng thì test xanh giả.
  questionVi: `Cho em hỏi "${q.key}" của hàng là gì ạ?`,
  type: 'text',
  required: true,
}));
