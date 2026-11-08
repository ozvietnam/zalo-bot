import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { openStore } from '../../core/store.js';

const T = '2026-11-04T07:16:00.000Z';
const at = (min) => new Date(Date.parse(T) + min * 60_000).toISOString();
const ob = (o = {}) => ({ idem_key: 'r:c:m1:0', chat_id: 'c', kind: 'reply', text: 'a', decision: 'send', status: 'queued', created_at: T, ...o });

test('migrate idempotent, schema_version', () => {
  const s = openStore();
  assert.equal(s.meta.get('schema_version'), '1');
  const f = join(tmpdir(), `store-test-${process.pid}-${Date.now()}.db`);
  try {
    openStore(f).close();
    const s2 = openStore(f);
    assert.equal(s2.meta.get('schema_version'), '1');
    s2.meta.set('last_digest_at', T);
    s2.close();
    const s3 = openStore(f);
    assert.equal(s3.meta.get('last_digest_at'), T);
    s3.close();
  } finally {
    for (const x of ['', '-wal', '-shm']) if (existsSync(f + x)) rmSync(f + x);
  }
});

test('inbox', () => {
  const s = openStore();
  const row = { update_key: 'm1', chat_id: 'c', raw: '{}', status: 'pending', received_at: T };
  assert.equal(s.inbox.insertIgnore(row), true);
  assert.equal(s.inbox.insertIgnore(row), false);
  s.inbox.insertIgnore({ ...row, update_key: 'm0', received_at: at(-1) });
  assert.deepEqual(s.inbox.pending().map((r) => r.update_key), ['m0', 'm1']);
  s.inbox.markDone('m0', at(2));
  s.inbox.markFailed('m1', 'boom', at(3));
  assert.equal(s.inbox.pending().length, 0);
});

test('inbox.claim: pending → processing đúng một lần (claimed_at), pending() bỏ dòng processing', () => {
  const s = openStore();
  s.inbox.insertIgnore({ update_key: 'q', chat_id: 'c', raw: '{}', received_at: T });
  assert.equal(s.inbox.claim('q', at(1)), true);
  assert.equal(s.inbox.claim('q', at(2)), false);
  assert.equal(s.inbox.claim('khong-co', at(2)), false);
  assert.deepEqual([s.inbox.get('q').status, s.inbox.get('q').claimed_at], ['processing', at(1)]);
  assert.equal(s.inbox.pending().length, 0);
  s.inbox.markDone('q', at(3));
  assert.equal(s.inbox.claim('q', at(4)), false);
});

test('jobs.claim: waiting → polling đúng một lần; polling vẫn là nợ (openFor), không due', () => {
  const s = openStore();
  const id = s.jobs.add({ chat_id: 'c', session_key: 'c', pack: 'hs', ma_luot: 'L9', result_tool: 'kq', status: 'waiting', next_poll_at: at(1), expires_at: at(30), created_at: T });
  assert.equal(s.jobs.claim(id), true);
  assert.equal(s.jobs.claim(id), false);
  assert.equal(s.jobs.due(at(5)).length, 0);
  assert.equal(s.jobs.openFor('c', T), true);
  s.jobs.update(id, { status: 'waiting' });
  assert.equal(s.jobs.claim(id), true);
});

test('inbox: done_at uses caller clock; NOT NULL violation throws, duplicate does not', () => {
  const s = openStore();
  const row = { update_key: 'k', chat_id: 'c', raw: '{}', status: 'pending', received_at: T };
  s.inbox.insertIgnore(row);
  s.inbox.markDone('k', at(9));
  s.inbox.insertIgnore({ ...row, update_key: 'k2' });
  s.inbox.markFailed('k2', 'e', at(10));
  assert.deepEqual(s.inbox.get('k').done_at, at(9));
  assert.equal(s.inbox.get('k2').done_at, at(10));
  assert.throws(() => s.inbox.insertIgnore({ ...row, update_key: 'k3', chat_id: null }), /NOT NULL/);
  assert.equal(s.inbox.insertIgnore(row), false);
});

