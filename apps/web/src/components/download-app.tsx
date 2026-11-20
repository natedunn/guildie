import { Dialog } from "@base-ui/react/dialog";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { type DesktopPlatform, DOWNLOADS, useVisitorOS } from "@/lib/desktop";

// Every "get the Guildie app" button: opens a beta notice first (the app
// isn't code-signed yet, so Windows and macOS warn about it), and only the
// dialog's own button downloads. It offers the visitor's system (Windows,
// macOS or Linux) and lets them pick another; phones and the like pick.

const PLATFORMS: DesktopPlatform[] = ["win", "mac", "linux"];

/** The button's default text: the visitor's system once known (client only). */
function useDownloadLabel() {
	const os = useVisitorOS();
	return os && os !== "other" ? `Download for ${DOWNLOADS[os].name}` : "Get the Guildie app";
}

export function DownloadAppButton({
	children,
	...props
}: Omit<ComponentProps<typeof Button>, "render" | "nativeButton">) {
	const detected = useVisitorOS();
	const label = useDownloadLabel();
	const [open, setOpen] = useState(false);
	const [chosen, setChosen] = useState<DesktopPlatform | null>(null);
	const os = chosen ?? (detected && detected !== "other" ? detected : null);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger
				render={
					<Button {...props}>
						{children ?? (
							<>
								<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
								{label}
							</>
						)}
					</Button>
				}
			/>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-background p-5 text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
					<Dialog.Title className="text-[15px] font-semibold">
						{os ? `Guildie for ${DOWNLOADS[os].name} is in beta` : "The Guildie app is in beta"}
					</Dialog.Title>
					<fieldset className="mt-3 flex flex-wrap gap-1.5">
						<legend className="sr-only">Your computer</legend>
						{PLATFORMS.map((p) => (
							<button
								key={p}
								type="button"
								className="chip"
								data-active={p === os}
								aria-pressed={p === os}
								onClick={() => setChosen(p)}
							>
								{DOWNLOADS[p].name}
							</button>
						))}
					</fieldset>
					<Dialog.Description render={<div />} className="mt-3 space-y-2.5 text-pretty text-muted-foreground">
						{os ? (
							<InstallNotes os={os} />
						) : (
							<p>The app runs on Windows, macOS and Linux computers. Choose yours to see how to install it.</p>
						)}
						<p>It's a beta, so you may also run into bugs or rough edges.</p>
					</Dialog.Description>
					<p className="mt-4 text-xs text-muted-foreground">
						By downloading, you agree that you've read and acknowledge the notice above.
					</p>
					<div className="mt-4 flex justify-end gap-2">
						<Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
						{os ? (
							<Button
								nativeButton={false}
								render={<a href={DOWNLOADS[os].href} target="_blank" rel="noreferrer" />}
								onClick={() => setOpen(false)}
							>
								<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
								Download for {DOWNLOADS[os].name}
							</Button>
						) : (
							<Button disabled>
								<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
								Download
							</Button>
						)}
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/** How to get past each system's first-run warnings. */
function InstallNotes({ os }: { os: DesktopPlatform }) {
	if (os === "mac")
		return (
			<>
				<p>
					Open the download and drag Guildie to <Em>Applications</Em>. It updates itself from there.
				</p>
				<p>
					The app isn't signed by Apple yet, so the first time, macOS won't open it with a double-click.{" "}
					<Em>Right-click</Em> Guildie, choose <Em>Open</Em>, then <Em>Open</Em> again. Or try to open it once, then go
					to System Settings → Privacy & Security and choose <Em>Open Anyway</Em>.
				</p>
				<p>We're working on signing the app so this goes away.</p>
			</>
		);
	if (os === "linux")
		return (
			<>
				<p>
					It's an AppImage: make it executable, then run it. In a terminal,{" "}
					<span className="font-mono text-foreground">chmod +x {DOWNLOADS.linux.file}</span>, or in your file manager,
					Properties → <Em>Allow executing file as program</Em>. It updates itself.
				</p>
				<p>
					If it doesn't start, your system may need <span className="font-mono text-foreground">libfuse2</span> (Ubuntu
					24.04: <span className="font-mono text-foreground">libfuse2t64</span>).
				</p>
			</>
		);
	return (
		<>
			<p>
				The app isn't code-signed yet, so when you run the installer Windows may show{" "}
				<Em>"Windows protected your PC"</Em>. To install anyway, choose <Em>More info</Em>, then <Em>Run anyway</Em>.
			</p>
			<p>We're working on signing the app so this warning goes away.</p>
		</>
	);
}

function Em({ children }: { children: ReactNode }) {
	return <span className="text-foreground">{children}</span>;
}
