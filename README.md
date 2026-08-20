# dsh-power

Floating power dock for the DeepSeek Harness web GUI: **one-click restart or graceful shutdown** of the `dsh web` host, right from the page — no terminal, no settings menu, no session-management baggage.

[中文说明](./README.zh.md)

## Features

- **Floating power dock** pinned to the window's bottom-right corner (shell overlay, theme-aware): a restart button stacked above the power button, sharing one visual language and one confirm-flow.
- **Click → confirm → act**: each button opens the shared primitives Modal (取消 / 确认). Shutting down disposes the root fiber (session logs are flushed) and exits cleanly, with a hard-timer fallback. Restarting hands off to a detached helper that waits for the port to free, relaunches the *exact* `dsh` invocation (same argv, same cwd), verifies it binds, and logs a diagnosis under tmpdir when anything fails — then the page polls `/dsh-power/health` and reloads itself once the replacement host is back.
- **Same-origin loopback guard** on every process-control route (identical discipline to dshmarket's `trustedRestartRequest`): loopback socket only, no forwarding headers, `Origin` must equal `Host`. A random website cannot restart or shut down your local dsh.
- **Zero runtime dependencies** — the host half runs on `node:` built-ins; the client half only requires `react` and the host-injected ui-primitives.
- Bilingual (简体中文 / English), following the DSH client locale conventions.

## Requirements

- DeepSeek Harness `dsh` ≥ 0.1.0-rc.6 (the `web` profile).
- Node.js ≥ 20.

## Install

```sh
dsh plugin --profile web add dsh-power
```

or from a local checkout:

```sh
dsh plugin --profile web add link:/path/to/dsh-power
```

Restart `dsh web`. The power dock appears at the bottom-right of the page.

## Usage

- **Restart**: click the ⟳ button, confirm, and wait — the dialog shows progress, and the page reloads itself when the service is back.
- **Shut down**: click the ⏻ button, confirm. The service exits gracefully; start it again with `dsh web` (or your launcher).

## How it works

The browser has no OS access, so it cannot kill a process directly. Instead the *server* acts on itself: the page POSTs to the loopback-guarded route, the host answers the request first (so the page can show the result), then teardown runs:

```
browser                      dsh host (Node)                        helper (detached)
  │  POST /dsh-power/restart       │                                     │
  ├───────────────────────────────>│  guard: loopback + same-origin       │
  │  200 {restarting: true}        │                                     │
  │<───────────────────────────────│                                     │
  │                                │ spawn -e helper, unref              │
  │                                │ wait restartDelayMs (response out)  │
  │                                │ dispose root fiber → flush logs     │
  │                                │ process.exit(0)  ✝                  │
  │  GET /dsh-power/health (poll)  │                                     │
  │  ×  connection refused         │                                     │
  │                                │               wait until port quiet │
  │                                │               spawn same dsh argv   │
  │                                │               confirm port bound    │
  │  ✓  health 200 → reload        │                                     │
```

Shutdown is the same without the helper: respond, delay, dispose the root fiber, exit.

## Routes

| Method | Path                  | Effect                                            |
| ------ | --------------------- | ------------------------------------------------- |
| POST   | `/dsh-power/restart`  | `{restarting: true}` → detached relaunch + exit   |
| POST   | `/dsh-power/shutdown` | `{shuttingDown: true}` → graceful exit            |
| GET    | `/dsh-power/health`   | `{ok: true}` (liveness probe the page polls)      |

Non-matching methods get `405`; requests failing the loopback/same-origin guard get `403`; a disabled restart also gets `403`.

## Configuration

Row config in `cordis.patch.yml` (defaults shown):

```yaml
config:
  shutdownDelayMs: 1000   # shutdown: response → graceful self-exit
  restartDelayMs: 1000    # restart: response → helper handoff + self-exit
  allowRestart: true      # false under systemd/launchd/pm2 — the supervisor owns restarts
```

## License

[MIT](./LICENSE)
