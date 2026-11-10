import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiStudioDriver } from '../../addon/driver.js';

test('T806: Driver điền nội dung, bấm Run và trích xuất kết quả với nhịp trễ người dùng', async () => {
  let clickCount = 0;
  const copiedText = 'Bản nháp gợi ý từ AI Studio: Mã HS 8415.10.10\n- Thuế NK: 10%\n- VAT: 8%';
  const events = [];

  const fakeDoc = {
    querySelector: (sel) => {
      const s = sel.toLowerCase();
      if (s.includes('prompt')) {
        return {
          value: '',
          focus() { events.push('focus'); },
          dispatchEvent(evt) { events.push(evt.type || evt); }
        };
      }
      if (s.includes('run')) {
        return { disabled: false, click() { clickCount++; } };
      }
      if (s.includes('copy')) {
        return { click() { events.push('click-copy'); } };
      }
      if (s.includes('loading')) return null;
      return null;
    }
  };

  const selectors = {
    inputPrompt: 'textarea.prompt',
    runButton: 'button.run',
    copyButton: 'button.copy',
    loadingSpinner: '.loading'
  };

  const driver = createAiStudioDriver({
    domDocument: fakeDoc,
    clipboardApi: { readText: async () => copiedText },
    selectors,
    minDelayMs: 1,
    maxDelayMs: 2
  });

  const res = await driver.executeJob({ prompt: 'Tra mã điều hòa' });
  assert.equal(res.ok, true);
  assert.equal(res.resultText, copiedText);
  assert.equal(clickCount, 1, 'Nút Run phải được bấm đúng 1 lần');
  assert.ok(events.includes('click-copy'), 'Phải kích hoạt click nút copy');
});

test('T806: simulateHumanInput phát đầy đủ sự kiện DOM và gán giá trị', async () => {
  const dispatchedEvents = [];
  let focused = false;

  const fakeElement = {
    value: '',
    focus() { focused = true; },
    dispatchEvent(evt) { dispatchedEvents.push(evt.type || evt); }
  };

  const recordedDelays = [];
  const driver = createAiStudioDriver({
    domDocument: {},
    clipboardApi: {},
    minDelayMs: 10,
    maxDelayMs: 30,
    sleepFn: async (ms) => { recordedDelays.push(ms); }
  });

  await driver.simulateHumanInput(fakeElement, 'Mô tả hàng hóa: Máy tiện kim loại');

  assert.equal(focused, true, 'Phải gọi focus()');
  assert.equal(fakeElement.value, 'Mô tả hàng hóa: Máy tiện kim loại');
  assert.deepEqual(dispatchedEvents, ['keydown', 'input', 'keyup', 'change']);
  assert.ok(recordedDelays.length >= 1);
  for (const d of recordedDelays) {
    assert.ok(d >= 10 && d <= 30, `Độ trễ ${d}ms phải trong [10, 30]`);
  }
});

test('T806: Độ trễ ngẫu nhiên mô phỏng người tuân thủ minDelayMs - maxDelayMs (FR-010)', async () => {
  const delays = [];
  const driver = createAiStudioDriver({
    domDocument: {},
    clipboardApi: {},
    minDelayMs: 300,
    maxDelayMs: 1500,
    sleepFn: async (ms) => { delays.push(ms); }
  });

  const fakeElement = { value: '', focus() {}, dispatchEvent() {} };
  for (let i = 0; i < 5; i++) {
    await driver.simulateHumanInput(fakeElement, `Thử nghiệm ${i}`);
  }

  assert.equal(delays.length, 5);
  for (const d of delays) {
    assert.ok(d >= 300 && d <= 1500, `Độ trễ ${d}ms phải trong [300, 1500]`);
  }
});

