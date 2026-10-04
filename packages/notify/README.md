# @clang.engineer/pi-notify

Notification extension for Pi coding agent.

## Features

- Notifies on `agent_settled`.
- Notifies on `permissions:ask`.
- Backend: `auto`, `macos`, `linux`, `windows`, `terminal`, or `off`.
- Optional last-input summary in completion notification titles.
- Optional macOS notification sound.
- Optional minimum duration filter for completion notifications.
- Optional tmux bell/window alert.
- Optional script hook.

## Install

```sh
pi install npm:@clang.engineer/pi-notify
```

This package is discoverable by Pi package catalogs through the npm `pi-package` keyword. Pi loads the extension declared in `package.json` under `pi.extensions`.

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
    "minDurationSeconds": 0,
    "tmuxBell": true,
    "permissionAsk": true,
    "permissionMessage": "Permission required: {tool}",
    "backend": "auto",
    "skipWhenFrontmost": false,
    "sound": "Glass"
  }
}
```

Set `sound` to a macOS sound name such as `Glass`, `Ping`, or `Submarine`. Set it to `false` to disable sound.

Backend notes:

- `macos`: AppleScript notification via `osascript`.
- `linux`: desktop notification via `notify-send`.
- `windows`: Windows toast via PowerShell.
- `terminal`: Kitty OSC 99 or OSC 777 terminal notification.

Set `minDurationSeconds` to skip completion notifications for short runs. Permission notifications are never duration-filtered.

Set `tmuxBell` to `true` to emit a terminal bell inside tmux. With tmux `monitor-bell` enabled, this marks/highlights the window that needs attention.
