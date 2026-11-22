#!/usr/bin/env node
// scripts/chay-viec-dem-gpu-nha.mjs — Chạy độc lập 3 lô hàng việc đêm gpu-nha (OZV-1853 · OZV-1822):
//   1) dinh-tuyen  (52 lượt): docBoDe -> createBrain({ duPhong, uuTien: 'llm2' }) -> kiểm gói 1, không bịa mã HS, findLeak
//   2) bien-tap    (52 lượt): docBoDe -> createEditor({ duPhong, uuTien: 'llm2' }) -> soDungChuan + soHieuLa + chamLuat + findLeak
//   3) giong-quyen (16 lượt): gomCau (eval/qa-that/*.json) -> gpu-nha chấm 1..5 theo HO_SO_GIONG -> đối chiếu chamLuat
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLeak as findLeakMacDinh, redact as redactMacDinh } from '../core/redact.js';
import { createBrain, maDaNeu } from '../packs/hs/brain.js';
import { soHieuLa } from '../packs/hs/can-cu.js';
import { createEditor, soDungChuan } from '../packs/hs/editor.js';
import { PACKAGES } from '../packs/hs/packages.js';
import { HO_SO_GIONG, chamLuat, gomCau } from './cham-tu-nhien.mjs';
import { docBoDe } from './do-dung-hs.mjs';

export const CHE_DO_HOP_LE = ['dinh-tuyen', 'bien-tap', 'giong-quyen', 'tat-ca'];
export const MAX_TOKENS_MAC_DINH = 2048;
export const MAX_TOKENS_TOI_THIEU = 2000;
export const SO_LOI_LIEN_TIEP_TOI_DA = 3;
export const SO_CA_BO_DE = 52;
export const SO_CAU_GIONG_QUYEN = 16;

const LOG_IM = { info() {}, warn() {}, error() {} };
const MAU_NO_ACTIVE_CREDENTIALS = /No active credentials for provider/i;
const KHOA_BO_SUNG = /\bBearer\s+\*{3}|\bsk-[\w-]{16,}|\bEAA[A-Za-z0-9]{20,}/gi;
const CA_BO_SUNG_LUAT = [
  { ma: '84137090', cauKhach: 'Máy bơm nước ly tâm một cấp hoạt động bằng động cơ điện xoay chiều 220V công suất 750W dùng bơm nước sinh hoạt gia đình', maLan: ['84138190'], tenDongBieuThue: '- - Loại khác', nguon: { loai: 'BIEU_THUE', soHieu: '26/2023/NĐ-CP', nam: 2023, trich: 'Nhóm 84.13 Bơm chất lỏng; phân nhóm 8413.70 Bơm ly tâm khác; mã 8413.70.90 - - Loại khác.', tepBieuThue: 'hs-code-api data/tax.json#84137090' } },
  { ma: '85094000', cauKhach: 'Máy xay sinh tố gia dụng có lắp động cơ điện 220V công suất 350W dung tích cối nhựa 1.5 lít dùng chế biến thực phẩm trong gia đình', maLan: ['85167990'], tenDongBieuThue: '- Máy nghiền và máy trộn thực phẩm; máy ép hoa quả hoặc rau', nguon: { loai: 'BIEU_THUE', soHieu: '26/2023/NĐ-CP', nam: 2023, trich: 'Nhóm 85.09 Thiết bị cơ điện gia dụng có lắp động cơ điện; mã 8509.40.00 - Máy nghiền và máy trộn thực phẩm.', tepBieuThue: 'hs-code-api data/tax.json#85094000' } },
];

