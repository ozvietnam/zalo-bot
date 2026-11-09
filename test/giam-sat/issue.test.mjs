import test from 'node:test';
import assert from 'node:assert/strict';
import { xuLyIssue } from '../../scripts/giam-sat/issue.js';

test('1. Trùng fingerprint với issue đang mở → comment.length === 1, moi.length === 0 (SC-004)', async () => {
  const calls = [];
  const fakeGh = async (path, opts = {}) => {
    calls.push({ path, opts });
    if (path.includes('/search/issues')) {
      return {
        items: [
          {
            number: 12,
            state: 'open',
            title: '[giám sát] TOOL-ERR: tra_thue — Lỗi',
            labels: [{ name: 'giam-sat' }, { name: 'TOOL-ERR' }],
          },
        ],
      };
    }
    if (path.includes('/comments')) {
      return { id: 101, body: opts.body };
    }
    return { ok: true };
  };

  const phatHien = [
    {
      ma: 'TOOL-ERR',
      cheDo: 'tra_thue',
      fingerprint: 'TOOL-ERR:tra_thue',
      soDo: '5 lần lỗi',
      repo: 'ozplugin',
      bangChung: ['turn_1: lỗi cổng'],
      moTa: 'Công cụ tra thuế lỗi',
    },
  ];

  const res = await xuLyIssue(phatHien, {
    ghClient: fakeGh,
    ngay: '2026-11-06',
  });

  assert.equal(res.comment.length, 1, 'Phải ghi nhận 1 comment');
  assert.equal(res.moi.length, 0, 'Không được mở issue mới');
  assert.equal(res.comment[0].issue, 12);
  assert.equal(res.comment[0].repo, 'ozvietnam/ozplugin');

  const commentCall = calls.find(c => c.path.includes('/issues/12/comments') && c.opts.method === 'POST');
  assert.ok(commentCall, 'Client giả phải nhận lệnh POST comment vào issue cũ');
  const body = JSON.parse(commentCall.opts.body);
  assert.ok(body.body.includes('5 lần lỗi'));
});

test('2. Hai phát hiện cùng ma nhưng khác cheDo → hai fingerprint khác nhau → hai issue mới', async () => {
  const calls = [];
  const fakeGh = async (path, opts = {}) => {
    calls.push({ path, opts });
    if (path.includes('/search/issues')) {
      // Không có issue cũ
      return { items: [] };
    }
    if (path.endsWith('/issues') && opts.method === 'POST') {
      const data = JSON.parse(opts.body);
      return { number: calls.length, title: data.title, labels: data.labels };
    }
    return { ok: true };
  };

  const phatHien = [
    {
      ma: 'TOOL-ERR',
      cheDo: 'tra_thue',
      soDo: '4 lần',
      repo: 'ozplugin',
      bangChung: [],
      moTa: 'Lỗi tra thuế',
    },
    {
      ma: 'TOOL-ERR',
      cheDo: 'tra_thu_tuc',
      soDo: '3 lần',
      repo: 'ozplugin',
      bangChung: [],
      moTa: 'Lỗi tra thủ tục',
    },
  ];

  const res = await xuLyIssue(phatHien, {
    ghClient: fakeGh,
    ngay: '2026-11-06',
  });

  assert.equal(res.moi.length, 2, 'Phải tạo 2 issue mới riêng biệt');
  assert.equal(res.comment.length, 0);

  const postIssues = calls.filter(c => c.path.endsWith('/issues') && c.opts.method === 'POST');
  assert.equal(postIssues.length, 2);

  const labels1 = JSON.parse(postIssues[0].opts.body).labels;
  const labels2 = JSON.parse(postIssues[1].opts.body).labels;

  const fp1 = labels1.find(l => l.startsWith('fp:'));
  const fp2 = labels2.find(l => l.startsWith('fp:'));

  assert.ok(fp1, 'Issue 1 phải có nhãn fp:');
  assert.ok(fp2, 'Issue 2 phải có nhãn fp:');
  assert.notEqual(fp1, fp2, 'Hai fingerprint phải có nhãn mã hash khác nhau');
});

