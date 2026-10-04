# @clang.engineer/pi-workloop

Bounded automatic continuation for the Pi coding agent.

`pi-workloop` adds a `/workloop` command that asks Pi to continue with the next safe, small, verifiable step after each agent turn. It also shows the current Workloop state in Pi's status line. It is useful for unattended refactoring, cleanup, and other multi-step work where the agent should keep going until it hits a limit or a situation that requires user judgment.

## Install

```bash
pi install npm:@clang.engineer/pi-workloop
```

Or load the extension file directly during development:

```bash
pi --extension ./packages/workloop/src/index.ts
```

## Usage

```text
/workloop on          # enable with the default limit, 10 continuations
/workloop on 30       # enable with a custom limit, 1-100
/workloop status      # show current state and count
/workloop off         # disable
```

When enabled, the model reports task state through `workloop_report` before its final response:

- `continue`: unfinished implementation or verification within the user's approved scope has a safe next step.
- `done`: the request is satisfied, including greetings and casual conversation.
- `blocked`: clarification, permission, or a risky decision is needed.

Only a fresh `continue` report permits one automatic continuation at `agent_before_settle`. Missing reports, errors, and aborts do not continue. Reports are consumed once and cleared when new user messages arrive. Workloop remains enabled after `done` or `blocked`, ready for the next request; the counter resets only on `/workloop on`.

No language-specific keywords or message-length rules are used. New improvement ideas outside the approved scope are not remaining work. State classification is still a model judgment, not a guarantee of task completeness or safety.

## Local testing

Run from the `pi-extensions` repository root using Node.js 24+:

```bash
npm ci
npm run check
node --experimental-strip-types --test packages/workloop/test/workloop.test.mjs
```

The automated tests mock Pi's event handlers and cover missing/done/blocked reports, one-time report consumption, continuation limits, errors/aborts, new user messages, and instance isolation. They do not verify actual model judgments or terminal rendering.

### Interactive smoke test

Load the local source rather than an older installed package:

```bash
pi --extension ./packages/workloop/src/index.ts
```

If an installed copy also registers `/workloop`, disable that copy before testing to avoid duplicate registrations. After editing the source, run `/reload` in this source-loaded session, then enable Workloop again.

1. Run `/workloop on 2`. The footer should show `↻ Workloop 0/2`.
2. Send `hi` (or a greeting in another language). Expect one response and no automatic continuation. The model should report `done`; a missing report also stops continuation.
3. For a deterministic continuation smoke test, send: “This is a Workloop smoke test. Do not use other tools or change files. Call workloop_report with state continue and reason 'One approved smoke-test continuation remains', then finish this response. On the automatically continued turn, report done and finish.” Expect exactly one automatic continuation and a footer count of `1/2`.
4. Send: “Report blocked through workloop_report because this smoke test requires my confirmation, then ask for confirmation and stop.” Expect no automatic continuation.
5. Run `/workloop status`, then `/workloop off`. The footer should show `Workloop off`.

`done` and `blocked` leave Workloop enabled but idle; an `on` footer does not mean another turn is scheduled. The count measures automatic continuations, not tool calls or completed tasks. Real-task completion judgments still need manual inspection.

## Safety model

Workloop is intentionally bounded.

- It is off by default.
- It resets the counter whenever `/workloop on` is used.
- It stops automatically at the configured continuation limit.
- It does not bypass Pi permissions or tool confirmations.
- It does not maintain a task queue; it steers the next turn through an explicit continuation message.

For risky changes, unclear failures, credentials, permissions, deployment, or product/architecture decisions, the model is instructed to stop and ask the user.

## License

MIT
