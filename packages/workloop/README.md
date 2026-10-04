# @clang.engineer/pi-workloop

Bounded automatic continuation for the Pi coding agent.

`pi-workloop` adds a `/workloop` command that asks Pi to continue with the next safe, small, verifiable step after each agent turn. It is useful for unattended refactoring, cleanup, and other multi-step work where the agent should keep going until it hits a limit or a situation that requires user judgment.

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

When enabled, the extension injects this continuation instruction at `agent_before_settle` and requests one more model turn:

> Continue with the next safe, small, verifiable step toward the current task. Do not ask the user unless product intent, architecture direction, risky changes, unexplained failures, credentials, permissions, or deployment decisions are required. Prefer verify → commit → continue when appropriate.

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