export function layBoDe52(boDe = null) {
  if (Array.isArray(boDe)) return boDe;
  const goc = docBoDe();
  return goc.length >= SO_CA_BO_DE ? goc.slice(0, SO_CA_BO_DE) : [...goc, ...CA_BO_SUNG_LUAT].slice(0, SO_CA_BO_DE);
}
export function layBaseUrlGpuNha(env = process.env) {
  const raw = env?.GPU_NHA_BASE_URL || (env?.ANTHROPIC_BASE_URL ? `${String(env.ANTHROPIC_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/i, '')}/v1` : '');
  return String(raw ?? '').trim().replace(/\/+$/, '');
}
export function layApiKeyGpuNha(env = process.env) {
  return String(env?.GPU_NHA_API_KEY || env?.ANTHROPIC_API_KEY || env?.ANTHROPIC_AUTH_TOKEN || env?.LLM_API_KEY || 'gpu-nha').trim();
}
function thuongHoaSchema(s) {
  if (Array.isArray(s)) return s.map(thuongHoaSchema);
  if (s && typeof s === 'object') return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : thuongHoaSchema(v)]));
  return s;
}
export function lamSachMessages(v, redactFn = redactMacDinh) {
  if (typeof v === 'string') return redactFn(v).replace(KHOA_BO_SUNG, '***');
  if (Array.isArray(v)) return v.map((x) => lamSachMessages(x, redactFn));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, val]) => [lamSachMessages(k, redactFn), lamSachMessages(val, redactFn)]));
  return v;
}

export function taoPayloadGpuNha(messages, tuyChon = {}) {
  const redactFn = tuyChon.redact ?? redactMacDinh;
  const maxTokens = Math.max(MAX_TOKENS_TOI_THIEU, Number(tuyChon.maxTokens) || MAX_TOKENS_MAC_DINH);
  const payload = {
    model: tuyChon.model || 'gpu-nha', stream: false, max_tokens: maxTokens, reasoning_effort: 'low',
    temperature: typeof tuyChon.temperature === 'number' ? tuyChon.temperature : 0.1,
    messages: lamSachMessages(messages, redactFn),
  };
  if (Array.isArray(tuyChon.tools) && tuyChon.tools.length) {
    payload.tools = tuyChon.tools.map((d) => d?.type === 'function' ? d : { type: 'function', function: { name: d.name, description: d.description, parameters: thuongHoaSchema(d.parameters) } });
    payload.tool_choice = tuyChon.toolChoice || 'auto';
  }
  return payload;
}

export function bocJsonGpuNha(raw) {
  const chu = String(raw ?? '').trim();
  if (!chu) throw new Error('Phản hồi HTTP rỗng từ gpu-nha');
  const sachDone = chu.replace(/(?:\r?\n)+\s*data:\s*\[DONE\][\s\S]*$/i, '').replace(/\s*data:\s*\[DONE\]\s*$/i, '').trim();
  try { const j = JSON.parse(sachDone); if (j && typeof j === 'object') return j; } catch { /* thử bóc tiếp */ }
  for (const dong of sachDone.split(/\r?\n/)) {
    const d = dong.trim().replace(/^data:\s*/i, '').trim();
    if (d.startsWith('{')) { try { const j = JSON.parse(d); if (j && typeof j === 'object') return j; } catch { /* dòng kế */ } }
  }
  const dau = sachDone.indexOf('{'), cuoi = sachDone.lastIndexOf('}');
  if (dau >= 0 && cuoi > dau) {
    const j = JSON.parse(sachDone.slice(dau, cuoi + 1));
    if (j && typeof j === 'object') return j;
  }
  throw new Error('Không bóc được JSON hợp lệ từ phản hồi gpu-nha');
}

function trichToolCall(msg, content) {
  const fn = (msg?.tool_calls || []).map((t) => t?.function).find((f) => f?.name);
  let call = null;
  if (fn) {
    let args = fn.arguments;
    if (typeof args === 'string') { try { args = bocJsonGpuNha(args); } catch { args = null; } }
    call = { name: String(fn.name), args: args && typeof args === 'object' ? { ...args } : null };
  } else if (content) {
    try {
      const j = bocJsonGpuNha(content), ten = j?.name || j?.ham || j?.function?.name;
      const thso = j?.arguments ?? j?.args ?? j?.parameters ?? j?.function?.arguments;
      if (ten) {
        const parsed = typeof thso === 'string' ? bocJsonGpuNha(thso) : (thso && typeof thso === 'object' ? thso : {});
        call = { name: String(ten), args: { ...parsed } };
      } else if (typeof j?.tenHang === 'string') call = { name: 'phan_loai', args: { ...j } };
    } catch { /* không phải JSON tool call */ }
  }
  if (call?.args && typeof call.args === 'object' && call.args.doChac == null) call.args.doChac = 0.9;
  return call;
}