test('jobs.add / outbox.insert: NOT NULL violations throw (not swallowed)', () => {
  const s = openStore();
  const j = { chat_id: 'c', session_key: 'c', pack: 'hs', ma_luot: 'L1', result_tool: 't', status: 'waiting', next_poll_at: T, expires_at: T };
  assert.throws(() => s.jobs.add({ ...j, result_tool: null }), /NOT NULL/);
  assert.throws(() => s.outbox.insert(ob({ text: null })), /NOT NULL/);
  assert.notEqual(s.jobs.add(j), null);
});

test('sessions.get throws on invalid now', () => {
  const s = openStore();
  s.sessions.set('k', { a: 1 }, T);
  assert.throws(() => s.sessions.get('k', 1000, 'garbage'), /invalid/i);
});

test('outbox.due: failed with NULL next_retry_at is due only while attempts <= 3 (3 retries)', () => {
  const s = openStore();
  s.outbox.insert(ob({ idem_key: 'n1', status: 'failed', attempts: 3 }));
  s.outbox.insert(ob({ idem_key: 'n2', status: 'failed', attempts: 4 }));
  assert.deepEqual(s.outbox.due(T).map((r) => r.idem_key), ['n1']);
});

test('tickets.open returns the existing open/claimed ticket; unique index enforces', () => {
  const s = openStore();
  const a = s.tickets.open('c', 'c', 'khach-xin-nguoi', T);
  const b = s.tickets.open('c', 'c', 'cap', at(1));
  assert.equal(a.id, b.id);
  assert.equal(s.tickets.list('open').length, 1);
  s.tickets.update(a.id, { status: 'claimed', claimed_by: 'u1' });
  assert.equal(s.tickets.open('c', 'c', 'cap', at(2)).id, a.id);
  s.tickets.update(a.id, { status: 'closed', closed_at: at(3) });
  const c = s.tickets.open('c', 'c', 'cap', at(4));
  assert.notEqual(c.id, a.id);
  assert.equal(s.tickets.open('d', 'd', 'cap', at(4)).chat_id, 'd');
});

test('chats', () => {
  const s = openStore();
  assert.equal(s.chats.get('c2'), null);
  s.chats.upsertSeen('c2', 'user', 'An', T);
  let c = s.chats.get('c2');
  assert.equal(c.state, 'bot');
  assert.equal(c.title, 'An');
  assert.equal(c.last_inbound_at, T);
  s.chats.setState('c2', 'human', 'u1', 'nhan', at(1));
  c = s.chats.get('c2');
  assert.deepEqual([c.state, c.state_by, c.state_reason, c.state_at], ['human', 'u1', 'nhan', at(1)]);
  s.chats.setState('c9', 'blocked', 'system', 'x', T); // creates if absent
  assert.equal(s.chats.get('c9').state, 'blocked');
});

test('sessions ttl + json', () => {
  const s = openStore();
  assert.deepEqual(s.sessions.get('k', 1000, T), {});
  s.sessions.set('k', { goi: 'hs', n: [1] }, T);
  assert.deepEqual(s.sessions.get('k', 60_000, at(0.5)), { goi: 'hs', n: [1] });
  assert.deepEqual(s.sessions.get('k', 60_000, at(2)), {});
  s.sessions.set('k', { a: 1 }, at(3));
  assert.deepEqual(s.sessions.get('k', 60_000, at(3)), { a: 1 });
});

