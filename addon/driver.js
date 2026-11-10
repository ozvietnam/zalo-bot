/**
 * Addon Driver: Điều khiển DOM giao diện AI Studio (Spec 008, FR-004, FR-010, US2).
 * Mô phỏng nhịp thao tác người dùng với độ trễ ngẫu nhiên và trích xuất kết quả qua Clipboard.
 */

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dispatchDomEvent(element, type) {
  if (!element || typeof element.dispatchEvent !== 'function') return;
  let event;
  try {
    event = typeof Event !== 'undefined' ? new Event(type, { bubbles: true }) : { type };
  } catch {
    event = { type };
  }
  element.dispatchEvent(event);
}

export function createAiStudioDriver({
  domDocument,
  clipboardApi,
  selectors = {},
  minDelayMs = 300,
  maxDelayMs = 1500,
  sleepFn = defaultSleep,
  randomFn = Math.random,
  reloadTab = null,
  pollIntervalMs = 50
}) {
  const selPrompt = selectors.inputPrompt || 'textarea.prompt';
  const selSysInst = selectors.inputSystemInstruction || 'textarea.sys-inst';
  const selRun = selectors.runButton || 'button.run';
  const selCopy = selectors.copyButton || 'button.copy';
  const selLoading = selectors.loadingSpinner || '.loading';

  function getRandomDelay(min, max) {
    const r = typeof randomFn === 'function' ? randomFn() : Math.random();
    return Math.floor(min + r * (max - min));
  }

  async function simulateHumanInput(element, text) {
    if (!element) {
      throw new Error('Element to simulate input is not provided');
    }

    if (typeof element.focus === 'function') {
      element.focus();
    }

    dispatchDomEvent(element, 'keydown');

    if ('value' in element) {
      element.value = text;
    } else {
      element.innerText = text;
    }

    dispatchDomEvent(element, 'input');
    dispatchDomEvent(element, 'keyup');
    dispatchDomEvent(element, 'change');

    const delay = getRandomDelay(minDelayMs, maxDelayMs);
    await sleepFn(delay);
  }

  async function clickRunButton() {
    const runBtn = domDocument?.querySelector?.(selRun);
    if (!runBtn || runBtn.disabled) {
      throw new Error(`Cannot find runButton or button is disabled (${selRun})`);
    }

    runBtn.click();
  }

  async function extractResultViaCopy() {
    const copyBtn = domDocument?.querySelector?.(selCopy);
    if (!copyBtn) {
      throw new Error(`Cannot find copyButton (${selCopy})`);
    }

    copyBtn.click();

    if (!clipboardApi || typeof clipboardApi.readText !== 'function') {
      throw new Error('clipboardApi.readText is required to extract result');
    }

    return await clipboardApi.readText();
  }

  function triggerTabReload() {
    if (typeof reloadTab === 'function') {
      reloadTab();
      return;
    }
    if (typeof domDocument?.defaultView?.location?.reload === 'function') {
      domDocument.defaultView.location.reload();
      return;
    }
    if (typeof domDocument?.location?.reload === 'function') {
      domDocument.location.reload();
    }
  }

  async function executeJob({ systemInstruction, prompt, timeoutMs = 120000 }) {
    try {
      const promptEl = domDocument?.querySelector?.(selPrompt);
      if (!promptEl) {
        return { ok: false, error: `Cannot find inputPrompt element (${selPrompt})` };
      }

      if (systemInstruction && selectors.inputSystemInstruction) {
        const sysEl = domDocument?.querySelector?.(selSysInst);
        if (sysEl) {
          await simulateHumanInput(sysEl, systemInstruction);
        }
      }

      await simulateHumanInput(promptEl, prompt);

      const runBtn = domDocument?.querySelector?.(selRun);
      if (!runBtn || runBtn.disabled) {
        return { ok: false, error: `Cannot find runButton element (${selRun})` };
      }

      await clickRunButton();

      const startTime = Date.now();

      while (true) {
        if (Date.now() - startTime >= timeoutMs) {
          triggerTabReload();
          return {
            ok: false,
            error: `Timeout waiting for AI Studio result (exceeded ${timeoutMs}ms)`
          };
        }

        const spinner = domDocument?.querySelector?.(selLoading);
        if (spinner) {
          await sleepFn(pollIntervalMs);
          continue;
        }

        const copyBtn = domDocument?.querySelector?.(selCopy);
        if (copyBtn) {
          const resultText = await extractResultViaCopy();
          return { ok: true, resultText };
        }

        await sleepFn(pollIntervalMs);
      }
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  return {
    simulateHumanInput,
    clickRunButton,
    extractResultViaCopy,
    executeJob
  };
}
