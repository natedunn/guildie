import { useState } from "react";
import { Button } from "@/components/ui/button";
import { desktop, useDesktopStatus } from "@/lib/desktop";

// Bottom of the sidebar, in the desktop app: once an app update has
// downloaded (in the background, by itself), offer to restart into it. It
// also installs on its own the next time the app quits.

export function UpdateReady() {
	const status = useDesktopStatus();
	const [restarting, setRestarting] = useState(false);
	const app = desktop();
	if (!status?.updateReady || !app?.restartToUpdate) return null;
	return (
		<div className="surface-card mx-0.5 mb-2 px-3 py-2.5 text-[0.8125rem]">
			<p className="font-medium">Update ready</p>
			<p className="mt-0.5 text-xs text-muted-foreground">
				Guildie {status.updateReady} is downloaded. Restart to use it.
			</p>
			<Button
				size="sm"
				disabled={restarting}
				onClick={() => {
					setRestarting(true);
					void app.restartToUpdate?.();
				}}
				className="mt-2 w-full text-xs"
			>
				{restarting ? "Restarting…" : "Restart Guildie"}
			</Button>
		</div>
	);
}
