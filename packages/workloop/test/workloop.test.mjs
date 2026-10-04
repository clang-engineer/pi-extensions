import { test } from 'node:test';
import assert from 'node:assert/strict';
import extension from '../src/index.ts';

function setup({ idle = true, onAbort = () => {} } = {}) {
  const handlers = {};
  let command;
  const statuses = [];
  extension({
    on: (name, handler) => { handlers[name] = handler; },
    registerCommand: (_name, definition) => { command = definition; },
    registerTool: () => assert.fail('Continuation must not depend on model reports'),
  });
  const ctx = { isIdle: () => idle, abort: onAbort, ui: {
    theme: { fg: (_color, text) => text },
    setStatus: (_key, text) => statuses.push(text), notify() {},
  } };
  return {
    statuses,
    start: () => handlers.session_start({}, ctx),
    off: () => command.handler('off', ctx),
    on: (limit = 2) => command.handler(`on ${limit}`, ctx),
    settle: (outcome = 'completed', entries = []) => handlers.agent_before_settle({ entries, outcome, context: { canContinue: false } }, ctx),
  };
}

test('disabled by default and reset on session start', async () => {
  const loop = setup();
  assert.equal(loop.settle(), undefined);
  await loop.on();
  await loop.start();
  assert.equal(loop.settle(), undefined);
  assert.equal(loop.statuses.at(-1), 'Workloop off');
});

test('continues without reports and supplies runnable context, preserving other entries', async () => {
  const loop = setup();
  await loop.on();
  const existing = { type: 'custom', customType: 'other', data: {} };
  const result = loop.settle('completed', [existing]);
  assert.equal(result.continue, true);
  assert.equal(result.entries[0], existing);
  assert.equal(result.entries[1].type, 'custom_message');
  assert.match(result.entries[1].content, /approved overall goal/);
  assert.equal(loop.statuses.at(-1), '↻ Workloop 1/2');
});

test('continuations stop at the limit and can be explicitly restarted', async () => {
  const loop = setup();
  await loop.on(2);
  assert.equal(loop.settle().continue, true);
  assert.equal(loop.settle().continue, true);
  const result = loop.settle();
  assert.equal(result.continue, undefined);
  assert.match(result.entries[0].content, /reached the continuation limit/);
  assert.equal(loop.settle(), undefined);
  await loop.on(1);
  assert.equal(loop.settle().continue, true);
});

test('errors and aborts disable the loop until explicitly enabled again', async () => {
  for (const outcome of ['error', 'aborted']) {
    const loop = setup();
    await loop.on();
    assert.equal(loop.settle(outcome), undefined);
    assert.equal(loop.settle(), undefined);
    assert.equal(loop.statuses.at(-1), 'Workloop off');
  }
});

test('off disables before aborting an active operation', async () => {
  let aborts = 0;
  const loop = setup({ idle: false, onAbort: () => {
    aborts++;
    assert.equal(loop.settle(), undefined);
  } });
  await loop.on();
  await loop.off();
  assert.equal(aborts, 1);
});

test('off is safe and repeatable while idle', async () => {
  const loop = setup({ onAbort: () => assert.fail('Must not abort idle session') });
  await loop.on();
  await loop.off();
  await loop.off();
  assert.equal(loop.settle(), undefined);
});

test('extension instances do not share enablement', async () => {
  const first = setup();
  const second = setup();
  await first.on();
  assert.equal(second.settle(), undefined);
  assert.equal(first.settle().continue, true);
});

test('invalid limits do not enable the loop', async () => {
  for (const value of ['0', '101', '1.5', '2oops']) {
    const loop = setup();
    await loop.on(value);
    assert.equal(loop.settle(), undefined);
  }
});
