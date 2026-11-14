// test/core/ozv-804-voice-ffmpeg.test.mjs — khoá nhánh lỗi THẬT của khâu `voice` (OZV-804).
//
// Chỉ số thực địa "lỗi theo khâu: voice 1 / 24h" đếm từ bảng `audit` nơi `type='error'` và
// `data.stage='voice'`; chỗ ghi duy nhất là `core/engine-voice.js:49`. Hạn mức `cap:voice`
// KHÔNG đi qua đó (`core/gate-decide.js:114` trả `defer`, gate không ném) nên đây là lỗi
// thật, không phải hạn mức bị đếm nhầm — không nới hạn mức.
//
// Lỗi thật: `core/giong-noi.js:82` gọi `spawn('ffmpeg')`, mà ảnh chạy thật (`Dockerfile`,
// nền `node:22-alpine`) chưa bao giờ cài `ffmpeg` → `ENOENT` → bot nói được chữ nhưng
// không đọc được thành tiếng. Hai ca dưới khoá cả hai đầu: ảnh phải có ffmpeg, và khi
// vẫn thiếu thì lời lỗi phải đọc ra được nguyên nhân.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultFfmpeg } from '../../core/giong-noi.js';

const GOC = process.cwd();
const dockerfile = readFileSync(resolve(GOC, 'Dockerfile'), 'utf8');
const giongNoi = readFileSync(resolve(GOC, 'core/giong-noi.js'), 'utf8');

test('OZV-804: code gọi spawn(ffmpeg) thì ảnh Docker PHẢI cài ffmpeg', () => {
  // Tiền đề: đường sinh giọng vẫn chạy ffmpeg ngoài tiến trình.
  // OZV-709 (PR #225) tiêm `spawnImpl = spawn` để test hạn giờ thay được spawn, nên
  // chỗ gọi thật giờ là `spawnImpl('ffmpeg', ...)`. Khớp cả hai tên: ý nghĩa canh cổng
  // không đổi — còn gọi ffmpeg ngoài tiến trình thì ảnh Docker vẫn phải cài ffmpeg.
  assert.match(giongNoi, /\bspawn(?:Impl)?\(\s*'ffmpeg'/, 'core/giong-noi.js không còn spawn ffmpeg — sửa lại ca này');
  // Ảnh phải cài: alpine → apk add ffmpeg (không có thì khâu voice lỗi mỗi lần thật).
  const coCai = /apk\s+add[^\n]*\bffmpeg\b/.test(dockerfile) || /apt-get\s+install[^\n]*\bffmpeg\b/.test(dockerfile);
  assert.ok(coCai, 'Dockerfile chưa cài ffmpeg: bot sẽ ném "spawn ffmpeg ENOENT" mỗi lần cần đọc tin thoại');
});

test('OZV-804: thiếu ffmpeg thì lời lỗi nói rõ ffmpeg (để audit stage=voice đọc ra nguyên nhân)', async () => {
  // Đặt PATH rỗng để spawn chắc chắn ENOENT, không phụ thuộc máy có ffmpeg hay không.
  const pathCu = process.env.PATH;
  process.env.PATH = '';
  try {
    await assert.rejects(
      () => defaultFfmpeg(Buffer.from('PCM-GIA')),
      (e) => {
        assert.match(e.message, /ffmpeg/i, `lời lỗi không nhắc ffmpeg: ${e.message}`);
        return true;
      },
    );
  } finally {
    process.env.PATH = pathCu;
  }
});

test('OZV-804: tài liệu vận hành phải ghi yêu cầu ffmpeg cho khâu giọng nói', () => {
  const wiki = readFileSync(resolve(GOC, 'docs/wiki/trien-khai-van-hanh.md'), 'utf8');
  assert.match(wiki, /ffmpeg/i, 'docs/wiki/trien-khai-van-hanh.md chưa nhắc ffmpeg — người vận hành không biết phải cài');
});