test('outbox', () => {
  const s = openStore();
  const id = s.outbox.insert(ob());
  assert.equal(typeof id, 'number');
  assert.equal(s.outbox.hasIdem('r:c:m1:0'), true);
  assert.equal(s.outbox.hasIdem('zzz'), false);
  assert.throws(() => s.outbox.insert(ob()), /DUPLICATE_IDEM/);
  s.outbox.update(id, { status: 'sent', sent_at: at(1), parts_sent: 1 });
  s.outbox.insert(ob({ idem_key: 'k2', text: 'b', kind: 'notice', status: 'sent', sent_at: at(2) }));
  s.outbox.insert(ob({ idem_key: 'k3', text: 'c', kind: 'staff_relay', status: 'sent', sent_at: at(3) }));
  s.outbox.insert(ob({ idem_key: 'k4', chat_id: 'd', text: 'd', status: 'sent', sent_at: at(4) }));
  s.outbox.insert(ob({ idem_key: 'k5', text: 'e', status: 'dropped' }));
  assert.deepEqual(s.outbox.recentBotMsgs('c', T, 10), [{ text: 'b', at: at(2) }, { text: 'a', at: at(1) }]);
  assert.deepEqual(s.outbox.recentBotMsgs('c', T, 1), [{ text: 'b', at: at(2) }]);
  assert.deepEqual(s.outbox.recentBotMsgs('c', at(1.5), 10), [{ text: 'b', at: at(2) }]);
  assert.equal(s.outbox.countSent('c', T), 3);
  assert.equal(s.outbox.countSent(null, T), 4);
  assert.equal(s.outbox.countSent(null, at(3)), 2);

  // Trần tin/ngày là ngân sách tin TỚI KHÁCH: `ticket` (vào nhóm nhân viên) và `digest` (bản tin cho
  // người vận hành) không được trừ vào đó, nếu không mỗi phiếu lại ăn một suất của khách.
  s.outbox.insert(ob({ idem_key: 'k6', text: 'phiếu', kind: 'ticket', status: 'sent', sent_at: at(6) }));
  s.outbox.insert(ob({ idem_key: 'k7', text: 'bản tin', kind: 'digest', status: 'sent', sent_at: at(7) }));
  assert.equal(s.outbox.countSent('c', T), 3, 'phiếu và bản tin không tính vào trần theo phòng');
  assert.equal(s.outbox.countSent(null, T), 4, 'cũng không tính vào trần toàn bot');
  assert.equal(s.outbox.countSentChat('c', T), 3);
});

// Khoá idem là bản ghi BỀN duy nhất còn lại sau khi một tiến trình chết giữa lúc gửi. Người gọi đặt
// khoá theo quy ước "việc:khoảng-đã-làm" (T024: `p:<id>:f:<mốc cũ>:t:<mốc mới>`) thì đọc lại được
// "lần trước đã chở tới đâu" — nên hàm này phải chỉ trả dòng cửa THẬT SỰ nhận gửi.
test('outbox.lastSentByIdemPrefix: dòng send mới nhất theo tiền tố, bỏ dòng cửa đã bỏ', () => {
  const s = openStore();
  assert.equal(s.outbox.lastSentByIdemPrefix('p:1:f:'), null);
  s.outbox.insert(ob({ idem_key: 'p:1:f:A:t:B', text: 'gộp 1' }));
  s.outbox.insert(ob({ idem_key: 'p:1:f:B:t:C', text: 'gộp 2' }));
  s.outbox.insert(ob({ idem_key: 'p:2:f:A:t:Z', text: 'phiếu khác' }));
  // Dòng cửa BỎ không được tính là đã làm: tin đó không bao giờ đi ra.
  s.outbox.insert(ob({ idem_key: 'p:1:f:C:t:D', text: 'bị bỏ', decision: 'reject', status: 'rejected' }));
  s.outbox.insert(ob({ idem_key: 'p:1:f:C:t:E', text: 'cũng bị bỏ', decision: 'drop', status: 'dropped' }));

  assert.equal(s.outbox.lastSentByIdemPrefix('p:1:f:A:t:').idem_key, 'p:1:f:A:t:B');
  assert.equal(s.outbox.lastSentByIdemPrefix('p:1:f:C:t:'), null, 'chỉ có dòng bị cửa bỏ thì coi như chưa làm');
  assert.equal(s.outbox.lastSentByIdemPrefix('p:1:f:').idem_key, 'p:1:f:B:t:C', 'dòng mới nhất, không lẫn phiếu khác');
  assert.equal(s.outbox.lastSentByIdemPrefix('p:2:f:').idem_key, 'p:2:f:A:t:Z');
  // `_` và `%` của LIKE phải được escape, nếu không tiền tố nào cũng khớp mọi thứ.
  assert.equal(s.outbox.lastSentByIdemPrefix('p:1:f%'), null);
  assert.equal(s.outbox.lastSentByIdemPrefix('p_1:f:'), null);
});

