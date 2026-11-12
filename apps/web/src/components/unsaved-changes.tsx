import { Dialog } from "@base-ui/react/dialog";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useInDesktopApp } from "@/lib/desktop";

/**
 * Asks before leaving a page with changes that aren't saved: our own dialog
 * for moves inside Guildie (links, the sidebar, back and forward), and the
 * browser's own prompt for closing or reloading the tab. Not that one in the
 * Windows app: there it would quietly keep the window from closing.
 */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
	const inApp = useInDesktopApp();
	const blocker = useBlocker({
		shouldBlockFn: ({ current, next }) => dirty && current.pathname !== next.pathname,
		enableBeforeUnload: () => dirty && !inApp,
		withResolver: true,
	});
	const open = blocker.status === "blocked";
	return (
		<Dialog.Root
			open={open}
			onOpenChange={(next) => {
				if (!next && open) blocker.reset();
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 bg-background p-5 text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
					<Dialog.Title className="text-[15px] font-semibold">Leave without saving?</Dialog.Title>
					<Dialog.Description className="mt-2 text-pretty text-muted-foreground">
						You changed something on this page and haven't saved it. If you leave now, those changes are lost.
					</Dialog.Description>
					<div className="mt-5 flex justify-end gap-2">
						<Button variant="outline" onClick={() => blocker.status === "blocked" && blocker.proceed()}>
							Leave
						</Button>
						<Button onClick={() => blocker.status === "blocked" && blocker.reset()}>Stay</Button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
