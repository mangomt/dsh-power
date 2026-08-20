/**
 * Loopback-guarded HTTP surface for dsh-power.
 *
 *   POST /dsh-power/shutdown   → graceful host exit, no relauncher.
 *   POST /dsh-power/restart    → detached relaunch of this exact invocation.
 *   GET  /dsh-power/health     → liveness probe the page polls after restart.
 *
 * The guard mirrors dshmarket's trustedRestartRequest discipline: only a
 * same-origin request arriving on a loopback socket is accepted, so a random
 * website cannot reach into a local dsh instance and kill it.
 */
import { scheduleHostRestart, servingPort } from "./restart.js";
import { scheduleHostExit } from "./shutdown.js";

/**
 * Identifies this host process instance. The restart flow pins the page's
 * health polling to it: the old host keeps answering /dsh-power/health for
 * the few hundred ms before its delayed exit lands, and only a probe
 * answered by a DIFFERENT boot id proves the replacement is up.
 */
const BOOT_ID = `${process.pid}-${Date.now()}`;

/** Respond with a JSON payload (no-store; never sends after headers are out). */
function sendJson(response, status, payload) {
	if (response.headersSent) return;
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(payload));
}

/**
 * Same-origin loopback guard. Every branch is deliberate: an open socket
 * lets a local page through, a forwarded header betrays a proxy in front,
 * and an Origin that does not equal Host betrays a cross-origin caller.
 * @param {import("node:http").IncomingMessage} request
 * @returns {boolean}
 */
function trustedLoopback(request) {
	const address = request.socket?.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	if (request.headers.forwarded !== void 0
		|| request.headers["x-forwarded-for"] !== void 0
		|| request.headers["x-real-ip"] !== void 0) return false;
	const origin = request.headers.origin;
	const host = request.headers.host;
	if (origin === void 0 || host === void 0) return false;
	try {
		const parsed = new URL(origin);
		return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host === host;
	} catch {
		return false;
	}
}

/**
 * Mount the dsh-power routes and return their combined disposer.
 * @param {{webServer: {register: Function}, logger?: {warn: Function}}} ctx
 * @param {{shutdownDelayMs: number, restartDelayMs: number, allowRestart: boolean}} settings
 * @returns {() => void}
 */
export function mountRoute(ctx, settings) {
	const disposers = [
		ctx.webServer.register({
			kind: "exact",
			path: "/dsh-power/shutdown",
			handler: (request, response) => {
				if (request.method !== "POST") {
					sendJson(response, 405, { error: "method-not-allowed" });
					return;
				}
				if (!trustedLoopback(request)) {
					sendJson(response, 403, { error: "shutdown is limited to same-origin loopback requests" });
					return;
				}
				sendJson(response, 200, { shuttingDown: true });
				scheduleHostExit(ctx, settings.shutdownDelayMs);
			}
		}),
		ctx.webServer.register({
			kind: "exact",
			path: "/dsh-power/restart",
			handler: (request, response) => {
				if (request.method !== "POST") {
					sendJson(response, 405, { error: "method-not-allowed" });
					return;
				}
				if (!trustedLoopback(request)) {
					sendJson(response, 403, { error: "restart is limited to same-origin loopback requests" });
					return;
				}
				// Supervised deployments (systemd/launchd/pm2) own restarts; a
				// self-spawned replacement would double-bind the port there.
				if (settings.allowRestart === false) {
					sendJson(response, 403, { error: "restart is disabled by configuration (allowRestart: false)" });
					return;
				}
				sendJson(response, 200, { restarting: true, bootId: BOOT_ID });
				scheduleHostRestart(ctx, servingPort(request), settings.restartDelayMs);
			}
		}),
		ctx.webServer.register({
			kind: "exact",
			path: "/dsh-power/health",
			handler: (request, response) => {
				if (request.method !== "GET") {
					sendJson(response, 405, { error: "method-not-allowed" });
					return;
				}
				sendJson(response, 200, { ok: true, bootId: BOOT_ID });
			}
		})
	];
	return () => {
		for (const dispose of disposers) dispose();
	};
}
