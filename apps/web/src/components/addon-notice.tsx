import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type DesktopStatus, desktop, useDesktopStatus } from "@/lib/desktop";
import { compareVersions } from "@/lib/versions";

// Bottom of the sidebar, in the desktop app: at most one notice about the
// addon, below "Update ready" (an app update brings the addon with it, so
// nothing shows while one waits):
// - not installed: point to Settings → Addon (not after an on-purpose uninstall);
// - older than the app's copy (the automatic update didn't happen): update it;
// - installed, but the game last ran an older one: /reload in WoW. Clears by
//   itself once the game saves with the new version.
// Each can be dismissed; a dismissal holds for that notice and version only.

const DISMISSED_KEY = "guildie:addon-notice-dismissed";

type Notice =
	| { kind: "missing"; key: string }
	| { kind: "update"; key: string; version: string }
	| { kind: "reload"; key: string; version: string };

export function addonNotice(status: DesktopStatus | null): Notice | null {
	if (!status || status.updateReady) return null;
	const installed = status.addonVersion;
	if (!installed) return status.addonManaged === false ? null : { kind: "missing", key: "missing" };
	if (status.addonBundled && compareVersions(installed, status.addonBundled) < 0)
		return { kind: "update", key: `update:${status.addonBundled}`, version: status.addonBundled };
	const loaded = status.addonLoaded;
	if (loaded === null || (loaded && compareVersions(loaded, installed) < 0))
		return { kind: "reload", key: `reload:${installed}`, version: installed };
	return null;
}

export function AddonNotice() {
	const status = useDesktopStatus();
	const [dismissed, setDismissed] = useState<string | null>("loading");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		try {
			setDismissed(localStorage.getItem(DISMISSED_KEY));
		} catch {
			setDismissed(null);
		}
	}, []);
	const notice = addonNotice(status);
	if (!notice || dismissed === "loading" || dismissed === notice.key) return null;
	const dismiss = () => {
		setDismissed(notice.key);
		try {
			localStorage.setItem(DISMISSED_KEY, notice.key);
		} catch {}
	};
	const update = async () => {
		setBusy(true);
		setError(null);
		try {
			await desktop()?.addon?.install();
		} catch (e) {
			setError(
				e instanceof Error
					? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")
					: "That didn't work.",
			);
		} finally {
			setBusy(false);
		}
	};

	if (notice.kind === "missing")
		return (
			<Card title="Addon not installed" onDismiss={dismiss}>
				<p className="mt-0.5 text-xs text-muted-foreground">
					It keeps your characters current as you play and adds guild hints to item tooltips.
				</p>
				<Button size="sm" variant="outline" className="mt-2 w-full text-xs" render={<Link to="/settings/addon" />}>
					Set up the addon
				</Button>
			</Card>
		);
	if (notice.kind === "update")
		return (
			<Card title="Addon update" onDismiss={dismiss}>
				<p className="mt-0.5 text-xs text-muted-foreground">
					Guildie addon <span className="num">{notice.version}</span> is ready to install.
				</p>
				<Button size="sm" disabled={busy} onClick={update} className="mt-2 w-full text-xs">
					{busy ? "Updating…" : "Update addon"}
				</Button>
				{error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
			</Card>
		);
	return (
		<Card title="Reload WoW" onDismiss={dismiss}>
			<p className="mt-0.5 text-xs text-muted-foreground">
				Guildie addon <span className="num">{notice.version}</span> is installed. Type{" "}
				<span className="font-mono text-foreground">/reload</span> in WoW to load it, or it loads the next time you
				start the game.
			</p>
		</Card>
	);
}

function Card({ title, onDismiss, children }: { title: string; onDismiss: () => void; children: ReactNode }) {
	return (
		<div className="surface-card mx-0.5 mb-2 px-3 py-2.5 text-[0.8125rem]">
			<button
				type="button"
				aria-label="Dismiss"
				onClick={onDismiss}
				className="absolute top-1.5 right-1.5 z-3 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground pointer-coarse:size-9"
			>
				<HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.75} />
			</button>
			<p className="pr-5 font-medium">{title}</p>
			{children}
		</div>
	);
}
