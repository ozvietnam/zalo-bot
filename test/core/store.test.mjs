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

test('outbox.due: failed with NULL next_retry_at is due only while attempts < 3', () => {
  const s = openStore();
  s.outbox.insert(ob({ idem_key: 'n1', status: 'failed', attempts: 2 }));
  s.outbox.insert(ob({ idem_key: 'n2', status: 'failed', attempts: 3 }));
  assert.deepEqual(s.outbox.due(T).map((r) => r.idem_key), ['n1']);
});

test('tickets.open returns the existing open/claimed ticket; unique index enforces', () => {
  const s = openStore();
  const a = s.tickets.open('c', 'khach-xin-nguoi', T);
  const b = s.tickets.open('c', 'cap', at(1));
  assert.equal(a.id, b.id);
  assert.equal(s.tickets.list('open').length, 1);
  s.tickets.update(a.id, { status: 'claimed', claimed_by: 'u1' });
  assert.equal(s.tickets.open('c', 'cap', at(2)).id, a.id);
  s.tickets.update(a.id, { status: 'closed', closed_at: at(3) });
  const c = s.tickets.open('c', 'cap', at(4));
  assert.notEqual(c.id, a.id);
  assert.equal(s.tickets.open('d', 'cap', at(4)).chat_id, 'd');
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
  assert.deepEqual(s.outbox.recentBotTexts('c', T, 10), ['b', 'a']);
  assert.deepEqual(s.outbox.recentBotTexts('c', T, 1), ['b']);
  assert.deepEqual(s.outbox.recentBotTexts('c', at(1.5), 10), ['b']);
  assert.equal(s.outbox.countSent('c', T), 3);
  assert.equal(s.outbox.countSent(null, T), 4);
  assert.equal(s.outbox.countSent(null, at(3)), 2);
});

test('outbox.due', () => {
  const s = openStore();
  s.outbox.insert(ob({ idem_key: 'a', status: 'deferred', not_before: at(5) }));
  s.outbox.insert(ob({ idem_key: 'b', status: 'deferred', not_before: at(20) }));
  s.outbox.insert(ob({ idem_key: 'c', status: 'failed', attempts: 1, next_retry_at: at(5) }));
  s.outbox.insert(ob({ idem_key: 'd', status: 'failed', attempts: 3, next_retry_at: at(5) }));
  s.outbox.insert(ob({ idem_key: 'e', status: 'failed', attempts: 1, next_retry_at: at(50) }));
  s.outbox.insert(ob({ idem_key: 'f', status: 'queued' }));
  assert.deepEqual(s.outbox.due(at(10)).map((r) => r.idem_key).sort(), ['a', 'c']);
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
  s.jobs.update(id, { status: 'done', attempts: 2, done_at: at(2) });
  assert.equal(s.jobs.due(at(2)).length, 0);
  assert.throws(() => s.jobs.update(id, { 'status=1;--': 1 }), /column/i);
});

test('tickets', () => {
  const s = openStore();
  assert.equal(s.tickets.openFor('c'), null);
  const t = s.tickets.open('c', 'khach-xin-nguoi', T);
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

test('customers', () => {
  const s = openStore();
  assert.equal(s.customers.get('c'), null);
  s.customers.upsert('c', { display_name: 'An', labels: [{ nhan: 'tra-cuu-hs', nguon: 'auto', at: T }] }, T);
  let c = s.customers.get('c');
  assert.equal(c.display_name, 'An');
  assert.deepEqual(c.interests, []);
  assert.equal(c.labels[0].nhan, 'tra-cuu-hs');
  assert.equal(c.first_seen_at, T);
  assert.equal(c.turns, 0);
  s.customers.upsert('c', { phone: '0912345678', interests: [{ mon: 'bơm' }], turns: 3 }, at(5));
  c = s.customers.get('c');
  assert.equal(c.phone, '0912345678');
  assert.equal(c.display_name, 'An'); // untouched
  assert.equal(c.labels.length, 1);
  assert.deepEqual(c.interests, [{ mon: 'bơm' }]);
  assert.equal(c.first_seen_at, T);
  assert.equal(c.last_seen_at, at(5));
  s.customers.deleteChat('c');
  assert.equal(s.customers.get('c'), null);
});

test('tx commit / rollback / returns value', () => {
  const s = openStore();
  assert.equal(s.tx(() => { s.meta.set('a', '1'); return 7; }), 7);
  assert.throws(() => s.tx(() => { s.meta.set('b', '2'); throw new Error('x'); }), /x/);
  assert.equal(s.meta.get('a'), '1');
  assert.equal(s.meta.get('b'), null);
});
