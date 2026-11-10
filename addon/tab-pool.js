/**
 * Quản lý vòng đời nhóm tab và cô lập phiên làm việc (Session Isolation)
 * cho Chrome Extension Manifest V3 Cổng AI Studio (Spec 008, FR-005, FR-009, US2).
 */

const DEFAULT_NEW_CHAT_URL = 'https://aistudio.google.com/prompts/new_chat';
const DEFAULT_MIN_TABS = 3;
const DEFAULT_MAX_TABS = 8;
const DEFAULT_IDLE_CLOSE_MS = 10 * 60 * 1000; // 10 phút

function createSessionKey(tabId) {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `session-${tabId}-${Date.now()}-${rand}`;
}

export function createTabPool({
  chromeTabsApi,
  minTabs = DEFAULT_MIN_TABS,
  maxTabs = DEFAULT_MAX_TABS,
  idleCloseMs = DEFAULT_IDLE_CLOSE_MS
} = {}) {
  if (!chromeTabsApi) {
    throw new Error('chromeTabsApi là bắt buộc để khởi tạo tab pool');
  }

  const pool = new Map();

  async function createSingleTab() {
    const rawTab = await chromeTabsApi.create({ url: DEFAULT_NEW_CHAT_URL });
    const tabInfo = {
      tabId: rawTab.id,
      status: 'idle',
      sessionKey: createSessionKey(rawTab.id),
      currentJobId: null,
      lastUsedAt: Date.now(),
      createdAt: Date.now()
    };
    pool.set(rawTab.id, tabInfo);
    return tabInfo;
  }

  async function initPool() {
    while (pool.size < minTabs) {
      await createSingleTab();
    }
  }

  async function acquireTab(jobId) {
    let idleTab = null;
    for (const tab of pool.values()) {
      if (tab.status === 'idle') {
        idleTab = tab;
        break;
      }
    }

    if (!idleTab) {
      throw new Error(`No idle tab available in pool (size: ${pool.size}, max: ${maxTabs})`);
    }

    idleTab.status = 'busy';
    idleTab.currentJobId = jobId || null;
    idleTab.lastUsedAt = Date.now();

    return {
      tabId: idleTab.tabId,
      sessionKey: idleTab.sessionKey
    };
  }

  async function releaseTab(tabId, { resetSession = true } = {}) {
    const tab = pool.get(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} không tồn tại trong pool`);
    }

    if (resetSession) {
      await chromeTabsApi.update(tabId, { url: DEFAULT_NEW_CHAT_URL });
      tab.sessionKey = createSessionKey(tabId);
    }

    tab.status = 'idle';
    tab.currentJobId = null;
    tab.lastUsedAt = Date.now();
  }

  async function scaleUpIfNeeded(queuePendingCount) {
    if (typeof queuePendingCount !== 'number' || queuePendingCount <= 0) {
      return 0;
    }

    const availableSlots = Math.max(0, maxTabs - pool.size);
    const countToCreate = Math.min(availableSlots, queuePendingCount);

    for (let i = 0; i < countToCreate; i++) {
      await createSingleTab();
    }

    return countToCreate;
  }

  async function closeIdleTabs() {
    const maxCloseable = Math.max(0, pool.size - minTabs);
    if (maxCloseable <= 0) {
      return 0;
    }

    const now = Date.now();
    let closedCount = 0;

    for (const [id, tab] of pool.entries()) {
      if (closedCount >= maxCloseable) {
        break;
      }
      if (tab.status === 'idle' && (now - tab.lastUsedAt) >= idleCloseMs) {
        try {
          await chromeTabsApi.remove(id);
        } catch {
          // Bỏ qua nếu tab đã bị người dùng hoặc trình duyệt đóng ngoài ý muốn
        }
        pool.delete(id);
        closedCount++;
      }
    }

    return closedCount;
  }

  function getActiveTabCount() {
    return pool.size;
  }

  return {
    initPool,
    acquireTab,
    releaseTab,
    scaleUpIfNeeded,
    closeIdleTabs,
    getActiveTabCount
  };
}
