import { Dialog } from "@base-ui/react/dialog";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/ui/button";
import { RELEASES } from "@/lib/desktop";

// Every "get the Windows app" button: opens a beta notice first (the installer
// isn't code-signed yet, so SmartScreen warns), and only the dialog's own
// button goes to the release download.
export function DownloadAppButton(props: Omit<ComponentProps<typeof Button>, "render" | "nativeButton">) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger render={<Button {...props} />} />
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 bg-background p-5 text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
					<Dialog.Title className="text-[15px] font-semibold">Guildie for Windows is in beta</Dialog.Title>
					<Dialog.Description render={<div />} className="mt-2 space-y-2.5 text-pretty text-muted-foreground">
						<p>
							The app isn't code-signed yet, so when you run the installer Windows may show{" "}
							<span className="text-foreground">"Windows protected your PC"</span>. To install anyway, choose{" "}
							<span className="text-foreground">More info</span>, then{" "}
							<span className="text-foreground">Run anyway</span>.
						</p>
						<p>We're working on signing the app so this warning goes away.</p>
						<p>It's a beta, so you may also run into bugs or rough edges.</p>
					</Dialog.Description>
					<p className="mt-4 text-xs text-muted-foreground">
						By downloading, you agree that you've read and acknowledge the notice above.
					</p>
					<div className="mt-4 flex justify-end gap-2">
						<Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
						<Button
							nativeButton={false}
							render={<a href={RELEASES} target="_blank" rel="noreferrer" />}
							onClick={() => setOpen(false)}
						>
							<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
							Download
						</Button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
