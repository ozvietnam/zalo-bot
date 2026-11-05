import { test } from 'node:test';
import assert from 'node:assert/strict';

test('node:sqlite có sẵn và ghi được', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('create table t(a)');
  db.prepare('insert into t values (?)').run(1);
  assert.equal(db.prepare('select count(*) c from t').get().c, 1);
  db.close();
});
