import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDesktopStatus } from "@/lib/desktop";

// Bottom of the sidebar, in the desktop app: the addon isn't installed, so
// point to Settings → Addon. Dismissable for good (per computer), and not
// shown after the player uninstalled the addon on purpose.

const DISMISSED_KEY = "guildie:addon-notice-dismissed";

export function AddonNotice() {
	const status = useDesktopStatus();
	const [dismissed, setDismissed] = useState(true);
	useEffect(() => {
		try {
			setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
		} catch {
			setDismissed(false);
		}
	}, []);
	if (!status || status.addonVersion || status.addonManaged === false || dismissed) return null;
	const dismiss = () => {
		setDismissed(true);
		try {
			localStorage.setItem(DISMISSED_KEY, "1");
		} catch {}
	};
	return (
		<div className="relative mx-0.5 mb-2 rounded-md border border-border px-3 py-2.5 text-[0.8125rem]">
			<button
				type="button"
				aria-label="Dismiss"
				onClick={dismiss}
				className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
			>
				<HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.75} />
			</button>
			<p className="pr-5 font-medium">Addon not installed</p>
			<p className="mt-0.5 text-xs text-muted-foreground">
				It keeps your characters current as you play and adds guild hints to item tooltips.
			</p>
			<Link
				to="/settings/addon"
				className="mt-2 flex h-7 w-full items-center justify-center rounded-md border border-border text-xs font-medium hover:bg-hover"
			>
				Set up the addon
			</Link>
		</div>
	);
}