test('3. Bảy phát hiện mới cùng một repo → moi.length === 5, boViGioiHan.length === 2 (FR-007)', async () => {
  const fakeGh = async (path, opts = {}) => {
    if (path.includes('/search/issues')) {
      return { items: [] };
    }
    if (path.endsWith('/issues') && opts.method === 'POST') {
      return { number: Math.floor(Math.random() * 1000) };
    }
    return { ok: true };
  };

  const phatHien = Array.from({ length: 7 }, (_, i) => ({
    ma: `ERR-${i + 1}`,
    fingerprint: `sig-${i + 1}`,
    soDo: `${i + 1} lỗi`,
    repo: 'zalo-bot',
    bangChung: [],
    moTa: `Lỗi số ${i + 1}`,
  }));

  const res = await xuLyIssue(phatHien, {
    ghClient: fakeGh,
    ngay: '2026-11-06',
  });

  assert.equal(res.moi.length, 5, 'Chỉ được mở tối đa 5 issue mới');
  assert.equal(res.boViGioiHan.length, 2, '2 phát hiện vượt trần phải bị bỏ vào boViGioiHan');
});

test('4. Issue đã đóng + vượt ngưỡng 3 ngày → có trong reopen, client giả nhận lệnh PATCH state: open (FR-008)', async () => {
  const calls = [];
  const fakeGh = async (path, opts = {}) => {
    calls.push({ path, opts });
    if (path.includes('/search/issues')) {
      return {
        items: [
          {
            number: 42,
            state: 'closed',
            title: '[giám sát] GATE-LEAK — Đã đóng',
            comments: 3,
            labels: [{ name: 'giam-sat' }, { name: 'GATE-LEAK' }],
          },
        ],
      };
    }
    if (path.includes('/issues/42') && opts.method === 'PATCH') {
      return { number: 42, state: 'open' };
    }
    return { ok: true };
  };

  const phatHien = [
    {
      ma: 'GATE-LEAK',
      fingerprint: 'GATE-LEAK:main',
      soDo: 'Vượt ngưỡng ngày 3',
      repo: 'zalo-bot',
      ngayLienTiep: 3,
      bangChung: [],
      moTa: 'Lộ thông tin',
    },
  ];

  const res = await xuLyIssue(phatHien, {
    ghClient: fakeGh,
    ngay: '2026-11-06',
  });

  assert.equal(res.reopen.length, 1, 'Phải có 1 issue được mở lại');
  assert.equal(res.reopen[0].issue, 42);
  assert.equal(res.moi.length, 0);

  const patchCall = calls.find(c => c.path.includes('/issues/42') && c.opts.method === 'PATCH');
  assert.ok(patchCall, 'Client giả phải nhận lệnh PATCH cho issue 42');
  const patchData = JSON.parse(patchCall.opts.body);
  assert.equal(patchData.state, 'open', 'PATCH body phải có state: open');
});

test('5. Client giả ném lỗi khi tạo issue → không có trong moi, có trong loi (Hiến pháp VIII)', async () => {
  const fakeGh = async (path, opts = {}) => {
    if (path.includes('/search/issues')) {
      return { items: [] };
    }
    if (path.endsWith('/issues') && opts.method === 'POST') {
      throw new Error('GitHub API 500: Internal Server Error');
    }
    return { ok: true };
  };

  const phatHien = [
    {
      ma: 'TOOL-ERR',
      cheDo: 'tra_cuoc',
      soDo: '3 lần',
      repo: 'ozplugin',
      bangChung: [],
      moTa: 'Lỗi cước',
    },
  ];

  const res = await xuLyIssue(phatHien, {
    ghClient: fakeGh,
    ngay: '2026-11-06',
  });

  assert.equal(res.moi.length, 0, 'Khi tạo lỗi không được đưa vào moi');
  assert.ok(Array.isArray(res.loi), 'ketQua.loi phải là mảng');
  assert.equal(res.loi.length, 1, 'Phải ghi nhận 1 lỗi');
  assert.ok(res.loi[0].loi.includes('500'), 'Chi tiết lỗi phải được lưu');
});

