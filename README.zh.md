# dsh-power

DeepSeek Harness Web 界面的**悬浮电源按钮组**：在页面里**一键重启或优雅关闭** `dsh web` 宿主进程——不用开终端、不用翻设置页、不夹带任何会话管理功能。

[English](./README.md)

## 功能

- **右下角悬浮电源按钮组**（挂载在 shell overlay，跟随主题明暗）：重启按钮在电源按钮正上方，共用同一套视觉语言与确认流程。
- **点击 → 确认 → 执行**：两个按钮各自弹出 dsh 原生 Modal（取消 / 确认）。关闭时宿主 dispose 根 fiber（会话日志落盘）再干净退出，带硬超时兜底；重启时先交接给一个 detached 助手进程——等端口真正释放、用**完全相同的启动参数**（同 argv、同 cwd）拉起新宿主、确认端口被绑定、失败时把诊断写进 tmpdir 日志——页面同时轮询 `/dsh-power/health`，服务恢复后自动刷新。
- 所有进程控制路由带**同源回环守卫**（与 dshmarket `trustedRestartRequest` 同一纪律）：仅回环地址、拒绝转发链头、`Origin` 必须与 `Host` 同源。任意外网网页都无法重启或关掉你本地的 dsh。
- **零运行时依赖**——host 半部只用 `node:` 内建模块；client 半部只依赖 `react` 和宿主注入的 ui-primitives。
- 中英双语，遵循 DSH client locale 约定。

## 环境要求

- DeepSeek Harness `dsh` ≥ 0.1.0-rc.6（`web` profile）。
- Node.js ≥ 20。

## 安装

```sh
dsh plugin --profile web add dsh-power
```

或从本地目录 link 安装：

```sh
dsh plugin --profile web add link:/path/to/dsh-power
```

重启 `dsh web`，页面右下角即出现电源按钮组。

## 使用

- **重启**：点 ⟳ 按钮，确认后等待——弹窗显示进度，服务恢复后页面自动刷新。
- **关闭**：点 ⏻ 按钮，确认后服务优雅退出；用 `dsh web`（或你的启动器）重新拉起。

## 实现原理

浏览器没有操作系统权限，杀不掉进程——所以是**服务器对自己动手**：页面 POST 到带守卫的路由，宿主先把响应发出去（页面才能显示结果），再执行善后：

```
浏览器                          dsh 服务(Node)                     助手进程(detached)
  │  POST /dsh-power/restart         │                                   │
  ├─────────────────────────────────>│  守卫：回环 + 同源                 │
  │  200 {restarting: true}          │                                   │
  │<─────────────────────────────────│                                   │
  │                                  │ spawn -e 助手, unref               │
  │                                  │ 等 restartDelayMs（响应已发出）     │
  │                                  │ dispose 根 fiber → 日志落盘        │
  │                                  │ process.exit(0)  ✝                │
  │  GET /dsh-power/health（轮询）    │                                   │
  │  ×  连接被拒绝                    │                                   │
  │                                  │              等待端口真正释放      │
  │                                  │              以相同 argv 拉起新宿主 │
  │                                  │              确认端口已绑定        │
  │  ✓  health 200 → 自动刷新        │                                   │
```

关闭流程相同，只是没有助手进程：响应 → 延迟 → dispose 根 fiber → 退出。

## 路由

| 方法 | 路径                      | 效果                                       |
| ---- | ------------------------- | ------------------------------------------ |
| POST | `/dsh-power/restart`      | `{restarting: true}` → 脱离式重启后退出    |
| POST | `/dsh-power/shutdown`     | `{shuttingDown: true}` → 优雅退出          |
| GET  | `/dsh-power/health`       | `{ok: true}`（页面轮询的存活探针）         |

方法不匹配返回 `405`；未通过回环/同源守卫返回 `403`；被禁用的重启同样返回 `403`。

## 配置

`cordis.patch.yml` 中的行配置（以下为默认值）：

```yaml
config:
  shutdownDelayMs: 1000   # 关闭：响应发出后到优雅退出的延迟
  restartDelayMs: 1000    # 重启：响应发出后到助手交接 + 退出的延迟
  allowRestart: true      # systemd/launchd/pm2 托管时设为 false——重启归守护进程管
```

## 许可

[MIT](./LICENSE)
