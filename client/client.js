window.__ModuleLoader__.load({
	id: "dsh-power",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { createPortal } = require("react-dom");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region css
		const css = ".dpw-stack{position:fixed;right:20px;bottom:20px;z-index:300;display:flex;flex-direction:column;align-items:center;gap:10px}.dpw-fab{width:44px;height:44px;padding:0;border-radius:50%;border:1px solid var(--dsw-alias-border-l3,#d9dde3);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;display:grid;place-items:center;box-shadow:0 4px 10px #00000024,0 1px 3px #0000001a;transition:transform .15s,box-shadow .15s,color .15s,background .15s}.dpw-fab:hover{color:var(--dsw-alias-label-primary,#1f2328);transform:translateY(-2px);box-shadow:0 8px 18px #0000002e,0 3px 8px #00000021}.dpw-fab:active{transform:translateY(0);box-shadow:0 2px 6px #0000001f}.dpw-fab:focus{outline:none}.dpw-fab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:2px}.dpw-fab:disabled{opacity:.55;cursor:default}.dpw-spinning{animation:dpw-spin 1s linear infinite}@keyframes dpw-spin{to{transform:rotate(360deg)}}.dpw-danger{color:var(--dsw-alias-state-error-primary,#dc2626)}.dpw-notice{position:fixed;right:20px;bottom:128px;z-index:300;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:18px;box-shadow:0 12px 32px #0000003d}.dpw-noticeOk{color:var(--dsw-alias-state-success-primary,#16a34a);flex:none}.dpw-status{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:18px}.dpw-error{color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px;line-height:18px}";
		const tagId = "dsh-power/plugin.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-power";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const cssModule = {
			stack: "dpw-stack",
			fab: "dpw-fab",
			spinning: "dpw-spinning",
			danger: "dpw-danger",
			notice: "dpw-notice",
			noticeOk: "dpw-noticeOk",
			status: "dpw-status",
			error: "dpw-error"
		};
		//#endregion

		//#region locales
		const zh = {
			"fab.group.aria": "电源操作",
			"fab.restart.aria": "重启服务",
			"fab.restart.title": "重启服务",
			"fab.restart.desc": "确定要重启 dsh Web 服务吗？服务恢复后本页面会自动刷新。",
			"fab.restart.confirm": "重启",
			"fab.restart.pending": "正在重启…",
			"fab.restart.waiting": "服务恢复后将自动刷新页面…",
			"fab.restart.timeout": "重启超时，请手动刷新页面。",
			"fab.shutdown.aria": "关闭服务",
			"fab.shutdown.title": "关闭服务",
			"fab.shutdown.desc": "确定要关闭 dsh Web 服务吗？关闭后需重新运行 dsh web 才能恢复访问。",
			"fab.shutdown.confirm": "关闭服务",
			"fab.shutdown.pending": "正在关闭…",
			"fab.shutdown.note": "服务已关闭。",
			"fab.cancel": "取消",
			"fab.close": "关闭",
			"fab.failed": "操作失败：{message}"
		};
		const en = {
			"fab.group.aria": "Power actions",
			"fab.restart.aria": "Restart service",
			"fab.restart.title": "Restart service",
			"fab.restart.desc": "Restart the dsh web service? This page refreshes automatically once it is back.",
			"fab.restart.confirm": "Restart",
			"fab.restart.pending": "Restarting…",
			"fab.restart.waiting": "The page will refresh automatically once the service is back…",
			"fab.restart.timeout": "Restart timed out — refresh the page manually.",
			"fab.shutdown.aria": "Shut down service",
			"fab.shutdown.title": "Shut down service",
			"fab.shutdown.desc": "Shut down the dsh web service? You will need to run dsh web again to access it.",
			"fab.shutdown.confirm": "Shut down",
			"fab.shutdown.pending": "Shutting down…",
			"fab.shutdown.note": "The service has been shut down.",
			"fab.cancel": "Cancel",
			"fab.close": "Close",
			"fab.failed": "Operation failed: {message}"
		};
		//#endregion

		//#region component
		/** Restart poll cadence: probe the health route, then reload the page. */
		const RESTART_POLL_INTERVAL_MS = 1500;
		/** Restart poll deadline: after this the user gets a manual-refresh hint. */
		const RESTART_POLL_TIMEOUT_MS = 120000;
		/** Delay before the first health probe: the old host keeps answering the
		 *  route for the few hundred ms before its delayed exit lands, so an
		 *  immediate probe would reload the page against the dying server. */
		const RESTART_FIRST_PROBE_DELAY_MS = 4000;

		/** Inline power glyph: the ⏻ symbol as a 24px stroke path.
		 *  The arc is drawn on a true circle centred at (12,12) — the exact
		 *  centre of the button — so the glyph reads concentric with its
		 *  housing (the common Feather-icon variant drifts to (12,13) and
		 *  looks bottom-heavy in a round button). */
		function PowerGlyph() {
			return React.createElement("svg", {
				width: 18,
				height: 18,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true
			},
				React.createElement("path", { d: "M12 3.5v7.5" }),
				React.createElement("path", { d: "M18.364 5.636a9 9 0 1 1-12.728 0" })
			);
		}

		/** Inline restart glyph: the ⟳ symbol as a 24px stroke path (arc +
		 *  arrow head). Spins while a restart is in flight. */
		function RestartGlyph({ spinning }) {
			return React.createElement("svg", {
				width: 18,
				height: 18,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				className: spinning ? cssModule.spinning : void 0
			},
				React.createElement("path", { d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" }),
				React.createElement("path", { d: "M21 3v5h-5" })
			);
		}

		/** One power action: what it POSTs and how its dialog reads. */
		const MODES = Object.freeze({
			restart: {
				endpoint: "/dsh-power/restart",
				danger: false,
				Glyph: RestartGlyph
			},
			shutdown: {
				endpoint: "/dsh-power/shutdown",
				danger: true,
				Glyph: PowerGlyph
			}
		});

		/**
		 * Floating power dock (bottom-right): a vertical pair of round buttons —
		 * restart on top, shutdown below. Each click opens the shared primitives
		 * Modal for a second confirmation; the action then goes through the
		 * plugin's loopback-guarded HTTP route. A shutdown shows a success
		 * notice that auto-dismisses; a restart keeps polling the health route
		 * and reloads the page once the replacement host is back up.
		 */
		function PowerDock({ t }) {
			const [modal, setModal] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [error, setError] = React.useState(null);
			const [notice, setNotice] = React.useState(null);
			const [spinning, setSpinning] = React.useState(false);
			const noticeTimer = React.useRef(null);
			const pollTimer = React.useRef(null);
			const pollDeadline = React.useRef(null);
			const probeDelay = React.useRef(null);
			const clearNoticeTimer = () => {
				if (noticeTimer.current !== null) {
					clearTimeout(noticeTimer.current);
					noticeTimer.current = null;
				}
			};
			const stopPolling = () => {
				if (pollTimer.current !== null) {
					clearInterval(pollTimer.current);
					pollTimer.current = null;
				}
				if (pollDeadline.current !== null) {
					clearTimeout(pollDeadline.current);
					pollDeadline.current = null;
				}
				if (probeDelay.current !== null) {
					clearTimeout(probeDelay.current);
					probeDelay.current = null;
				}
			};
			React.useEffect(() => () => {
				clearNoticeTimer();
				stopPolling();
			}, []);
			// Fixture runs (plugin test harness) must not render floating chrome.
			if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fixture")) return null;

			const showNotice = (text, autoHideMs) => {
				clearNoticeTimer();
				setNotice(text);
				if (autoHideMs > 0) noticeTimer.current = setTimeout(() => setNotice(null), autoHideMs);
			};

			const pollHealth = (oldBootId) => {
				setSpinning(true);
				showNotice(t("fab.restart.waiting"), 0);
				pollDeadline.current = setTimeout(() => {
					stopPolling();
					setSpinning(false);
					setBusy(false);
					setModal(null);
					showNotice(t("fab.restart.timeout"), 10000);
				}, RESTART_POLL_TIMEOUT_MS);
				probeDelay.current = setTimeout(() => {
					pollTimer.current = setInterval(async () => {
						try {
							const response = await fetch("/dsh-power/health", { cache: "no-store" });
							if (!response.ok) return;
							const body = await response.json().catch(() => ({}));
							// Only a probe answered by a DIFFERENT boot id proves the
							// replacement host is up; the old one keeps answering until
							// its delayed exit lands. Without an anchor (older host),
							// any answer counts.
							if (oldBootId === null || body.bootId !== oldBootId) {
								stopPolling();
								window.location.reload();
							}
						} catch {
							// Host is down mid-restart — keep polling until the deadline.
						}
					}, RESTART_POLL_INTERVAL_MS);
				}, RESTART_FIRST_PROBE_DELAY_MS);
			};

			const run = async (mode) => {
				const meta = MODES[mode];
				setError(null);
				setNotice(null);
				setBusy(true);
				try {
					const response = await fetch(meta.endpoint, { method: "POST" });
					const body = await response.json().catch(() => ({}));
					if (!response.ok) {
						// The dialog stays open so the failure is visible in place.
						setError(t("fab.failed", { message: body.error || String(response.status) }));
						setBusy(false);
						return;
					}
					if (mode === "shutdown") {
						setBusy(false);
						setModal(null);
						showNotice(t("fab.shutdown.note"), 10000);
					} else {
						// Keep the dialog open ("restarting…") and the dock busy
						// while the replacement host comes up.
						pollHealth(typeof body.bootId === "string" ? body.bootId : null);
					}
				} catch (failure) {
					setError(t("fab.failed", { message: failure instanceof Error ? failure.message : String(failure) }));
					setBusy(false);
				}
			};

			const openModal = (mode) => {
				if (busy) return;
				setError(null);
				setModal(mode);
			};

			const meta = modal !== null ? MODES[modal] : null;
			return createPortal(
				React.createElement("div", { className: cssModule.stack, role: "group", "aria-label": t("fab.group.aria") },
					React.createElement("button", {
						className: cssModule.fab,
						"aria-label": t("fab.restart.aria"),
						"aria-haspopup": "dialog",
						title: t("fab.restart.title"),
						disabled: busy,
						onClick: () => openModal("restart")
					}, React.createElement(RestartGlyph, { spinning })),
					React.createElement("button", {
						className: cssModule.fab,
						"aria-label": t("fab.shutdown.aria"),
						"aria-haspopup": "dialog",
						title: t("fab.shutdown.title"),
						disabled: busy,
						onClick: () => openModal("shutdown")
					}, React.createElement(PowerGlyph)),
					notice !== null && React.createElement("div", { className: cssModule.notice, role: "status" },
						React.createElement("span", { className: cssModule.noticeOk }, "✓"),
						notice
					),
					React.createElement(primitives.Modal, {
						open: meta !== null,
						onClose: () => { if (!busy) setModal(null); },
						closeLabel: t("fab.close"),
						title: meta !== null ? t("fab." + modal + ".title") : "",
						description: meta !== null ? t("fab." + modal + ".desc") : "",
						footer: React.createElement(React.Fragment, null,
							React.createElement(primitives.Button, { variant: "outline", disabled: busy, onClick: () => setModal(null) }, t("fab.cancel")),
							React.createElement(primitives.Button, {
								variant: "outline",
								className: meta !== null && meta.danger ? cssModule.danger : void 0,
								disabled: busy,
								onClick: () => run(modal)
							}, t("fab." + modal + ".confirm"))
						),
						children: meta === null ? null : React.createElement(React.Fragment, null,
							busy && React.createElement("div", { className: cssModule.status, role: "status" }, t("fab." + modal + ".pending")),
							error !== null && React.createElement("div", { className: cssModule.error, role: "alert" }, error)
						)
					})
				),
				document.body
			);
		}
		//#endregion

		//#region entry
		const NS = "dsh-power";
		const name = "dsh-power";
		const inject = ["slots", "locale"];

		/**
		 * Register the floating power dock in the shell overlay slot.
		 * The primitives module is host-injected; when a required export is
		 * missing (older host), the dock silently disables itself instead of
		 * throwing and blanking the whole surface.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const gaps = ["Button", "Modal"].filter((key) => primitives[key] === void 0);
			if (gaps.length > 0) {
				console.warn("[dsh-power] host ui-primitives missing " + gaps.join(", ") + " — power dock disabled (dsh web >= 0.1.0-rc.6 required)");
				return;
			}
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-power: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-power",
				label: () => "dsh-power"
			}, () => React.createElement(PowerDock, { t })));
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