export async function goiGpuNha(messages, tuyChon = {}) {
  const baseUrl = String(tuyChon.baseUrl ?? layBaseUrlGpuNha(tuyChon.env)).trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Thiếu GPU_NHA_BASE_URL hoặc ANTHROPIC_BASE_URL');
  const apiKey = tuyChon.apiKey ?? layApiKeyGpuNha(tuyChon.env), fetchImpl = tuyChon.fetchImpl ?? fetch;
  const timeoutMs = Number(tuyChon.timeoutMs) || 60_000, payload = taoPayloadGpuNha(messages, tuyChon);
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', apiKey].join(' ') },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  if (!res.ok) {
    const kenhTamTat = res.status === 404 && MAU_NO_ACTIVE_CREDENTIALS.test(raw);
    const err = new Error(kenhTamTat ? 'gpu-nha lỗi HTTP 404: No active credentials for provider' : `gpu-nha lỗi HTTP ${res.status}`);
    err.status = res.status; err.kenhTamTat = kenhTamTat; err.failFast = kenhTamTat;
    throw err;
  }
  const json = bocJsonGpuNha(raw), msg = json?.choices?.[0]?.message;
  const content = typeof msg?.content === 'string' ? msg.content
    : Array.isArray(msg?.content) ? msg.content.map((p) => p?.text || '').join('') : String(json?.choices?.[0]?.text ?? '');
  return { text: content.trim(), call: trichToolCall(msg, content.trim()), payload, json };
}

function taoCauChiFailFast(tranLoi = SO_LOI_LIEN_TIEP_TOI_DA) {
  const st = { soLoiLienTiep: 0, daDungSom: false, lyDoDungSom: null, loiCuoi: null, vanBanCuoi: '', callCuoi: null };
  return {
    st,
    thanhCong(r) { st.soLoiLienTiep = 0; st.loiCuoi = null; st.vanBanCuoi = r?.text ?? ''; st.callCuoi = r?.call ?? null; },
    thatBai(e) {
      st.soLoiLienTiep += 1; st.loiCuoi = e?.message || String(e);
      if (e?.kenhTamTat || st.soLoiLienTiep >= tranLoi) { st.daDungSom = true; st.lyDoDungSom = st.loiCuoi; }
    },
  };
}

function taoDuPhongGpuNha(tuyChon, cauChi, taoDry) {
  return {
    model: 'gpu-nha',
    async chat({ system, user, tools, temperature, maxTokens } = {}) {
      cauChi.st.loiCuoi = null; cauChi.st.vanBanCuoi = ''; cauChi.st.callCuoi = null;
      if (tuyChon.dryRun) { const r = taoDry(user); cauChi.thanhCong(r); return r; }
      try { const r = await goiGpuNha([{ role: 'system', content: system }, { role: 'user', content: user }], { ...tuyChon, tools, temperature, maxTokens }); cauChi.thanhCong(r); return r; }
      catch (e) { cauChi.thatBai(e); return null; }
    },
  };
}

export function dungVanBanGocBienTap(ca) {
  const maCham = `${ca.ma.slice(0, 4)}.${ca.ma.slice(4, 6)}.${ca.ma.slice(6, 8)}`;
  return [
    `✅ Mã HS đề xuất: ${maCham} (${ca.ma}) — ${ca.tenDongBieuThue}`,
    `📦 Mặt hàng: ${ca.cauKhach}`,
    `💰 Thuế NK ưu đãi (MFN): 0% · VAT: 8%`,
    `📚 Căn cứ pháp lý: ${ca.nguon.soHieu}${ca.nguon.nam ? ` (${ca.nguon.nam})` : ''} — ${ca.nguon.trich}`,
  ].join('\n');
}

