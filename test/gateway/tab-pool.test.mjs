import test from 'node:test';
import assert from 'node:assert/strict';
import { createTabPool } from '../../addon/tab-pool.js';

function createFakeChromeTabsApi() {
  const tabs = new Map();
  let nextId = 1;
  const calls = {
    create: [],
    remove: [],
    update: []
  };

  return {
    tabs,
    calls,
    create: async ({ url }) => {
      const id = nextId++;
      const tab = { id, url, active: false };
      tabs.set(id, tab);
      calls.create.push({ id, url });
      return tab;
    },
    remove: async (id) => {
      calls.remove.push(id);
      if (!tabs.has(id)) {
        throw new Error(`Tab ${id} not found`);
      }
      tabs.delete(id);
    },
    update: async (id, props) => {
      calls.update.push({ id, props });
      const tab = tabs.get(id);
      if (!tab) {
        throw new Error(`Tab ${id} not found`);
      }
      Object.assign(tab, props);
      return tab;
    }
  };
}

test('T805: initPool khởi tạo đúng minTabs (mặc định 3) mở URL new_chat', async () => {
  const fakeApi = createFakeChromeTabsApi();
  const pool = createTabPool({
    chromeTabsApi: fakeApi,
    minTabs: 3,
    maxTabs: 8
  });

  await pool.initPool();

  assert.equal(pool.getActiveTabCount(), 3, 'Số tab đang hoạt động phải bằng 3');
  assert.equal(fakeApi.calls.create.length, 3, 'Phải gọi chromeTabsApi.create đúng 3 lần');
  for (const call of fakeApi.calls.create) {
    assert.equal(call.url, 'https://aistudio.google.com/prompts/new_chat', 'URL phải trỏ tới new_chat');
  }

  // Gọi initPool lần 2 không tạo thừa tab nếu đã đủ minTabs
  await pool.initPool();
  assert.equal(pool.getActiveTabCount(), 3, 'Không tạo thừa tab nếu đã đủ minTabs');
});

test('T805: acquireTab cấp tab rảnh rỗi không tranh chấp và trả về sessionKey', async () => {
  const fakeApi = createFakeChromeTabsApi();
  const pool = createTabPool({
    chromeTabsApi: fakeApi,
    minTabs: 3,
    maxTabs: 8
  });
  await pool.initPool();

  const resA = await pool.acquireTab('job-1');
  const resB = await pool.acquireTab('job-2');

  assert.ok(resA.tabId, 'Tab A phải có tabId');
  assert.ok(resB.tabId, 'Tab B phải có tabId');
  assert.notEqual(resA.tabId, resB.tabId, 'Hai việc đồng thời phải nhận 2 tabId khác nhau');
  assert.ok(typeof resA.sessionKey === 'string' && resA.sessionKey.length > 0, 'Phải có sessionKey A');
  assert.ok(typeof resB.sessionKey === 'string' && resB.sessionKey.length > 0, 'Phải có sessionKey B');
  assert.notEqual(resA.sessionKey, resB.sessionKey, 'sessionKey của hai việc phải khác nhau');

  const resC = await pool.acquireTab('job-3');
  assert.ok(resC.tabId, 'Tab C phải có tabId');
  assert.notEqual(resC.tabId, resA.tabId);
  assert.notEqual(resC.tabId, resB.tabId);

  // Khi hết tab rảnh và chưa scaleUp: phải ném lỗi
  await assert.rejects(
    async () => {
      await pool.acquireTab('job-4');
    },
    /No idle tab/i,
    'Phải báo lỗi khi không còn tab rảnh'
  );
});

test('T805: releaseTab cô lập phiên (Session Isolation), điều hướng về new_chat và đổi sessionKey', async () => {
  const fakeApi = createFakeChromeTabsApi();
  const pool = createTabPool({
    chromeTabsApi: fakeApi,
    minTabs: 3,
    maxTabs: 8
  });
  await pool.initPool();

  const acquired = await pool.acquireTab('job-1');
  const originalSessionKey = acquired.sessionKey;
  const tabId = acquired.tabId;

  // Release với resetSession: true (mặc định)
  await pool.releaseTab(tabId, { resetSession: true });

  // Kiểm tra đã gọi chromeTabsApi.update với URL new_chat
  const updateCall = fakeApi.calls.update.find(c => c.id === tabId);
  assert.ok(updateCall, 'Phải gọi chromeTabsApi.update khi resetSession');
  assert.equal(updateCall.props.url, 'https://aistudio.google.com/prompts/new_chat');

  // Acquire lại tab vừa release
  const reacquired = await pool.acquireTab('job-next');
  assert.equal(reacquired.tabId, tabId, 'Tab vừa giải phóng phải sẵn sàng cho việc mới');
  assert.notEqual(
    reacquired.sessionKey,
    originalSessionKey,
    'Phiên mới phải có sessionKey mới hoàn toàn (chống lẫn ngữ cảnh context bleed)'
  );
});

test('T805: releaseTab không resetSession nếu resetSession=false', async () => {
  const fakeApi = createFakeChromeTabsApi();
  const pool = createTabPool({
    chromeTabsApi: fakeApi,
    minTabs: 3,
    maxTabs: 8
  });
  await pool.initPool();

  const acquired = await pool.acquireTab('job-1');
  const updateCountBefore = fakeApi.calls.update.length;

  await pool.releaseTab(acquired.tabId, { resetSession: false });

  assert.equal(
    fakeApi.calls.update.length,
    updateCountBefore,
    'Không gọi chromeTabsApi.update nếu resetSession: false'
  );
});

