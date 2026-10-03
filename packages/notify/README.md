# @clang-engineer/pi-notify

Notification extension for Pi coding agent.

## Features

- Notifies on `agent_settled`.
- Notifies on `permissions:ask`.
- Backend: `auto`, `macos`, `terminal`, or `off`.
- Optional last-input summary in completion notification titles.
- Optional macOS notification sound.
- Optional script hook.

## Config

Global: `~/.pi/agent/notify.json`  
Project: `<project>/.pi/notify.json`

```json
{
  "notify": {
    "title": "Pi",
    "settledMessage": "Agent 작업 완료",
    "includeInput": true,
    "maxInputLength": 80,
    "permissionAsk": true,
    "permissionMessage": "Permission required: {tool}",
    "backend": "auto",
    "skipWhenFrontmost": false,
    "sound": "Glass"
  }
}
```

Set `sound` to a macOS sound name such as `Glass`, `Ping`, or `Submarine`. Set it to `false` to disable sound.