test('6. Client giả ném lỗi khi comment hoặc reopen → ghi vào loi, không đếm nhầm', async () => {
  const fakeGh = async (path, opts = {}) => {
    if (path.includes('/search/issues')) {
      return {
        items: [
          {
            number: 99,
            state: 'open',
            title: '[giám sát] KHACH-BUC',
          },
        ],
      };
    }
    if (path.includes('/comments') && opts.method === 'POST') {
      throw new Error('GitHub API 403: Rate limit exceeded');
    }
    return { ok: true };
  };

  const phatHien = [
    {
      ma: 'KHACH-BUC',
      soDo: '2 khách',
      repo: 'zalo-bot',
      bangChung: [],
      moTa: 'Khách bức xúc',
    },
  ];

  const res = await xuLyIssue(phatHien, {
    ghClient: fakeGh,
    ngay: '2026-11-06',
  });

  assert.equal(res.comment.length, 0, 'Comment lỗi không được đưa vào comment');
  assert.ok(Array.isArray(res.loi), 'ketQua.loi phải là mảng');
  assert.equal(res.loi.length, 1);
  assert.ok(res.loi[0].loi.includes('403'));
});

test('7. dryRun = true → không gọi GitHub API, chỉ phân loại kết quả', async () => {
  let callCount = 0;
  const fakeGh = async () => {
    callCount++;
    return {};
  };

  const phatHien = [
    {
      ma: 'JOB-EXPIRED',
      soDo: '1 việc treo',
      repo: 'ozplugin',
      bangChung: [],
      moTa: 'Việc nền treo',
    },
  ];

  const res = await xuLyIssue(phatHien, {
    dryRun: true,
    ghClient: fakeGh,
    ngay: '2026-11-06',
  });

  assert.equal(callCount, 0, 'dryRun không được gọi bất kỳ API nào');
  assert.equal(res.moi.length, 1, 'dryRun vẫn trả về kết quả dự kiến');
  assert.equal(res.loi, null);
});

test('8. Issue đã đóng nhưng chưa đủ 3 ngày → không reopen và không mở trùng issue mới (SC-004)', async () => {
  const fakeGh = async (path) => {
    if (path.includes('/search/issues')) {
      return {
        items: [
          {
            number: 55,
            state: 'closed',
            title: '[giám sát] HOI-LAI',
            comments: 1, // mới chỉ 1 ngày / 1 comment
          },
        ],
      };
    }
    return { ok: true };
  };

  const phatHien = [
    {
      ma: 'HOI-LAI',
      soDo: '1 phòng hỏi lại',
      repo: 'zalo-bot',
      ngayLienTiep: 1, // chưa đủ 3 ngày
      bangChung: [],
      moTa: 'Hỏi lại',
    },
  ];

  const res = await xuLyIssue(phatHien, {
    ghClient: fakeGh,
    ngay: '2026-11-06',
  });

  assert.equal(res.reopen.length, 0, 'Chưa đủ 3 ngày không được reopen');
  assert.equal(res.moi.length, 0, 'Đã có issue cho fingerprint thì không mở issue mới trùng');
});

test('9. Thiếu GITHUB_TOKEN khi !dryRun và không tiêm ghClient → trả về lỗi rõ ràng', async () => {
  const origToken = process.env.GITHUB_TOKEN;
  const origGhToken = process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;

  try {
    const phatHien = [
      {
        ma: 'GATE-MONEY',
        soDo: '1 vi phạm',
        repo: 'zalo-bot',
        bangChung: [],
        moTa: 'Tiền không căn cứ',
      },
    ];

    const res = await xuLyIssue(phatHien, {
      dryRun: false,
      ngay: '2026-11-06',
    });

    assert.ok(Array.isArray(res.loi));
    assert.ok(res.loi.length > 0);
    assert.ok(res.loi[0].loi.includes('GITHUB_TOKEN'));
    assert.equal(res.moi.length, 0);
  } finally {
    if (origToken) process.env.GITHUB_TOKEN = origToken;
    if (origGhToken) process.env.GH_TOKEN = origGhToken;
  }
});
