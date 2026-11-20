import { Dialog } from "@base-ui/react/dialog";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { DOWNLOADS } from "@/lib/desktop";

// Downloads of the Guildie app. Windows is the beta: every "get the app"
// button downloads it, after a notice (the installer isn't code-signed yet,
// so SmartScreen warns). macOS and Linux are alpha builds, offered only on
// /download, each behind a dialog the visitor has to acknowledge
// (AlphaDownloadButton).

export const ISSUES = "https://github.com/natedunn/guildie/issues/new/choose";

const popup =
	"surface-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-background p-5 text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0";
const backdrop =
	"fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0";

/** The Windows app (beta): a notice, then the download. */
export function DownloadAppButton({
	children,
	...props
}: Omit<ComponentProps<typeof Button>, "render" | "nativeButton">) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger
				render={
					<Button {...props}>
						{children ?? (
							<>
								<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
								Download for Windows
							</>
						)}
					</Button>
				}
			/>
			<Dialog.Portal>
				<Dialog.Backdrop className={backdrop} />
				<Dialog.Popup className={popup}>
					<Dialog.Title className="text-[15px] font-semibold">Guildie for Windows is in beta</Dialog.Title>
					<Dialog.Description render={<div />} className="mt-2 space-y-2.5 text-pretty text-muted-foreground">
						<p>
							The app isn't code-signed yet, so when you run the installer Windows may show{" "}
							<Em>"Windows protected your PC"</Em>. To install anyway, choose <Em>More info</Em>, then{" "}
							<Em>Run anyway</Em>.
						</p>
						<p>We're working on signing the app so this warning goes away.</p>
						<p>It's a beta, so you may also run into bugs or rough edges.</p>
					</Dialog.Description>
					<p className="mt-4 text-xs text-muted-foreground">
						By downloading, you agree that you've read and acknowledge the notice above.
					</p>
					<div className="mt-4 flex flex-wrap items-center justify-end gap-2">
						<Link
							to="/download"
							onClick={() => setOpen(false)}
							className="mr-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
						>
							macOS or Linux?
						</Link>
						<Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
						<Button
							nativeButton={false}
							render={<a href={DOWNLOADS.win.href} target="_blank" rel="noreferrer" />}
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

/**
 * The macOS or Linux alpha: a dialog listing what's likely to go wrong, and
 * the download only once the visitor ticks that they understand.
 */
export function AlphaDownloadButton({
	os,
	...props
}: { os: "mac" | "linux" } & Omit<ComponentProps<typeof Button>, "render" | "nativeButton" | "children">) {
	const [open, setOpen] = useState(false);
	const [understood, setUnderstood] = useState(false);
	const name = DOWNLOADS[os].name;
	return (
		<Dialog.Root
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setUnderstood(false);
			}}
		>
			<Dialog.Trigger
				render={
					<Button variant="outline" {...props}>
						<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
						Download the {name} alpha
					</Button>
				}
			/>
			<Dialog.Portal>
				<Dialog.Backdrop className={backdrop} />
				<Dialog.Popup className={popup}>
					<Dialog.Title className="text-[15px] font-semibold">Guildie for {name} is an early alpha</Dialog.Title>
					<Dialog.Description render={<div />} className="mt-2 space-y-2.5 text-pretty text-muted-foreground">
						<p>
							It's new and has barely been tested, not yet with WoW itself. <Em>Expect it to break.</Em> If you want
							something that works today, use Guildie in your browser.
						</p>
						<AlphaRisks os={os} />
						<p>
							Your guild data on the site is safe either way: the app only uploads what the addon saves. If something
							goes wrong, please{" "}
							<a
								href={ISSUES}
								target="_blank"
								rel="noreferrer"
								className="text-foreground underline underline-offset-2"
							>
								report it on GitHub
							</a>
							.
						</p>
					</Dialog.Description>
					<label className="mt-4 flex items-start gap-2.5 text-[0.8125rem]">
						<input
							type="checkbox"
							className="mt-0.5 size-4 accent-[var(--highlight)]"
							checked={understood}
							onChange={(e) => setUnderstood(e.target.checked)}
						/>
						<span>I understand this is an unfinished alpha that will likely have problems.</span>
					</label>
					<div className="mt-4 flex justify-end gap-2">
						<Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
						{understood ? (
							<Button
								nativeButton={false}
								render={<a href={DOWNLOADS[os].href} target="_blank" rel="noreferrer" />}
								onClick={() => setOpen(false)}
							>
								<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
								Download
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

/** What's likely to go wrong on each alpha, and how to install it anyway. */
export function AlphaRisks({ os }: { os: "mac" | "linux" }) {
	if (os === "mac")
		return (
			<ul className="list-disc space-y-1.5 pl-4">
				<li>
					<Em>It isn't signed by Apple.</Em> macOS will refuse to open it at first and may call it "damaged" or from an
					"unidentified developer". To open it: drag Guildie to Applications, <Em>right-click</Em> it and choose{" "}
					<Em>Open</Em>, or try once and then choose <Em>Open Anyway</Em> in System Settings → Privacy & Security.
				</li>
				<li>
					Because it's unsigned, macOS may ask again for your keychain (to keep you signed in) and for Screen Recording
					(live sync) after every update, and may stop live sync until you allow it again.
				</li>
				<li>Updating itself only works from Applications, and is new: if an update fails, download it again here.</li>
				<li>Finding your WoW folder, uploading and the addon's install haven't been tried with the game on a Mac.</li>
			</ul>
		);
	return (
		<ul className="list-disc space-y-1.5 pl-4">
			<li>
				It's an AppImage: make it executable (<Mono>chmod +x {DOWNLOADS.linux.file}</Mono>, or Properties →{" "}
				<Em>Allow executing file as program</Em>), then run it. Some systems need <Mono>libfuse2</Mono> (Ubuntu 24.04:{" "}
				<Mono>libfuse2t64</Mono>).
			</li>
			<li>
				WoW runs under Wine, Lutris, Bottles or Steam, so the app may not find your WoW folder: you may have to choose
				it yourself.
			</li>
			<li>
				The tray icon doesn't show on some desktops (GNOME without the AppIndicator extension); there, closing the
				window quits the app.
			</li>
			<li>Without a keyring (GNOME Keyring, KWallet), your sign-in is kept in a file only your user can read.</li>
			<li>Live sync often doesn't work under Wayland.</li>
		</ul>
	);
}

function Em({ children }: { children: ReactNode }) {
	return <span className="text-foreground">{children}</span>;
}

function Mono({ children }: { children: ReactNode }) {
	return <span className="font-mono text-foreground">{children}</span>;
}
