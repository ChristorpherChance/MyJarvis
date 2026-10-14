import test from 'node:test';
import assert from 'node:assert/strict';
import {executionOutcomeNote} from '../apps/web/src/features/operations/execution-outcome-note.ts';

test('only a signed successful process is described as finished, without claiming acceptance', () => {
  const note = executionOutcomeNote({status: 'succeeded', result: {outcome: 'success'}});
  assert.match(note.text, /已结束/);
  assert.match(note.text, /仍需独立验收/);
});

test('terminal failures never receive the former unconditional success notice', () => {
  for (const status of ['timeout', 'failed', 'cancelled', 'round-limit', 'awaiting-cost', 'budget-exhausted']) {
    const note = executionOutcomeNote({status, result: {outcome: 'success'}});
    assert.equal(note.tone, 'warn', status);
    assert.doesNotMatch(note.text, /进程成功|执行已结束|已通过|已交付/, status);
  }
});

test('queued, running and unknown observations do not claim completion', () => {
  assert.match(executionOutcomeNote({status: 'queued'}).text, /尚未开始/);
  assert.match(executionOutcomeNote({status: 'running'}).text, /正在执行/);
  assert.match(executionOutcomeNote({status: 'future-state'}).text, /待核对/);
  assert.match(executionOutcomeNote({}).text, /不能作为交付通过/);
});

test('timeout describes preservation and verification without promising automatic recovery', () => {
  const note = executionOutcomeNote({status: 'timeout'});
  assert.match(note.text, /产物和记录保留/);
  assert.match(note.text, /需复验后/);
  assert.doesNotMatch(note.text, /正在修复|自动恢复|20分钟/);
});
