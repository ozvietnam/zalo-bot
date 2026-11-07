// Test tín hiệu giám sát — spec 007
// Mỗi tín hiệu: nạp dữ liệu giả lập có đúng kiểu lỗi → script phải ra đúng phát hiện.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinhHieu, NGUONG } from '../../scripts/giam-sat/tinh-hieu.js';

// ═══ helpers: dựng rows messages/outbox/jobs/audit trong 1 ngày ═══
const DAY = '2026-11-06';
const at = (h, m) => `${DAY}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`;

function mkMsg(o) { return { speaker:'user', speaker_id:'u1', text:'', outbox_id:null, ...o }; }
function mkOut(o) { return { kind:'text', decision:'send', reason:null, status:'sent', created_at: at(10,0), sent_at: at(10,0), ...o }; }
function mkJob(o) { return { status:'pending', attempts:0, created_at: at(9,0), expires_at: at(9,30), done_at: null, ...o }; }
function mkAudit(o) { return { at: at(10,0), turn_id:'t1', chat_id:'c1', ...o }; }

// ═══ GATE-LEAK: cửa từ chối vì lộ ═══
test('GATE-LEAK: 1 lần từ chối lộ → 1 phát hiện', () => {
  const outbox = [mkOut({ chat_id:'c1', turn_id:'t1', text:'x', decision:'block', reason:'leak:path' })];
  const r = tinhHieu({ messages:[], outbox, jobs:[], audit:[], ngay: DAY });
  const f = r.filter(x => x.ma === 'GATE-LEAK');
  assert.equal(f.length, 1);
  assert.equal(f[0].repo, 'zalo-bot');
  assert.ok(f[0].bangChung.length >= 1);
});

test('GATE-LEAK: 0 lần → không phát hiện', () => {
  const outbox = [mkOut({ chat_id:'c1', text:'ok' })];
  const r = tinhHieu({ messages:[], outbox, jobs:[], audit:[], ngay: DAY });
  assert.equal(r.filter(x => x.ma === 'GATE-LEAK').length, 0);
});

// ═══ TOOL-ERR: ≥3 lần / ngày ═══
test('TOOL-ERR: 3 lần lỗi → phát hiện; 2 lần → không', () => {
  const audit3 = [
    mkAudit({ type:'tool_error', data: JSON.stringify({ tool:'tra_thue', error:'timeout' }) }),
    mkAudit({ type:'tool_error', data: JSON.stringify({ tool:'tra_thue', error:'timeout' }) }),
    mkAudit({ type:'tool_error', data: JSON.stringify({ tool:'tra_thue', error:'500' }) }),
  ];
  const r3 = tinhHieu({ messages:[], outbox:[], jobs:[], audit: audit3, ngay: DAY });
  assert.equal(r3.filter(x => x.ma === 'TOOL-ERR' && x.cheDo === 'tra_thue').length, 1);

  const r2 = tinhHieu({ messages:[], outbox:[], jobs:[], audit: audit3.slice(0,2), ngay: DAY });
  assert.equal(r2.filter(x => x.ma === 'TOOL-ERR').length, 0);
});

// ═══ TOOL-EMPTY: ≥3 lần / ngày / công cụ ═══
test('TOOL-EMPTY: công cụ trả rỗng 3 lần → phát hiện', () => {
  const audit = [1,2,3].map(() => mkAudit({ type:'tool_empty', data: JSON.stringify({ tool:'tra_chu_giai' }) }));
  const r = tinhHieu({ messages:[], outbox:[], jobs:[], audit, ngay: DAY });
  assert.equal(r.filter(x => x.ma === 'TOOL-EMPTY' && x.cheDo === 'tra_chu_giai').length, 1);
});

// ═══ JOB-EXPIRED: việc nền quá 30 phút không kết quả ═══
test('JOB-EXPIRED: job hết hạn chưa xong → phát hiện', () => {
  const jobs = [mkJob({ chat_id:'c1', pack:'hs', ma_luot:'ABC', status:'pending', expires_at: at(9,30) })];
  const r = tinhHieu({ messages:[], outbox:[], jobs, audit:[], ngay: DAY, hienTai: at(10,30) });
  assert.equal(r.filter(x => x.ma === 'JOB-EXPIRED').length, 1);
});

// ═══ HOI-LAI: khách hỏi lại gần giống (Jaccard ≥ 0.8) trong 30 phút ═══
test('HOI-LAI: khách hỏi lại giống → đếm; ≥3 phòng → phát hiện', () => {
  const messages = [];
  for (let i = 1; i <= 3; i++) {
    const c = `c${i}`;
    messages.push(mkMsg({ chat_id:c, text:'cho tôi hỏi thuế nhập khẩu máy lạnh', at: at(10,0) }));
    messages.push(mkMsg({ chat_id:c, speaker:'bot', text:'Đáp...', at: at(10,1) }));
    messages.push(mkMsg({ chat_id:c, text:'cho tôi hỏi thuế nhập khẩu máy lạnh nhé', at: at(10,15) }));
  }
  const r = tinhHieu({ messages, outbox:[], jobs:[], audit:[], ngay: DAY });
  assert.equal(r.filter(x => x.ma === 'HOI-LAI').length, 1);
});

// ═══ KHACH-BUC: khách bực ≥2 phòng ═══
test('KHACH-BUC: "chả hiểu" ở 2 phòng → phát hiện', () => {
  const messages = [
    mkMsg({ chat_id:'c1', text:'chả hiểu gì cả', at: at(10,0) }),
    mkMsg({ chat_id:'c2', text:'bot à, lần thứ 3 rồi', at: at(11,0) }),
  ];
  const r = tinhHieu({ messages, outbox:[], jobs:[], audit:[], ngay: DAY });
  assert.equal(r.filter(x => x.ma === 'KHACH-BUC').length, 1);
});

// ═══ NGUOI-THAY: nhân viên vào phòng sau bot trả lời ═══
test('NGUOI-THAY: staff vào trong 15 phút sau bot ≥3 phòng → phát hiện', () => {
  const messages = [];
  for (let i = 1; i <= 3; i++) {
    const c = `c${i}`;
    messages.push(mkMsg({ chat_id:c, speaker:'bot', text:'Đáp...', at: at(10,0) }));
    messages.push(mkMsg({ chat_id:c, speaker:'staff', speaker_id:'s1', text:'chào bạn', at: at(10,10) }));
  }
  const r = tinhHieu({ messages, outbox:[], jobs:[], audit:[], ngay: DAY });
  assert.equal(r.filter(x => x.ma === 'NGUOI-THAY').length, 1);
});

// ═══ Tổng hợp: 0 tín hiệu → 0 phát hiện ═══
test('ngày sạch → 0 phát hiện', () => {
  const r = tinhHieu({ messages:[mkMsg({ chat_id:'c1', text:'hello', at: at(10,0) })],
    outbox:[mkOut({ chat_id:'c1', text:'Chào bạn' })], jobs:[mkJob({ status:'done', done_at: at(9,10) })], audit:[], ngay: DAY });
  assert.equal(r.length, 0);
});