test('T805: scaleUpIfNeeded mở rộng tab theo số lượng việc chờ nhưng không vượt quá maxTabs', async () => {
  const fakeApi = createFakeChromeTabsApi();
  const pool = createTabPool({
    chromeTabsApi: fakeApi,
    minTabs: 3,
    maxTabs: 8
  });
  await pool.initPool();
  assert.equal(pool.getActiveTabCount(), 3);

  // Mở rộng thêm 2 tab cho 2 việc chờ
  const added1 = await pool.scaleUpIfNeeded(2);
  assert.equal(added1, 2, 'Phải tạo thêm đúng 2 tab');
  assert.equal(pool.getActiveTabCount(), 5, 'Tổng số tab phải tăng lên 5');

  // Yêu cầu thêm 10 việc chờ, nhưng maxTabs = 8 -> chỉ được thêm tối đa 3 tab nữa
  const added2 = await pool.scaleUpIfNeeded(10);
  assert.equal(added2, 3, 'Chỉ được thêm 3 tab để chạm trần maxTabs = 8');
  assert.equal(pool.getActiveTabCount(), 8, 'Tổng số tab đạt trần maxTabs = 8');

  // Khi đã chạm trần maxTabs, gọi tiếp phải trả về 0
  const added3 = await pool.scaleUpIfNeeded(5);
  assert.equal(added3, 0, 'Đã chạm trần maxTabs thì không mở thêm tab nào');
  assert.equal(pool.getActiveTabCount(), 8);

  // Khi queuePendingCount <= 0, không mở thêm
  const added4 = await pool.scaleUpIfNeeded(0);
  assert.equal(added4, 0);
  const added5 = await pool.scaleUpIfNeeded(-1);
  assert.equal(added5, 0);
});

test('T805: closeIdleTabs đóng tab rảnh rỗi quá thời hạn nhưng không bao giờ dưới minTabs', async () => {
  const fakeApi = createFakeChromeTabsApi();
  const pool = createTabPool({
    chromeTabsApi: fakeApi,
    minTabs: 3,
    maxTabs: 8,
    idleCloseMs: 600000 // 10 phút
  });
  await pool.initPool();

  // Mở rộng lên 5 tab
  await pool.scaleUpIfNeeded(2);
  assert.equal(pool.getActiveTabCount(), 5);

  // Chiếm 2 tab (đang busy)
  const busy1 = await pool.acquireTab('job-busy-1');
  const busy2 = await pool.acquireTab('job-busy-2');

  // 3 tab còn lại là idle. Ta giả lập thời gian trôi qua 11 phút cho các tab idle
  const now = Date.now();
  // Can thiệp mốc thời gian nội bộ hoặc kiểm thử qua hàm closeIdleTabs với mốc thời gian
  // Thử đóng tab ngay lập tức (chưa đủ 10 phút rảnh rỗi) -> trả về 0
  const closedImmediate = await pool.closeIdleTabs();
  assert.equal(closedImmediate, 0, 'Chưa quá 10 phút rảnh rỗi thì không đóng tab nào');
  assert.equal(pool.getActiveTabCount(), 5);

  // Giả lập tab pool với idleCloseMs cực ngắn để kiểm tra logic đóng tab
  const shortIdlePool = createTabPool({
    chromeTabsApi: fakeApi,
    minTabs: 3,
    maxTabs: 8,
    idleCloseMs: 50 // 50ms
  });
  await shortIdlePool.initPool();
  await shortIdlePool.scaleUpIfNeeded(3); // tổng 6 tab
  assert.equal(shortIdlePool.getActiveTabCount(), 6);

  // Chiếm 1 tab làm busy
  const busyTab = await shortIdlePool.acquireTab('job-busy');

  // Đợi 60ms để các tab idle vượt quá ngưỡng 50ms
  await new Promise(resolve => setTimeout(resolve, 60));

  // Khi đóng tab rảnh: tổng số tab đang là 6, minTabs là 3.
  // 1 tab busy không được đóng.
  // 5 tab idle quá hạn, nhưng chỉ được đóng tối đa 3 tab (vì 6 - 3 = 3 tab thừa so với minTabs).
  const closedCount = await shortIdlePool.closeIdleTabs();
  assert.equal(closedCount, 3, 'Chỉ đóng đúng 3 tab thừa để duy trì minTabs = 3');
  assert.equal(shortIdlePool.getActiveTabCount(), 3, 'Tổng số tab sau khi dọn dẹp phải bằng minTabs (3)');

  // Tab busy vẫn an toàn tồn tại
  await shortIdlePool.releaseTab(busyTab.tabId, { resetSession: true });
});

test('T805: releaseTab ném lỗi nếu tabId không tồn tại trong pool', async () => {
  const fakeApi = createFakeChromeTabsApi();
  const pool = createTabPool({
    chromeTabsApi: fakeApi,
    minTabs: 3,
    maxTabs: 8
  });
  await pool.initPool();

  await assert.rejects(
    async () => {
      await pool.releaseTab(9999, { resetSession: true });
    },
    /không tồn tại|not found/i,
    'Phải báo lỗi khi release tab không thuộc pool'
  );
});