test('outbox.due', () => {
  const s = openStore();
  s.outbox.insert(ob({ idem_key: 'a', status: 'deferred', not_before: at(5) }));
  s.outbox.insert(ob({ idem_key: 'b', status: 'deferred', not_before: at(20) }));
  s.outbox.insert(ob({ idem_key: 'c', status: 'failed', attempts: 1, next_retry_at: at(5) }));
  s.outbox.insert(ob({ idem_key: 'd', status: 'failed', attempts: 4, next_retry_at: at(5) }));
  s.outbox.insert(ob({ idem_key: 'g', status: 'failed', attempts: 3, next_retry_at: at(5) }));
  s.outbox.insert(ob({ idem_key: 'e', status: 'failed', attempts: 1, next_retry_at: at(50) }));
  s.outbox.insert(ob({ idem_key: 'f', status: 'queued' }));
  assert.deepEqual(s.outbox.due(at(10)).map((r) => r.idem_key).sort(), ['a', 'c', 'g']);
});

test('jobs', () => {
  const s = openStore();
  const j = { chat_id: 'c', session_key: 'c', pack: 'hs', ma_luot: 'L1', result_tool: 'ket_qua_phan_loai', context: { x: 1 }, status: 'waiting', next_poll_at: at(1), expires_at: at(30), created_at: T };
  const id = s.jobs.add(j);
  assert.equal(id !== null, true);
  assert.equal(s.jobs.add(j), null);
  assert.equal(s.jobs.due(T).length, 0);
  const d = s.jobs.due(at(2));
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].context, { x: 1 });
  assert.equal(s.jobs.nextDue(), at(1));
  s.jobs.update(id, { status: 'done', attempts: 2, done_at: at(2) });
  assert.equal(s.jobs.due(at(2)).length, 0);
  assert.equal(s.jobs.nextDue(), null);
  assert.throws(() => s.jobs.update(id, { 'status=1;--': 1 }), /column/i);
});

test('tickets', () => {
  const s = openStore();
  assert.equal(s.tickets.openFor('c'), null);
  const t = s.tickets.open('c', 'c', 'khach-xin-nguoi', T);
  assert.equal(t.status, 'open');
  assert.equal(s.tickets.openFor('c').id, t.id);
  s.tickets.update(t.id, { status: 'claimed', claimed_by: 'u1', claimed_at: at(1) });
  assert.equal(s.tickets.openFor('c').status, 'claimed');
  assert.equal(s.tickets.list('claimed').length, 1);
  assert.equal(s.tickets.list('open').length, 0);
  s.tickets.update(t.id, { status: 'closed', closed_at: at(2) });
  assert.equal(s.tickets.openFor('c'), null);
  assert.equal(s.tickets.list('closed').length, 1);
});

test('audit', () => {
  const s = openStore();
  s.audit.add({ at: T, turn_id: 't1', chat_id: 'c', type: 'inbound', data: { a: 1 } });
  s.audit.add({ at: at(1), turn_id: 't1', chat_id: 'c', type: 'gate', data: { b: 2 } });
  s.audit.add({ at: at(2), turn_id: 't2', chat_id: 'c', type: 'error', data: 'x' });
  assert.deepEqual(s.audit.byTurn('t1').map((r) => r.type), ['inbound', 'gate']);
  assert.deepEqual(s.audit.byTurn('t1')[0].data, { a: 1 });
  assert.deepEqual(s.audit.byChat('c', 2).map((r) => r.type), ['error', 'gate']);
  s.audit.prune(at(1));
  assert.equal(s.audit.byChat('c', 10).length, 2);
});

test('messages', () => {
  const s = openStore();
  for (let i = 0; i < 4; i++) s.messages.add({ chat_id: 'c', speaker: 'khach', text: `m${i}`, at: at(i) });
  s.messages.add({ chat_id: 'd', speaker: 'bot', text: 'x', outbox_id: 1, at: T });
  assert.deepEqual(s.messages.recent('c', 2).map((r) => r.text), ['m2', 'm3']); // oldest -> newest
  assert.equal(s.messages.deleteChat('c'), 4);
  assert.equal(s.messages.recent('c', 5).length, 0);
  assert.equal(s.messages.recent('d', 5).length, 1);
});