export async function chayLoDinhTuyen(tuyChon = {}) {
  const findLeakFn = tuyChon.findLeak ?? findLeakMacDinh, redactFn = tuyChon.redact ?? redactMacDinh;
  const boGoc = layBoDe52(tuyChon.boDe), lim = Number(tuyChon.limit || tuyChon.gioiHan) || 0;
  const dsCa = lim > 0 ? boGoc.slice(0, lim) : boGoc, cauChi = taoCauChiFailFast(tuyChon.soLoiLienTiepToiDa);
  let caHienTai = null, soRong = 0, soLoi = 0, soLeak = 0, soDungGoi1 = 0, soBiaMaHs = 0;
  const duPhong = taoDuPhongGpuNha(tuyChon, cauChi, (user) => ({ text: '', call: { name: 'phan_loai', args: { tenHang: caHienTai?.cauKhach || user, doChac: 0.95 } } }));
  const brain = createBrain({ duPhong, uuTien: 'llm2', log: LOG_IM }), chiTiet = [];
  for (const ca of dsCa) {
    caHienTai = ca;
    const kq = await brain.hieu({ text: ca.cauKhach, pkgs: PACKAGES });
    const loi = cauChi.st.loiCuoi, textRa = String(kq?.text ?? cauChi.st.vanBanCuoi ?? '').trim();
    const callArgs = cauChi.st.callCuoi?.args || {}, maKhach = maDaNeu(ca.cauKhach);
    const maTrongCall = [callArgs.maHs, callArgs.maKhai, callArgs.maHaiQuan, ...maDaNeu(textRa)].filter(Boolean);
    const biaMaHs = maTrongCall.some((m) => !maKhach.some((k) => k.startsWith(String(m).replace(/\D/g, ''))));
    if (biaMaHs) soBiaMaHs += 1;
    const dungGoi1 = kq?.kind === 'chay' && kq.goi === 1 && !biaMaHs;
    if (dungGoi1) soDungGoi1 += 1;
    const rong = !loi && !kq && !textRa;
    if (rong) soRong += 1;
    if (loi || rong) soLoi += 1;
    const leak = findLeakFn(textRa, []);
    if (leak !== null) soLeak += 1;
    chiTiet.push({ ma: ca.ma, kind: kq?.kind || null, goi: kq?.goi || null, dungGoi1, biaMaHs, text: leak ? redactFn(textRa) : textRa, leak, loi });
    if (cauChi.st.daDungSom) break;
  }
  return { cheDo: 'dinh-tuyen', soLuot: chiTiet.length, soRong, soLoi, soLeak, soDungGoi1, soBiaMaHs, daDungSom: cauChi.st.daDungSom, lyDoDungSom: cauChi.st.lyDoDungSom, chiTiet };
}

