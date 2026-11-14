// core/giong-noi.js — chuyển văn bản thành tin thoại bé Quyên, cache theo băm (issue #125).
// Chuẩn hoá câu đọc: bỏ markdown, đọc đúng mã HS/số tiền/%, khống chế thời lượng ≤ 60s.
// TTS qua Gemini TTS (gemini-2.5-flash-preview-tts) -> ffmpeg đổi sang AAC 64 kbps -> lưu DATA_DIR/am-thanh/<băm>.aac.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { normVi } from './text.js';

const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/** Đọc chuỗi số thành từng chữ số tiếng Việt */
function docDaySo(digits) {
  return String(digits).split('').map((d) => CHU_SO[Number(d)] ?? d).join(' ');
}

/** Đọc mã HS 8 số: nhóm 4-2-2 (ví dụ 84137090 -> tám bốn một ba, bảy không, chín không) */
function docMaHs(hs) {
  const clean = hs.replace(/\./g, '');
  if (clean.length === 8) {
    const c1 = docDaySo(clean.slice(0, 4));
    const c2 = docDaySo(clean.slice(4, 6));
    const c3 = docDaySo(clean.slice(6, 8));
    return `${c1}, ${c2}, ${c3}`;
  }
  if (clean.length === 6) return `${docDaySo(clean.slice(0, 4))}, ${docDaySo(clean.slice(4, 6))}`;
  if (clean.length === 4) return docDaySo(clean);
  return docDaySo(clean);
}

/** Chuyển số tiền dạng 1.000.000 đ thành một triệu đồng */
function docTien(soStr) {
  const num = Number(soStr.replace(/\./g, ''));
  if (Number.isNaN(num)) return soStr + ' đồng';
  if (num >= 1_000_000_000 && num % 1_000_000_000 === 0) return `${num / 1_000_000_000} tỷ đồng`;
  if (num >= 1_000_000 && num % 1_000_000 === 0) return `${num / 1_000_000} triệu đồng`;
  if (num >= 1_000 && num % 1_000 === 0) return `${num / 1_000} nghìn đồng`;
  return `${num} đồng`;
}

/** Chuẩn hoá văn bản bot thành câu đọc tự nhiên, loại bỏ bảng, hạn chế ≤ 150 từ (~60 giây) */
export function chuanHoaCauDoc(text) {
  let s = String(text ?? '');
  // 1. Loại bỏ các thẻ định dạng rich text của hệ thống
  s = s.replace(/\{[a-z/]+\}/gi, '');
  // 2. Bỏ các dòng bảng markdown (|...|)
  s = s.split('\n').filter((l) => !l.trim().startsWith('|') && !l.trim().includes('|---|')).join('\n');
  // 3. Bỏ ký tự markdown bullet, tiêu đề, in đậm, link
  s = s.replace(/[*_#`~>]/g, ' ');
  s = s.replace(/https?:\/\/\S+/gi, '');
  s = s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ''); // emojis
  // 4. Chuẩn hoá tỷ lệ phần trăm
  s = s.replace(/(\d+)\s*\/\s*(\d+)\s*%/g, '$1 đến $2 phần trăm');
  s = s.replace(/(\d+)\s*%/g, (m, p) => (p === '0' ? 'không phần trăm' : `${p} phần trăm`));
  // 5. Chuẩn hoá số tiền
  s = s.replace(/(\d+(?:\.\d{3})+)\s*(?:đ|vnd|vnđ)(?!\w)/gi, (m, p) => docTien(p));
  // 6. Chuẩn hoá mã HS (ưu tiên nhận diện 8 số hoặc 4.2.2 số)
  s = s.replace(/\b(\d{4}\.\d{2}\.\d{2})\b/g, (m, hs) => docMaHs(hs));
  s = s.replace(/\b(\d{8})\b/g, (m, hs) => docMaHs(hs));
  // 7. Đơn vị cơ bản
  s = s.replace(/\bUSD\b/g, 'đô la Mỹ');
  s = s.replace(/\b(?:VND|VNĐ)\b/gi, 'đồng');
  s = s.replace(/\bkg\b/gi, 'ki lô gam');
  // 8. Gom khoảng trắng
  s = s.replace(/\s+/g, ' ').trim();
  // 9. Giới hạn độ dài: cắt tối đa ~150 từ (tương đương ≤ 60 giây nói với tốc độ bình thường)
  const words = s.split(' ');
  if (words.length > 150) {
    s = words.slice(0, 150).join(' ') + '...';
  }
  return s;
}

/** Băm sha256 cho nội dung câu đọc và cấu hình giọng */
export function bamNoiDung(text, voice = '') {
  return createHash('sha256').update(String(text).trim() + ':' + String(voice).trim()).digest('hex');
}

/**
 * Chuyển Buffer PCM sang AAC 64 kbps qua ffmpeg.
 * BẮT BUỘC có hạn giờ: lời gọi này nằm trong khoá hàng đợi theo người
 * (core/webhook.js -> core/queue.js -> core/engine.js -> core/engine-voice.js).
 * ffmpeg treo mà không hạn giờ thì `close` không bao giờ bắn => khoá làn tin
 * của chính khách đó vĩnh viễn, bot im hẳn.
 */
export async function defaultFfmpeg(pcmBuffer, timeoutMs = 20_000, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const ff = spawnImpl('ffmpeg', [
      '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
      '-c:a', 'aac', '-b:a', '64k', '-f', 'adts', 'pipe:1',
    ]);
    const out = [];
    let err = '';
    let xong = false;
    const ketThuc = (fn, arg) => {
      if (xong) return;
      xong = true;
      clearTimeout(hen);
      fn(arg);
    };
    const hen = setTimeout(() => {
      try { ff.kill('SIGKILL'); } catch { /* tiến trình đã chết */ }
      ketThuc(reject, new Error(`ffmpeg quá ${timeoutMs} ms, đã giết tiến trình`));
    }, timeoutMs);
    if (typeof hen.unref === 'function') hen.unref();
    ff.stdout.on('data', (c) => out.push(c));
    ff.stderr.on('data', (c) => { err += c.toString(); });
    ff.on('error', (e) => ketThuc(reject, new Error(`ffmpeg lỗi spawn: ${e.message}`)));
    ff.on('close', (code) => {
      if (code === 0) ketThuc(resolve, Buffer.concat(out));
      else ketThuc(reject, new Error(`ffmpeg kết thúc với mã ${code}: ${err.slice(0, 300)}`));
    });
    ff.stdin.on('error', (e) => ketThuc(reject, new Error(`ffmpeg lỗi ghi stdin: ${e.message}`)));
    ff.stdin.write(pcmBuffer);
    ff.stdin.end();
  });
}

