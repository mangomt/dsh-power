/**
 * dsh-power host entry: mounts the shutdown/restart routes once the profile
 * composes the webServer service (reference pattern: dshmarket's apply()).
 *
 * The plugin is deliberately dependency-free: the whole host half runs on
 * node: built-ins, so it can never drag a version conflict into a profile.
 *
 * @module dsh-power
 */
import { mountRoute } from "./routes.js";

/** Stable Cordis plugin name. */
export const name = "dsh-power";

/**
 * Defaults mirrored in cordis.patch.yml. Row config (when present) wins.
 * @type {Readonly<{shutdownDelayMs: number, restartDelayMs: number, allowRestart: boolean}>}
 */
const DEFAULTS = Object.freeze({
	shutdownDelayMs: 1000,
	restartDelayMs: 1000,
	allowRestart: true
});

/**
 * Register the plugin against the host context.
 * @param ctx - Host context that may acquire the composed webServer service.
 * @param config - Optional profile override from the loader row.
 */
export function apply(ctx, config) {
	const settings = { ...DEFAULTS, ...(config ?? {}) };
	ctx.inject(["webServer"], (hostCtx) => {
		hostCtx.effect(() => mountRoute(hostCtx, settings), "dsh-power: http routes");
	});
}