test('T806: executeJob điền cả systemInstruction và prompt theo thứ tự', async () => {
  const filled = [];
  let runClicked = 0;

  const sysElem = {
    value: '',
    focus() {},
    dispatchEvent(evt) { filled.push({ field: 'system', type: evt.type || evt }); }
  };

  const promptElem = {
    value: '',
    focus() {},
    dispatchEvent(evt) { filled.push({ field: 'prompt', type: evt.type || evt }); }
  };

  const fakeDoc = {
    querySelector: (sel) => {
      if (sel === 'textarea.sys-inst') return sysElem;
      if (sel === 'textarea.prompt') return promptElem;
      if (sel === 'button.run') {
        return { disabled: false, click() { runClicked++; } };
      }
      if (sel === 'button.copy') return { click() {} };
      if (sel === '.spinner') return null;
      return null;
    }
  };

  const driver = createAiStudioDriver({
    domDocument: fakeDoc,
    clipboardApi: { readText: async () => 'Kết quả' },
    selectors: {
      inputSystemInstruction: 'textarea.sys-inst',
      inputPrompt: 'textarea.prompt',
      runButton: 'button.run',
      copyButton: 'button.copy',
      loadingSpinner: '.spinner'
    },
    minDelayMs: 1,
    maxDelayMs: 2
  });

  const res = await driver.executeJob({
    systemInstruction: 'Bạn là chuyên viên hải quan OZ',
    prompt: 'Tra cứu mã 8415'
  });

  assert.equal(res.ok, true);
  assert.equal(runClicked, 1);
  assert.equal(sysElem.value, 'Bạn là chuyên viên hải quan OZ');
  assert.equal(promptElem.value, 'Tra cứu mã 8415');
  assert.ok(filled.some(f => f.field === 'system' && f.type === 'input'));
  assert.ok(filled.some(f => f.field === 'prompt' && f.type === 'input'));
});

test('T806: extractResultViaCopy bảo toàn 100% định dạng Markdown và JSON', async () => {
  const rawComplexText = `### BẢNG TRA CỨU HẢI QUAN
| STT | Mã HS | Mô tả | Thuế NK |
|---|---|---|---|
| 1 | 8415.10.10 | Máy điều hòa | 10% |

\`\`\`json
{
  "status": "success",
  "hs_code": "8415.10.10",
  "vat": "8%"
}
\`\`\`
\tUnicode: Tiếng Việt có dấu đầy đủ.`;

  let copyClicked = false;
  const fakeDoc = {
    querySelector: (sel) => {
      if (sel === 'button.copy-btn') {
        return { click() { copyClicked = true; } };
      }
      return null;
    }
  };

  const driver = createAiStudioDriver({
    domDocument: fakeDoc,
    clipboardApi: { readText: async () => rawComplexText },
    selectors: { copyButton: 'button.copy-btn' },
    minDelayMs: 1,
    maxDelayMs: 2
  });

  const extracted = await driver.extractResultViaCopy();
  assert.equal(copyClicked, true);
  assert.equal(extracted, rawComplexText, 'Clipboard giữ nguyên 100% định dạng');
});

test('T806: Timeout quá hạn tự động reload tab và trả về lỗi (US2)', async () => {
  let reloaded = false;
  let spinnerChecks = 0;

  const fakeDoc = {
    defaultView: {
      location: {
        reload() { reloaded = true; }
      }
    },
    querySelector: (sel) => {
      const s = sel.toLowerCase();
      if (s.includes('prompt')) return { focus() {}, dispatchEvent() {} };
      if (s.includes('run')) return { disabled: false, click() {} };
      if (s.includes('loading')) {
        spinnerChecks++;
        return { isVisible: true }; // Luôn có spinner
      }
      return null;
    }
  };

  const driver = createAiStudioDriver({
    domDocument: fakeDoc,
    clipboardApi: { readText: async () => '' },
    selectors: {
      inputPrompt: 'textarea.prompt',
      runButton: 'button.run',
      copyButton: 'button.copy',
      loadingSpinner: '.loading'
    },
    minDelayMs: 1,
    maxDelayMs: 2,
    pollIntervalMs: 5
  });

  const res = await driver.executeJob({
    prompt: 'Câu hỏi chạy quá lâu',
    timeoutMs: 30
  });

  assert.equal(res.ok, false);
  assert.match(res.error, /timeout/i);
  assert.equal(reloaded, true, 'Tự động tải lại tab khi quá hạn');
  assert.ok(spinnerChecks > 0);
});

test('T806: Xử lý lỗi khi thiếu element DOM cần thiết', async () => {
  const driver = createAiStudioDriver({
    domDocument: { querySelector: () => null },
    clipboardApi: { readText: async () => '' },
    selectors: {
      inputPrompt: 'textarea.prompt',
      runButton: 'button.run',
      copyButton: 'button.copy'
    },
    minDelayMs: 1,
    maxDelayMs: 2
  });

  const res = await driver.executeJob({ prompt: 'Không có prompt element' });
  assert.equal(res.ok, false);
  assert.match(res.error, /inputPrompt/i);

  await assert.rejects(async () => driver.clickRunButton(), /runButton/i);
  await assert.rejects(async () => driver.extractResultViaCopy(), /copyButton/i);
});
