/**
 * Self-restart for dsh-power: relaunch the exact DSH invocation that booted
 * this host, so the page comes back without the user touching a terminal.
 *
 * The discipline is ported from dshmarket's battle-tested restart machinery
 * (restart.js + dsh-cli.js, #14/#40/#177): a detached helper process outlives
 * us, waits for our port to actually go quiet, spawns the replacement with
 * the same argv/cwd, verifies it binds, and writes a diagnosis to tmpdir
 * when anything fails — a restart that dies silently is the worst failure
 * mode because the process that would have logged it is the one that exited.
 *
 * Safety model (shared with the shutdown route): only a same-origin loopback
 * request reaches this code at all, and `allowRestart: false` disables the
 * whole feature for supervised deployments (systemd/launchd/pm2 own restarts
 * there — spawning a replacement would double-bind the port).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { disposeRootAndExit } from "./shutdown.js";

/** The Node binary running this process (argv0 when it is a real path). */
function nodeExecutable() {
	if (isAbsolute(process.argv0) && existsSync(process.argv0)) return process.argv0;
	return process.execPath;
}

/**
 * The exact boot invocation to replay: entry-point launches (`dsh` bin path,
 * bin.js/bin.ts) relaunch through Node with the same execArgv and cwd beside
 * the entry (so source launches stay importable); anything else falls back to
 * the bare `dsh` word with this process's CLI arguments.
 */
function dshLaunch() {
	const entry = process.argv[1];
	if (entry !== void 0 && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
		// Absolute paths are required: a source launch (`pnpm dsh`) passes a
		// relative entry, which a child would resolve against its OWN cwd.
		const abs = resolve(entry);
		return { file: nodeExecutable(), args: [...process.execArgv, abs], cwd: dirname(abs), viaShell: false };
	}
	// Bare `dsh` is a .cmd shim on Windows that only a shell can start.
	return { file: "dsh", args: [], cwd: void 0, viaShell: process.platform === "win32" };
}

/** The launch the replacement replays: same entry, same CLI args, same cwd. */
function restartLaunch() {
	const launch = dshLaunch();
	return {
		...launch,
		args: [...launch.args, ...process.argv.slice(2)],
		cwd: launch.cwd ?? process.cwd()
	};
}

