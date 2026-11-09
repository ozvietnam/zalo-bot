// test/core/eval-messenger-echo.test.mjs — Kiểm thử kịch bản eval echo Messenger & bot im (T507, Điều II, SC-002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEvalFixture } from '../../eval/run.mjs';

test('T507: Kịch bản eval messenger-human-echo đạt 100% (bot im khi người gõ)', async () => {
  const result = await runEvalFixture('eval/fixtures/messenger-human-echo.jsonl');
  assert.equal(result.ok, true, result.why || 'kịch bản eval phải đạt');
});