export async function chayLoBienTap(tuyChon = {}) {
  const findLeakFn = tuyChon.findLeak ?? findLeakMacDinh, redactFn = tuyChon.redact ?? redactMacDinh;
  const boGoc = layBoDe52(tuyChon.boDe), lim = Number(tuyChon.limit || tuyChon.gioiHan) || 0;
  const dsCa = lim > 0 ? boGoc.slice(0, lim) : boGoc, cauChi = taoCauChiFailFast(tuyChon.soLoiLienTiepToiDa);
  let caHienTai = null, soRong = 0, soLoi = 0, soLeak = 0, soDatBienTap = 0, soDatSo = 0, soDatSoHieu = 0;
  const duPhong = taoDuPhongGpuNha(tuyChon, cauChi, () => {
    const maCham = `${caHienTai.ma.slice(0, 4)}.${caHienTai.ma.slice(4, 6)}.${caHienTai.ma.slice(6, 8)}`;
    return { text: `Dạ mặt hàng này mã HS phù hợp là ${maCham} anh/chị nhé.\nThuế NK ưu đãi 0%, VAT 8% theo căn cứ ${caHienTai.nguon.soHieu} ạ.`, call: null };
  });
  const editor = createEditor({ duPhong, uuTien: 'llm2', log: LOG_IM }), chiTiet = [];
  for (const ca of dsCa) {
    caHienTai = ca;
    const goc = dungVanBanGocBienTap(ca), chot = await editor.chot({ text: goc, loai: 'phân loại HS' });
    const loi = cauChi.st.loiCuoi, vanBanKiem = String(chot ?? cauChi.st.vanBanCuoi ?? '').trim();
    const rong = !loi && !vanBanKiem;
    if (rong) soRong += 1;
    if (loi || rong) soLoi += 1;
    const datSo = Boolean(vanBanKiem) && soDungChuan(vanBanKiem, goc);
    if (datSo) soDatSo += 1;
    const dsSoHieuLa = vanBanKiem ? soHieuLa(vanBanKiem, goc) : [], datSoHieu = Boolean(vanBanKiem) && dsSoHieuLa.length === 0;
    if (datSoHieu) soDatSoHieu += 1;
    const luat = chamLuat(vanBanKiem || ''), leak = findLeakFn(vanBanKiem, []);
    if (leak !== null) soLeak += 1;
    const datBienTap = Boolean(chot) && datSo && datSoHieu && leak === null;
    if (datBienTap) soDatBienTap += 1;
    chiTiet.push({ ma: ca.ma, datBienTap, datSo, datSoHieu, soHieuLa: dsSoHieuLa, diemGiong: luat.diem, chot: leak ? redactFn(vanBanKiem) : vanBanKiem, leak, loi });
    if (cauChi.st.daDungSom) break;
  }
  return { cheDo: 'bien-tap', soLuot: chiTiet.length, soRong, soLoi, soLeak, soDatBienTap, soDatSo, soDatSoHieu, daDungSom: cauChi.st.daDungSom, lyDoDungSom: cauChi.st.lyDoDungSom, chiTiet };
}

export async function chayLoGiongQuyen(tuyChon = {}) {
  const findLeakFn = tuyChon.findLeak ?? findLeakMacDinh, redactFn = tuyChon.redact ?? redactMacDinh;
  const boGoc = (tuyChon.boCauGiong ?? (await gomCau())).filter((c) => c.kichBan !== 'loi-cong-llm').slice(0, SO_CAU_GIONG_QUYEN);
  const lim = Number(tuyChon.limit || tuyChon.gioiHan) || 0, dsCau = lim > 0 ? boGoc.slice(0, lim) : boGoc;
  const cauChi = taoCauChiFailFast(tuyChon.soLoiLienTiepToiDa);
  const sys = `${HO_SO_GIONG}\nBạn là người chấm. Chấm độ tự nhiên của MỘT tin bot gửi khách theo thang 1–5 (5 = như nhân viên thật nhắn, đúng hồ sơ giọng). Chỉ trả JSON {"diem": <1-5>, "lyDo": "<một câu>"}.`;
  let soRong = 0, soLoi = 0, soLeak = 0, soDatCham = 0, tongDiemGpu = 0, tongDiemLuat = 0;
  const chiTiet = [];
  for (const c of dsCau) {
    const luat = chamLuat(c.text, c); tongDiemLuat += luat.diem;
    let raw = '', loi = null;
    if (tuyChon.dryRun) { raw = JSON.stringify({ diem: luat.diem, lyDo: luat.lyDo }); cauChi.thanhCong({ text: raw }); }
    else {
      try { const r = await goiGpuNha([{ role: 'system', content: sys }, { role: 'user', content: String(c.text ?? '') }], tuyChon); raw = r.text; cauChi.thanhCong(r); }
      catch (e) { cauChi.thatBai(e); loi = cauChi.st.loiCuoi; }
    }
    let diemGpu = null, lyDoGpu = '';
    if (raw) { try { const j = bocJsonGpuNha(raw), d = Number(j?.diem); if (d >= 1 && d <= 5) { diemGpu = d; lyDoGpu = String(j?.lyDo ?? '').trim(); } } catch { /* JSON lỗi */ } }
    const rong = !loi && diemGpu === null;
    if (rong) soRong += 1;
    if (loi || rong) soLoi += 1;
    if (diemGpu !== null) { soDatCham += 1; tongDiemGpu += diemGpu; }
    const leak = findLeakFn(raw, []) || findLeakFn(lyDoGpu, []);
    if (leak !== null) soLeak += 1;
    chiTiet.push({ kichBan: c.kichBan, buoc: c.buoc, diemGpu, lyDoGpu: leak ? redactFn(lyDoGpu) : lyDoGpu, diemLuat: luat.diem, lyDoLuat: luat.lyDo, doLech: diemGpu !== null ? Number(Math.abs(diemGpu - luat.diem).toFixed(2)) : null, leak, loi });
    if (cauChi.st.daDungSom) break;
  }
  return {
    cheDo: 'giong-quyen', soLuot: chiTiet.length, soRong, soLoi, soLeak, soDatCham,
    diemTrungBinhGpu: soDatCham ? Number((tongDiemGpu / soDatCham).toFixed(2)) : 0,
    diemTrungBinhLuat: chiTiet.length ? Number((tongDiemLuat / chiTiet.length).toFixed(2)) : 0,
    daDungSom: cauChi.st.daDungSom, lyDoDungSom: cauChi.st.lyDoDungSom, chiTiet,
  };
}

