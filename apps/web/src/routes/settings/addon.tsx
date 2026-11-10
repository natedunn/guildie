import { Dialog } from "@base-ui/react/dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { OpenSourceNote } from "@/components/open-source-note";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { type AddonInfo, type DesktopStatus, desktop, RELEASES, useInDesktopApp } from "@/lib/desktop";
import { ago } from "@/lib/format";
import { compareVersions } from "@/lib/versions";

// Settings → Addon: the Guildie addon, managed by the desktop app. Is it
// installed, which version, install / update / reinstall / uninstall, which
// WoW folder, and its sync. The addon only works with the app (it moves the
// addon's data both ways), so on the web this points to the App tab.

export const Route = createFileRoute("/settings/addon")({
	head: () => ({ meta: [{ title: "Addon · Settings · Guildie" }] }),
	component: AddonPage,
});

function AddonPage() {
	const inApp = useInDesktopApp();
	return (
		<div className="pb-12">
			{!inApp ? <GetTheApp /> : !desktop()?.addon ? <UpdateTheApp /> : <ManageAddon />}
			<OpenSourceNote part="addon" />
		</div>
	);
}

function GetTheApp() {
	return (
		<div className="max-w-xl text-[0.8125rem]">
			<p className="text-muted-foreground">
				The Guildie addon shows who in your guild might want an item, right in its tooltip, and keeps your character
				current on Guildie as you play. It works through the Guildie app for Windows, which installs the addon, keeps it
				up to date and moves its data.
			</p>
			<Button className="mt-4" render={<Link to="/settings/app" />}>
				Get the Guildie app
			</Button>
		</div>
	);
}

function UpdateTheApp() {
	return (
		<div className="max-w-xl text-[0.8125rem]">
			<p className="text-muted-foreground">
				This version of the Guildie app can't manage the addon from here yet. Install the latest version once; it keeps
				itself up to date from then on.
			</p>
			<Button className="mt-4" render={<a href={RELEASES} target="_blank" rel="noreferrer" />}>
				Get the latest Guildie app
			</Button>
		</div>
	);
}

function useAddon() {
	const [info, setInfo] = useState<AddonInfo | null>(null);
	const [status, setStatus] = useState<DesktopStatus | null>(null);
	const refresh = useCallback(() => {
		void desktop()?.addon?.info().then(setInfo);
	}, []);
	useEffect(() => {
		const app = desktop();
		refresh();
		void app?.getStatus?.().then(setStatus);
		// Status changes (an upload, a new WoW folder, an install from the tray) can change what's installed.
		const off = app?.onStatus?.((s) => {
			setStatus(s);
			refresh();
		});
		// The game or the player can change the folder behind our back.
		const onFocus = () => refresh();
		window.addEventListener("focus", onFocus);
		return () => {
			off?.();
			window.removeEventListener("focus", onFocus);
		};
	}, [refresh]);
	return { info, setInfo, status };
}

