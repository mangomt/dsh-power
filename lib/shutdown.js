/**
 * Process lifecycle for dsh-power: the graceful host teardown shared by the
 * shutdown and restart routes.
 *
 * The teardown disposes the root fiber (which flushes session logs) and then
 * exits; a hard timer backs up a dispose that hangs, so the page's
 * "shutting down" promise is never silently broken.
 */

/**
 * Dispose the root fiber (flushing session logs), then exit the process.
 * A hard timer backs up a dispose that hangs. Deliberately the ONLY place
 * that calls process.exit — every lifecycle route funnels through here so
 * there is exactly one teardown discipline to reason about.
 * @param {unknown} ctx - any host context (root is resolved internally).
 */
export function disposeRootAndExit(ctx) {
	const root = ctx.root ?? ctx;
	const disposed = root.fiber?.dispose?.();
	Promise.resolve(disposed).catch(() => void 0).finally(() => process.exit(0));
	setTimeout(() => process.exit(0), 1500).unref();
}

/**
 * Graceful host exit: dispose the root fiber, then exit.
 * @param {unknown} ctx - any host context (root is resolved internally).
 * @param {number} delayMs - wait before starting the teardown (lets the HTTP
 *   response reach the browser).
 */
export function scheduleHostExit(ctx, delayMs) {
	setTimeout(() => disposeRootAndExit(ctx), delayMs);
}