test('messages.lastPersonAt: mốc tin cuối của người, bỏ tin bot (T022)', () => {
  const s = openStore();
  assert.equal(s.messages.lastPersonAt('c'), null);
  s.messages.add({ chat_id: 'c', speaker: 'khach', text: 'hỏi', at: at(0) });
  assert.equal(s.messages.lastPersonAt('c'), at(0));
  s.messages.add({ chat_id: 'c', speaker: 'nhan-vien', speaker_id: 'nv1', text: 'dạ', at: at(2) });
  assert.equal(s.messages.lastPersonAt('c'), at(2));
  s.messages.add({ chat_id: 'c', speaker: 'bot', text: 'bot nói sau', at: at(5) });
  assert.equal(s.messages.lastPersonAt('c'), at(2)); // tin bot không phá khoảng lặng
  s.messages.add({ chat_id: 'c2', speaker: 'khach', text: 'phòng khác', at: at(9) });
  assert.equal(s.messages.lastPersonAt('c'), at(2)); // theo conv_id, không lẫn phòng khác
});

test('customers', () => {
  const s = openStore();
  assert.equal(s.customers.get('c'), null);
  s.customers.upsert('c', { chat_id: 'c', display_name: 'An', labels: [{ nhan: 'tra-cuu-hs', nguon: 'auto', at: T }] }, T);
  let c = s.customers.get('c');
  assert.equal(c.conv_id, 'c');
  assert.equal(c.chat_id, 'c');
  assert.equal(c.display_name, 'An');
  assert.deepEqual(c.interests, []);
  assert.equal(c.labels[0].nhan, 'tra-cuu-hs');
  assert.equal(c.first_seen_at, T);
  assert.equal(c.turns, 0);
  s.customers.upsert('c', { phone: '0912345678', interests: [{ mon: 'bơm' }], turns: 3 }, at(5));
  c = s.customers.get('c');
  assert.equal(c.phone, '0912345678');
  assert.equal(c.display_name, 'An'); // untouched
  assert.equal(c.chat_id, 'c'); // untouched
  assert.equal(c.labels.length, 1);
  assert.deepEqual(c.interests, [{ mon: 'bơm' }]);
  assert.equal(c.first_seen_at, T);
  assert.equal(c.last_seen_at, at(5));
  s.customers.deleteChat('c');
  assert.equal(s.customers.get('c'), null);
});

test('outbox.countSentChat: đếm theo chat_id (cả nhóm, không tách người)', () => {
  const s = openStore();
  s.outbox.insert(ob({ idem_key: 'kA', conv_id: 'g1:A', chat_id: 'g1', status: 'sent', sent_at: at(1) }));
  s.outbox.insert(ob({ idem_key: 'kB', conv_id: 'g1:B', chat_id: 'g1', status: 'sent', sent_at: at(2) }));
  assert.equal(s.outbox.countSent('g1:A', T), 1);
  assert.equal(s.outbox.countSent('g1:B', T), 1);
  assert.equal(s.outbox.countSentChat('g1', T), 2);
});

test('tx commit / rollback / returns value', () => {
  const s = openStore();
  assert.equal(s.tx(() => { s.meta.set('a', '1'); return 7; }), 7);
  assert.throws(() => s.tx(() => { s.meta.set('b', '2'); throw new Error('x'); }), /x/);
  assert.equal(s.meta.get('a'), '1');
  assert.equal(s.meta.get('b'), null);
});

test('jobs.openFor: waiting, or done within window', () => {
  const s = openStore();
  const j = { chat_id: 'c', session_key: 'c', pack: 'hs', ma_luot: 'L1', result_tool: 't', status: 'waiting', next_poll_at: at(1), expires_at: at(30), created_at: T };
  const id = s.jobs.add(j);
  assert.equal(s.jobs.openFor('c', at(-10)), true);
  assert.equal(s.jobs.openFor('other', at(-10)), false);
  s.jobs.update(id, { status: 'done', done_at: at(2) });
  assert.equal(s.jobs.openFor('c', at(1)), true);
  assert.equal(s.jobs.openFor('c', at(3)), false);
  s.jobs.update(id, { status: 'expired' });
  assert.equal(s.jobs.openFor('c', at(1)), false);
});

test('outbox.get', () => {
  const s = openStore();
  const id = s.outbox.insert(ob());
  assert.equal(s.outbox.get(id).idem_key, 'r:c:m1:0');
  assert.equal(s.outbox.get(999), null);
});