function ManageAddon() {
	const { info, setInfo, status } = useAddon();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const app = desktop();
	const run = async (action: () => Promise<AddonInfo | void> | undefined) => {
		setBusy(true);
		setError(null);
		try {
			const next = await action();
			if (next) setInfo(next);
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
	if (!info) return null;

	const installed = info.installs.find((i) => i.version);
	const broken = info.installs.some((i) => i.broken);
	const state =
		!info.wowFolder || !info.hasForever
			? "no-wow"
			: installed
				? info.bundled && compareVersions(installed.version!, info.bundled) < 0
					? "outdated"
					: "installed"
				: broken
					? "broken"
					: "missing";

	return (
		<div className="max-w-3xl">
			<section>
				<SectionTitle>Guildie addon</SectionTitle>
				<Rows>
					<Row label="Status">
						{state === "installed" && <span>Installed, up to date</span>}
						{state === "outdated" && <span>Installed, update available</span>}
						{state === "missing" && (
							<span>{info.managed ? "Not installed" : "Uninstalled. The app won't reinstall it until you do."}</span>
						)}
						{state === "broken" && <span className="text-destructive">Damaged (no version found)</span>}
						{state === "no-wow" && (
							<span className="text-muted-foreground">Choose your World of Warcraft folder first</span>
						)}
					</Row>
					<Row label="Installed version">
						<span className="num">{installed?.version ?? "None"}</span>
					</Row>
					<Row label="This app's version">
						<span className="num">{info.bundled ?? "Unknown"}</span>
					</Row>
					{installed && (
						<Row label="Folder">
							<span className="break-all text-muted-foreground">{installed.folder}</span>
						</Row>
					)}
				</Rows>
				<div className="mt-3 flex flex-wrap gap-2">
					{state === "missing" && (
						<Button disabled={busy} onClick={() => run(() => app?.addon?.install())}>
							Install addon
						</Button>
					)}
					{(state === "outdated" || state === "broken") && (
						<Button disabled={busy} onClick={() => run(() => app?.addon?.install())}>
							Update to {info.bundled}
						</Button>
					)}
					{state === "installed" && (
						<Button variant="outline" disabled={busy} onClick={() => run(() => app?.addon?.install())}>
							Reinstall
						</Button>
					)}
					{installed && (
						<Button variant="outline" disabled={busy} onClick={() => run(() => app?.addon?.openFolder())}>
							Open folder
						</Button>
					)}
					{(installed || broken) && (
						<UninstallButton
							disabled={busy}
							onUninstall={(savedData) => run(() => app?.addon?.uninstall({ savedData }))}
						/>
					)}
				</div>
				{(state === "installed" || state === "outdated") && (
					<p className="mt-3 text-[0.8125rem] text-muted-foreground">
						After an install or update, type <span className="font-mono text-foreground">/reload</span> in WoW (or
						restart it if the addon is new).
					</p>
				)}
				{error && <p className="mt-3 text-[0.8125rem] text-destructive">{error}</p>}
			</section>

			<section className="mt-10">
				<SectionTitle>World of Warcraft</SectionTitle>
				<Rows>
					<Row label="Folder">
						<span className="break-all">
							{info.wowFolder ?? <span className="text-muted-foreground">Not found</span>}
						</span>
					</Row>
					{info.wowFolder && !info.hasForever && (
						<Row label="">
							<span className="text-destructive">
								No _forever_ folder here. Choose the folder that contains _forever_.
							</span>
						</Row>
					)}
				</Rows>
				<Button className="mt-3" variant="outline" disabled={busy} onClick={() => run(() => app?.chooseWowFolder?.())}>
					Choose folder…
				</Button>
			</section>

			<section className="mt-10">
				<SectionTitle>Sync</SectionTitle>
				<Rows>
					<Row label="Signed in as">
						{status?.connected ? status.account : <span className="text-muted-foreground">Not signed in</span>}
					</Row>
					<Row label="Last upload">
						{status?.lastUpload ? (
							<span>
								{status.lastUpload.characters.map(displayName).join(", ")}, {ago(status.lastUpload.at)}
							</span>
						) : (
							<span className="text-muted-foreground">None yet. It uploads when you log out of WoW or /reload.</span>
						)}
					</Row>
					<Row label="Guild data">
						{status?.guildDataAt ? (
							<span>Written to the addon {ago(status.guildDataAt)}</span>
						) : (
							<span className="text-muted-foreground">Not yet</span>
						)}
					</Row>
				</Rows>
				<Button
					className="mt-3"
					variant="outline"
					disabled={busy || !status?.connected}
					onClick={() => run(() => app?.uploadNow?.())}
				>
					Upload now
				</Button>
			</section>
		</div>
	);
}

function UninstallButton({
	disabled,
	onUninstall,
}: {
	disabled: boolean;
	onUninstall: (savedData: boolean) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [savedData, setSavedData] = useState(false);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger render={<Button variant="outline" disabled={disabled} />}>Uninstall…</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-background p-5 shadow-2xl">
					<Dialog.Title className="text-[15px] font-semibold">Uninstall the Guildie addon?</Dialog.Title>
					<Dialog.Description className="mt-2 text-[0.8125rem] text-muted-foreground">
						Removes the addon from World of Warcraft: Forever. The app won't put it back until you choose Install.
						Restart WoW afterwards if it's running.
					</Dialog.Description>
					<label className="mt-4 flex items-start gap-3 text-[0.8125rem]">
						<Switch className="mt-0.5" checked={savedData} onCheckedChange={setSavedData} />
						<span>
							Also delete its saved data
							<span className="block text-muted-foreground">
								Talent snapshots and settings the game saved for Guildie, on every account and character.
							</span>
						</span>
					</label>
					<div className="mt-5 flex justify-end gap-2">
						<Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
						<Button
							variant="destructive"
							onClick={async () => {
								setOpen(false);
								await onUninstall(savedData);
							}}
						>
							Uninstall
						</Button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

export function Rows({ children }: { children: ReactNode }) {
	return <dl className="mt-2 divide-y divide-border rounded-md border border-border text-[0.8125rem]">{children}</dl>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[10rem_1fr] gap-3 px-3 py-2">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0">{children}</dd>
		</div>
	);
}

/** "brenna-ironfoot" -> "Brenna" (as packages/sync's displayName). */
const displayName = (slug: string) => (slug.split("-")[0] ?? slug).replace(/^./, (c) => c.toUpperCase());
