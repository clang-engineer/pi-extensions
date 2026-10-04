import { test } from 'node:test';
import assert from 'node:assert/strict';
import extension from '../src/index.ts';

function setup() {
  const handlers = {};
  let command, tool;
  extension({
    on: (name, handler) => { handlers[name] = handler; },
    registerCommand: (_name, definition) => { command = definition; },
    registerTool: (definition) => { tool = definition; },
  });
  const ctx = { ui: { theme: { fg: (_color, text) => text }, setStatus() {}, notify() {} } };
  return {
    handlers,
    on: (limit = 2) => command.handler(`on ${limit}`, ctx),
    report: (state) => tool.execute('id', { state, reason: 'Approved verification step' }),
    settle: (outcome = 'completed', canContinue = true) => handlers.agent_before_settle({ entries: [], outcome, context: { canContinue } }, ctx),
  };
}

test('missing, done, and blocked reports never continue', async () => {
  const loop = setup();
  await loop.on();
  assert.equal(loop.settle(), undefined);
  for (const state of ['done', 'blocked']) {
    await loop.report(state);
    assert.equal(loop.settle(), undefined);
  }
});

test('continue is consumed once and bounded by the limit', async () => {
  const loop = setup();
  await loop.on(1);
  await loop.report('continue');
  assert.equal(loop.settle().continue, true);
  assert.equal(loop.settle(), undefined);
  await loop.report('continue');
  assert.equal(loop.settle().continue, undefined);
});

test('errors, aborts, and unavailable continuation do not continue', async () => {
  const loop = setup();
  await loop.on();
  for (const outcome of ['error', 'aborted']) {
    await loop.report('continue');
    assert.equal(loop.settle(outcome), undefined);
    assert.equal(loop.settle(), undefined);
  }
  await loop.report('continue');
  assert.equal(loop.settle('completed', false), undefined);
});

test('new user messages invalidate old reports regardless of language', async () => {
  const loop = setup();
  await loop.on();
  for (const text of ['hi', '안녕', 'bonjour', 'こんにちは']) {
    await loop.report('continue');
    loop.handlers.message_start({ message: { role: 'user', content: text } });
    assert.equal(loop.settle(), undefined);
  }
});

test('extension instances do not share enablement or reports', async () => {
  const first = setup();
  const second = setup();
  await first.on();
  await first.report('continue');
  assert.equal(second.settle(), undefined);
  assert.equal(first.settle().continue, true);
});