/** The port this process is serving on, read off the validated request. */
export function servingPort(request) {
	const host = request.headers.host;
	if (host === void 0) return null;
	const match = /:(\d{1,5})$/u.exec(host);
	if (match === null) return null;
	const port = Number(match[1]);
	return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

/**
 * Platform-correct spawn shape for the replacement. POSIX keeps the plain
 * detached spawn; on Windows `detached` maps to DETACHED_PROCESS — the new
 * host gets NO console and every console child it later spawns pops a
 * visible node window — so the launch is wrapped in a hidden PowerShell.
 */
function respawnInvocation(launch, platform = process.platform) {
	if (platform !== "win32") {
		return { file: launch.file, args: launch.args, viaShell: launch.viaShell, detached: true };
	}
	const quote = (part) => `'${part.replace(/'/g, "''")}'`;
	return {
		file: "powershell.exe",
		args: ["-NoProfile", "-WindowStyle", "Hidden", "-Command", [`& ${quote(launch.file)}`, ...launch.args.map(quote)].join(" ")],
		viaShell: false,
		detached: false
	};
}

/**
 * Source of the detached helper that outlives this process and brings the
 * replacement up. Written for `node -e`; everything is JSON-stringified in,
 * so argv is safe by construction.
 *
 * What it fixes (dshmarket #177): a flat sleep is not "the port is free" —
 * the old process can exit while the socket lingers, and the replacement
 * dies instantly with EADDRINUSE and nothing written anywhere. So the helper
 * waits for the port to actually go quiet, starts, then CHECKS that
 * something bound it, and appends a diagnosis when it did not.
 * @param {{file: string, args: string[], viaShell: boolean, detached: boolean}} spawned
 * @param {{cwd: string}} launch
 * @param {{out: string, err: string}} logs
 * @param {number | null} port
 */
export function restartHelperSource(spawned, launch, logs, port) {
	return [
		"const { spawn } = require('node:child_process')",
		"const fs = require('node:fs')",
		"const net = require('node:net')",
		`const file = ${JSON.stringify(spawned.file)}`,
		`const args = ${JSON.stringify(spawned.args)}`,
		`const cwd = ${JSON.stringify(launch.cwd)}`,
		`const viaShell = ${JSON.stringify(spawned.viaShell)}`,
		`const detached = ${JSON.stringify(spawned.detached)}`,
		`const logOut = ${JSON.stringify(logs.out)}`,
		`const logErr = ${JSON.stringify(logs.err)}`,
		`const port = ${JSON.stringify(port)}`,
		"const sleep = (ms) => new Promise(r => setTimeout(r, ms))",
		"const note = (line) => { try { fs.appendFileSync(logErr, `[dsh-power] ${line}\\n`) } catch {} }",
		// "Free" means nothing accepts a connection. Checked by connecting rather
		// than by binding: binding to test would itself hold the port for the
		// moment the replacement needs it.
		"const listening = () => new Promise((resolve) => {",
		"  const probe = net.connect({ host: '127.0.0.1', port })",
		"  const done = (value) => { probe.destroy(); resolve(value) }",
		"  probe.on('connect', () => done(true))",
		"  probe.on('error', () => done(false))",
		"  setTimeout(() => done(false), 500)",
		"})",
		"const main = async () => {",
		"  if (port) {",
		"    const until = Date.now() + 30000",
		"    while (Date.now() < until && await listening()) await sleep(250)",
		"    if (await listening()) note(`port ${port} was still in use after 30s; starting anyway`)",
		"    // A released socket can still be in TIME_WAIT for a moment on Windows.",
		"    await sleep(300)",
		"  } else {",
		"    await sleep(1500)",
		"  }",
		"  let child",
		"  try {",
		"    const out = fs.openSync(logOut, 'a')",
		"    const err = fs.openSync(logErr, 'a')",
		"    child = spawn(file, args, { cwd, detached, stdio: ['ignore', out, err], env: process.env, shell: viaShell })",
		"    // spawn reports a missing or unexecutable file ASYNCHRONOUSLY; the",
		"    // try/catch above only covers the synchronous throw, so without this",
		"    // listener that failure is exactly as silent as the bug being fixed.",
		"    child.on('error', (error) => note(`could not start the replacement: ${error && error.message ? error.message : error}`))",
		"    child.unref()",
		"  } catch (error) {",
		"    note(`could not start the replacement: ${error && error.message ? error.message : error}`)",
		"    return",
		"  }",
		// Outliving the spawn matters on Windows: a helper that exits the
		// instant it has spawned can take the replacement with it, because the
		// child is in its process group and has not detached yet.
		"  if (!port) { await sleep(3000); return }",
		"  const upBy = Date.now() + 20000",
		"  while (Date.now() < upBy && !(await listening())) await sleep(500)",
		"  if (!(await listening())) note(`the replacement did not bind port ${port} within 20s — see the output log beside this one`)",
		"}",
		"main()"
	].join("\n");
}

/**
 * Relaunch this exact DSH entry after a detached handoff, then stop this
 * process. The helper outlives us (detached + unref), waits for our port to
 * be released before starting the replacement, and logs under tmpdir.
 * @param {unknown} ctx - any host context (root is resolved internally).
 * @param {number | null} port - the port this process serves on, so the
 *   helper waits for it rather than guessing at a delay.
 * @param {number} delayMs - wait before the teardown (lets the HTTP response
 *   reach the browser).
 */
export function scheduleHostRestart(ctx, port, delayMs) {
	const launch = restartLaunch();
	const spawned = respawnInvocation(launch);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const logs = {
		out: join(tmpdir(), `dsh-power-restart-${stamp}.out.log`),
		err: join(tmpdir(), `dsh-power-restart-${stamp}.err.log`)
	};
	const helper = spawn(nodeExecutable(), ["-e", restartHelperSource(spawned, launch, logs, port)], {
		detached: true,
		stdio: "ignore",
		env: process.env
	});
	helper.unref();
	setTimeout(() => disposeRootAndExit(ctx), delayMs);
	return { pid: process.pid, helperPid: helper.pid, logOut: logs.out, logErr: logs.err };
}
