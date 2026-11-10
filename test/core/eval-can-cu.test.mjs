// eval/kiem-can-cu.mjs (nối vào `eval/run.mjs`) — kiểm MÁY chống bịa căn cứ (issue #136 mục C, mở lại ở #168):
// mọi số hiệu văn bản trong tin bot gửi khách phải có trong dữ liệu Cổng của lượt đó
// (hoặc trong chữ khách tự gõ, hoặc trong mẫu nhập liệu tĩnh của gói). Số lạ = kịch bản TRƯỢT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (dir) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'eval/run.mjs', '--dir', dir], { encoding: 'utf8' });
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

/** Cổng trả thuế kèm căn cứ thật → bot dẫn số hiệu nào cũng phải nằm trong đây. */
const THUE_CO_CAN_CU = {
  ok: true,
  data: {
    hsCode: '85094000', nameVi: 'Máy xay sinh tố', taxNkPreferential: '25', taxVat: '8',
    canCuChiTiet: { mfn: { vanBan: '26/2023/NĐ-CP', hieuLuc: '15/07/2023' } },
  },
};
/** Cổng trả thuế KHÔNG có căn cứ → bot không được nêu số hiệu nào. */
const THUE_KHONG_CAN_CU = {
  ok: true,
  data: { hsCode: '85094000', nameVi: 'Máy xay sinh tố', taxNkPreferential: '25', taxVat: '8' },
};

test('eval: kiểm chống bịa chạy TỰ ĐỘNG mọi kịch bản, in số văn bản đã soát', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-cc-'));
  try {
    writeFileSync(join(dir, 'cc-dung.jsonl'), jsonl([
      { step: 'mcp', tool: 'tra_thue', returns: [THUE_CO_CAN_CU] },
      { step: 'in', update: { id: 'c1m1', text: '85094000' } },
      { step: 'expect', sentTo: 'c1', count: 1, match: '26/2023' },
    ]));
    const r = run(dir);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /✓ cc-dung/);
    // Có soát thật: ít nhất 1 số văn bản trong tin bot đã được đối chiếu với dữ liệu Cổng.
    assert.match(r.stdout, /căn cứ: 1/, `stdout phải báo số căn cứ đã soát:\n${r.stdout}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('eval: Cổng không trả căn cứ → bot không nêu số hiệu nào, kịch bản vẫn đạt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-cc-'));
  try {
    writeFileSync(join(dir, 'cc-trong.jsonl'), jsonl([
      { step: 'mcp', tool: 'tra_thue', returns: [THUE_KHONG_CAN_CU] },
      { step: 'in', update: { id: 'c1m1', text: '85094000' } },
      { step: 'expect', sentTo: 'c1', count: 1, notMatch: 'Căn cứ:' },
    ]));
    const r = run(dir);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /✓ cc-trong/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('eval: kiemBiaSoVanBan — tin bot có số lạ thì trượt kèm lý do; số của Cổng/khách/mẫu gói thì đạt', async () => {
  const { kiemBiaSoVanBan } = await import('../../eval/run.mjs');
  // Số Cổng đã trả → hợp lệ, kể cả khi bot viết ngắn "NĐ 26/2023"
  const dung = kiemBiaSoVanBan(['Căn cứ: NĐ 26/2023 (thuế NK)'], [THUE_CO_CAN_CU], []);
  assert.equal(dung.ok, true, dung.why);
  assert.equal(dung.quet, 1);
  // Số lạ → bịa, nêu rõ số nào
  const xau = kiemBiaSoVanBan(['Căn cứ: NĐ 99/2099/NĐ-CP'], [THUE_CO_CAN_CU], []);
  assert.equal(xau.ok, false);
  assert.match(xau.why, /99\/2099\/NĐ-CP/);
  // Khách tự gõ số → bot nhắc lại không phải bịa
  assert.equal(kiemBiaSoVanBan(['Văn bản 57/2022/NĐ-CP còn hiệu lực ạ'], [], ['kiểm 57/2022/NĐ-CP giúp em']).ok, true);
  // Mẫu nhập liệu tĩnh của gói (menu, dòng "Gửi thông tin theo mẫu") → không tính là căn cứ bịa
  assert.equal(kiemBiaSoVanBan(['Số hiệu văn bản: 57/2022/NĐ-CP, 38/2015/TT-BTC → kiểm hiệu lực'], [], []).ok, true);

  // [S2] của lượt soát #168: miễn trừ phải bám DÒNG MẪU, không miễn số đó ở mọi vị trí. Cùng con số
  // `38/2015/TT-BTC`, khi bot đem ra làm CĂN CỨ trong câu trả lời mà Cổng không trả, thì vẫn là bịa.
  const biaDungSoMau = kiemBiaSoVanBan(['Căn cứ: TT 38/2015 (thủ tục hải quan)'], [THUE_CO_CAN_CU], []);
  assert.equal(biaDungSoMau.ok, false, 'số trong mẫu nhưng dùng làm căn cứ thì vẫn phải bị bắt');
  assert.match(biaDungSoMau.why, /38\/2015/);
  assert.ok(biaDungSoMau.quet >= 1, `phải đếm là đã soát, thực tế quet=${biaDungSoMau.quet}`);

  // Và tin bot in NGUYÊN dòng mẫu của gói thì vẫn phải đạt (không chặn oan) — ca ngay trên đã chốt;
  // thêm ca dòng menu gói 3 có "TT 38/2015, sửa đổi TT 39/2018, TT 121/2025".
  const dongMenu = 'Soạn mô tả hàng hoá chỉ tiêu 1.78 (TT 38/2015, sửa đổi TT 39/2018, TT 121/2025) kèm điểm tuân thủ.';
  assert.equal(kiemBiaSoVanBan([dongMenu], [], []).ok, true, 'in nguyên dòng menu không được coi là bịa');
});

test('eval: kịch bản thật cũ không có số văn bản bịa (chạy lại toàn bộ eval/fixtures)', async () => {
  const { runEvalFixture } = await import('../../eval/run.mjs');
  // Kịch bản gói 5 in mẫu nhập liệu có số hiệu tĩnh — phải KHÔNG bị báo bịa.
  const dir = mkdtempSync(join(tmpdir(), 'eval-cc-'));
  try {
    const f = join(dir, 'goi5.jsonl');
    writeFileSync(f, jsonl([
      // Gói 5 chỉ hiện khi Cổng có một trong các công cụ pháp luật.
      { step: 'mcp', tool: 'tra_hieu_luc_van_ban', returns: [{ ok: true, data: { items: [] } }] },
      { step: 'in', update: { id: 'g5', text: 'chọn gói 5' } },
      { step: 'expect', sentTo: 'c1', count: 1, match: '57/2022' },
    ]));
    const r = await runEvalFixture(f);
    assert.equal(r.ok, true, r.why);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