export async function chayViecDemGpuNha(tuyChon = {}) {
  const cheDo = tuyChon.cheDo || 'tat-ca';
  if (!CHE_DO_HOP_LE.includes(cheDo)) throw new Error(`Chế độ không hợp lệ: ${cheDo}`);
  const cacLo = [], chayMotLo = async (fn) => { if (!cacLo.some((l) => l.daDungSom)) cacLo.push(await fn(tuyChon)); };
  if (cheDo === 'dinh-tuyen' || cheDo === 'tat-ca') await chayMotLo(chayLoDinhTuyen);
  if (cheDo === 'bien-tap' || cheDo === 'tat-ca') await chayMotLo(chayLoBienTap);
  if (cheDo === 'giong-quyen' || cheDo === 'tat-ca') await chayMotLo(chayLoGiongQuyen);
  const soLuot = cacLo.reduce((s, x) => s + x.soLuot, 0), soRong = cacLo.reduce((s, x) => s + x.soRong, 0);
  const soLoi = cacLo.reduce((s, x) => s + x.soLoi, 0), soLeak = cacLo.reduce((s, x) => s + x.soLeak, 0);
  const loDungSom = cacLo.find((x) => x.daDungSom), dongTongKet = `GPU_NHA_DEM: ${soLuot} luot · rong=${soRong} · loi=${soLoi} · leak=${soLeak}`;
  const code = soLoi === 0 && soLeak === 0 && !loDungSom ? 0 : 1;
  const ketQua = { cheDo, soLuot, soRong, soLoi, soLeak, code, dongTongKet, daDungSom: Boolean(loDungSom), lyDoDungSom: loDungSom?.lyDoDungSom || null, ...(cacLo.length === 1 ? cacLo[0] : { lo: cacLo }) };
  if (tuyChon.out) { const duongOut = resolve(tuyChon.out); mkdirSync(dirname(duongOut), { recursive: true }); writeFileSync(duongOut, JSON.stringify(ketQua, null, 2) + '\n', 'utf8'); }
  (tuyChon.log ?? console.log)(dongTongKet);
  return ketQua;
}

export function docThamSoCli(argv = []) {
  const ts = { cheDo: 'tat-ca', limit: 0, out: '', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--che-do' && argv[i + 1]) ts.cheDo = argv[++i];
    else if (a.startsWith('--che-do=')) ts.cheDo = a.slice('--che-do='.length);
    else if ((a === '--limit' || a === '--gioi-han') && argv[i + 1]) ts.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (a.startsWith('--limit=') || a.startsWith('--gioi-han=')) ts.limit = Math.max(0, Number(a.split('=')[1]) || 0);
    else if (a === '--out' && argv[i + 1]) ts.out = argv[++i];
    else if (a.startsWith('--out=')) ts.out = a.slice('--out='.length);
    else if (a === '--dry-run') ts.dryRun = true;
    else throw new Error(`Tham số không hợp lệ: ${a}`);
  }
  return ts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const kq = await chayViecDemGpuNha(docThamSoCli(process.argv.slice(2))); process.exit(kq.code); }
  catch (e) { console.error(`Lỗi: ${e.message}`); process.exit(1); }
}