/** Factory tạo đối tượng giọng nói */
export function createGiongNoi({
  apiKey,
  model = 'gemini-2.5-flash-preview-tts',
  voice = 'Aoede',
  prompt = 'giọng nữ trẻ, miền Bắc, dịu dàng, ấm áp, lễ phép',
  dataDir = './data',
  publicBaseUrl = 'https://zalo-bot.uythacnhapkhau.com',
  fetchImpl = fetch,
  ffmpegImpl = defaultFfmpeg,
  ttsTimeoutMs = 30_000,
  ffmpegTimeoutMs = 20_000,
  log = console,
} = {}) {
  const amThanhDir = join(dataDir, 'am-thanh');
  try { mkdirSync(amThanhDir, { recursive: true }); } catch { /* đã tồn tại */ }

  /** Tạo tệp âm thanh AAC từ câu văn bản (có cache theo băm) */
  async function taoAmThanh(rawText, opts = {}) {
    const v = opts.voice || voice;
    const cauDoc = chuanHoaCauDoc(rawText);
    if (!cauDoc) return null;
    const băm = bamNoiDung(cauDoc, v);
    const fileName = `${băm}.aac`;
    const filePath = join(amThanhDir, fileName);
    const voiceUrl = `${publicBaseUrl.replace(/\/$/, '')}/am-thanh/${fileName}`;

    if (existsSync(filePath)) {
      return { băm, fileName, filePath, voiceUrl, cauDoc, cached: true };
    }

    // Chưa có trong cache: gọi Gemini TTS
    if (!apiKey) throw new Error('TTS lỗi: thiếu GEMINI_API_KEY');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const p = opts.prompt || prompt;
    const body = {
      contents: [{ parts: [{ text: cauDoc }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v } } },
      },
      systemInstruction: p ? { parts: [{ text: p }] } : undefined,
    };

    // Hạn giờ BẮT BUỘC: lời gọi này chạy trong khoá hàng đợi theo người.
    // Không có `signal` thì kết nối treo giữ khoá vĩnh viễn và bot im hẳn (OZV-709).
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ttsTimeoutMs),
    });

    if (!res.ok) {
      let errText = '';
      try { errText = JSON.stringify(await res.json()); } catch { errText = res.statusText; }
      throw new Error(`Gemini TTS lỗi ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) throw new Error('Gemini TTS không trả dữ liệu âm thanh');

    const rawBuffer = Buffer.from(inline.data, 'base64');
    // Đổi sang AAC bằng ffmpeg
    const aacBuffer = await ffmpegImpl(rawBuffer, ffmpegTimeoutMs);
    writeFileSync(filePath, aacBuffer);
    return { băm, fileName, filePath, voiceUrl, cauDoc, cached: false };
  }

  return {
    chuanHoa: chuanHoaCauDoc,
    bamNoiDung,
    taoAmThanh,
    amThanhDir,
  };
}

export const REPLY_TAT_GIONG = 'Dạ em đã tắt trả lời bằng giọng nói cho phòng này rồi ạ. Từ giờ em sẽ chỉ gửi tin nhắn chữ nhé.';
export const REPLY_BAT_GIONG = 'Dạ em đã bật lại trả lời bằng giọng nói cho phòng này rồi ạ. Em sẽ gửi kèm tin thoại tóm tắt cho anh chị nhé.';

/** Nhận diện ý định tắt giọng */
export function isTatGiong(text) {
  const norm = normVi(text);
  return /^(tat\s*giong|tat\s*am|tat\s*giong\s*noi|dung\s*giong\s*noi|khong\s*can\s*giong)$/i.test(norm)
    || /\b(tat\s*giong|tat\s*giong\s*noi)\b/i.test(norm);
}

/** Nhận diện ý định bật giọng */
export function isBatGiong(text) {
  const norm = normVi(text);
  return /^(bat\s*giong|bat\s*am|bat\s*lai\s*giong|bat\s*giong\s*noi|mo\s*giong)$/i.test(norm)
    || /\b(bat\s*giong|bat\s*lai\s*giong)\b/i.test(norm);
}
