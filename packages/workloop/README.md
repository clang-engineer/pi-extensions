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

## Release and update

Run from the `pi-extensions` repository root:

```bash
# 1. Validate the source.
npm run check
node --experimental-strip-types --test packages/workloop/test/workloop.test.mjs

# 2. Bump once per release (updates package.json and package-lock.json).
npm version patch --workspace @clang.engineer/pi-workloop --no-git-tag-version
npm pack --dry-run --workspace @clang.engineer/pi-workloop

# 3. The maintainer publishes from their terminal and completes npm authentication.
npm publish --workspace @clang.engineer/pi-workloop --access public

# 4. Confirm the published version before updating Pi.
npm view @clang.engineer/pi-workloop version --prefer-online
pi update npm:@clang.engineer/pi-workloop
```

If the installed copy remains old, reinstall:

```bash
pi install npm:@clang.engineer/pi-workloop
```

Use `pi list` to locate the installed package and check its `package.json` version.
For the default agent directory:

```bash
node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME + "/.pi/agent/npm/node_modules/@clang.engineer/pi-workloop/package.json", "utf8")).version'
```

Then run `/reload` in Pi or restart Pi, and enable `/workloop on` again.

- Local source edits are not published automatically. Restarting Pi or seeing
  `Updated` does not prove that a newer version was installed; compare versions.
- An `EOTP` error means npm authentication is required. Complete the publish
  flow in the maintainer's terminal; authentication alone is not proof of release.
- If npm reports an already staged version, resolve the existing publish approval
  flow rather than repeatedly publishing or bumping versions to bypass it.
- Review and commit the release version changes separately; the version command
  above does not create a Git commit or tag.

## Usage

```text
/workloop on          # enable with the default limit, 10 continuations
/workloop on 30       # enable with a custom limit, 1-100
/workloop status      # show current state and count
/workloop off         # disable automatic continuation and abort the active operation
```

`/workloop off` disables automatic continuation before requesting cancellation of any active agent operation. Cancellation does not roll back file edits, commits, or external side effects; tools must honor cancellation for prompt termination.

When enabled, every successfully completed run requests another turn at
`agent_before_settle`, up to the continuation limit. No `workloop_report` tool or
model completion classification is required. Errors and aborts disable the loop.

**Completion and clarification do not automatically stop the loop.** It may repeat
completion messages or questions until the limit is reached. Use `/workloop off`
when the goal is complete or user input is required. Start with a small limit.
Instructions constrain work to the approved overall goal, but are not a mechanical
safety gate; Workloop never grants new permissions or commit/deployment authority.

## Local testing

Run from the `pi-extensions` repository root using Node.js 24+:

```bash
npm ci
npm run check
node --experimental-strip-types --test packages/workloop/test/workloop.test.mjs
```

The automated tests mock Pi's event handlers and cover report-free continuation,
initially non-runnable context, entry preservation, limits, errors/aborts, stopping,
session reset, and instance isolation. They do not verify actual terminal rendering.

### Interactive smoke test

Load the local source rather than an older installed package:

```bash
pi --extension ./packages/workloop/src/index.ts
```

If an installed copy also registers `/workloop`, disable that copy before testing to avoid duplicate registrations. After editing the source, run `/reload` in this source-loaded session, then enable Workloop again.

1. Run `/workloop on 2`. The footer should show `↻ Workloop 0/2`.
2. Send: “This is a Workloop smoke test. Do not use tools or change files. Reply with one short sentence on each turn.”
3. Expect the initial response plus two automatic continuations, without any report tool calls.
4. Expect the continuation-limit message and an off footer after the second continuation.
5. Run `/workloop status`, then `/workloop off`. The footer should show `Workloop off`.
6. Enable Workloop again, start a harmless long response, and submit `/workloop off` while it is streaming. Expect cancellation of the active response and no Workloop continuation. Repeat `/workloop off` while idle; it should remain safely off.

The count measures automatic continuations, not tool calls or completed tasks.
A completed task or a question can still trigger another turn; stop manually when needed.

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
