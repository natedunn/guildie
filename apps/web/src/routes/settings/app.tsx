import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DownloadAppButton } from "@/components/download-app";
import { HelperTokens } from "@/components/helper-tokens";
import { OpenSourceNote } from "@/components/open-source-note";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AllReleasesLink, WhatsNew } from "@/components/whats-new";
import {
	type DesktopPlatform,
	DOWNLOADS,
	desktop,
	type NotifyOption,
	type UpdateState,
	useDesktopPlatform,
	useDesktopStatus,
	useInDesktopApp,
} from "@/lib/desktop";
import { ago } from "@/lib/format";
import { markSeen } from "@/lib/release-notes";
import { Row, Rows } from "./addon";

// Settings → App: the Guildie app (Windows, macOS, Linux). In the app, its version and
// updates; on the web, where to get it. Either way, the computers connected
// to your account (each is a token that can upload your addon's data).
export const Route = createFileRoute("/settings/app")({
	head: () => ({ meta: [{ title: "App · Settings · Guildie" }] }),
	component: AppSettings,
});

function AppSettings() {
	const inApp = useInDesktopApp();
	// Opening this page counts as having seen the notes for this version.
	useEffect(() => {
		const version = desktop()?.version;
		if (version) markSeen(version);
	}, []);
	return (
		<div className="max-w-3xl pb-12">
			{inApp ? <ThisApp /> : <GetTheApp />}
			{inApp && <NotifyWhilePlaying />}
			<section id="whats-new" className="mt-10 scroll-mt-4">
				<div className="flex items-baseline justify-between gap-3">
					<SectionTitle>What's new</SectionTitle>
					<AllReleasesLink />
				</div>
				<WhatsNew upTo={inApp ? desktop()?.version : undefined} />
			</section>
			<section id="computers" className="mt-10 scroll-mt-4">
				<SectionTitle>Connected computers</SectionTitle>
				<HelperTokens />
			</section>
			<OpenSourceNote part="app" />
		</div>
	);
}

function ThisApp() {
	const status = useDesktopStatus();
	const app = desktop();
	const platform = useDesktopPlatform() ?? "win";
	const [checking, setChecking] = useState(false);
	const update = status?.update;
	const ready = update?.state === "ready" ? update.version : status?.updateReady;
	return (
		<section>
			<SectionTitle>Guildie for {DOWNLOADS[platform].name}</SectionTitle>
			<Rows>
				<Row label="Version">
					<span className="num">{app?.version ?? "Unknown"}</span>
				</Row>
				<Row label="Updates">
					<UpdateLine update={update} ready={ready} platform={platform} />
				</Row>
			</Rows>
			<div className="mt-3 flex gap-2">
				{ready && app?.restartToUpdate ? (
					<Button onClick={() => void app.restartToUpdate?.()}>Restart to update</Button>
				) : app?.checkForUpdates && update?.state !== "off" ? (
					<Button
						variant="outline"
						disabled={checking || update?.state === "checking" || update?.state === "downloading"}
						onClick={async () => {
							setChecking(true);
							await app.checkForUpdates?.().catch(() => undefined);
							setChecking(false);
						}}
					>
						Check for updates
					</Button>
				) : null}
			</div>
		</section>
	);
}

/** Experimental system notifications while you play (apps/desktop/README.md). */
function NotifyWhilePlaying() {
	const status = useDesktopStatus();
	const app = desktop();
	const platform = useDesktopPlatform() ?? "win";
	const [error, setError] = useState<string | null>(null);
	const notify = status?.notify;
	if (!app?.setNotifyOption || !notify) return null;
	const set = async (option: NotifyOption, on: boolean) => {
		setError(null);
		try {
			await app.setNotifyOption?.(option, on);
		} catch {
			setError("That didn't work. Try again.");
		}
	};
	return (
		<section className="mt-10">
			<SectionTitle>Experimental: notifications while you play</SectionTitle>
			<div className="surface-card mt-2 space-y-4 p-4 text-[0.8125rem]">
				<label className="flex items-start gap-3">
					<Switch
						className="mt-0.5"
						checked={notify.itemsMailed}
						onCheckedChange={(on) => void set("itemsMailed", on)}
					/>
					<span>
						Items mailed for your requests
						<span className="mt-1 block text-muted-foreground">
							When a guildmate mails you something you asked for, a notification tells you to check your mailbox. It
							comes once their Guildie app uploads the mail they sent.
						</span>
					</span>
				</label>
				<label className="flex items-start gap-3">
					<Switch
						className="mt-0.5"
						checked={notify.reloadReminders}
						disabled={!notify.reloadRemindersAvailable}
						onCheckedChange={(on) => void set("reloadReminders", on)}
					/>
					<span>
						Reload reminders
						<span className="mt-1 block text-muted-foreground">
							The addon only gets new guild data at login or /reload. When a lot has changed since then (guildmates'
							gear and levels, requests, recipes) while WoW is open, a notification suggests a /reload so tooltips catch
							up. At most once an hour.
							{!notify.reloadRemindersAvailable &&
								(platform === "win" ? " Windows only." : ` Not available on ${DOWNLOADS[platform].name} yet.`)}
						</span>
					</span>
				</label>
				<p className="text-muted-foreground">{NOTIFY_HINT[platform]}</p>
				{error && (
					<p className="text-destructive" role="alert">
						{error}
					</p>
				)}
			</div>
		</section>
	);
}

/** Where each system holds notifications back. */
const NOTIFY_HINT: Record<DesktopPlatform, string> = {
	win: "Windows may hold notifications while a game is fullscreen: check Settings → System → Notifications → Do not disturb, or play in windowed fullscreen.",
	mac: "macOS asks once whether Guildie may show notifications, and may hold them while a game is fullscreen or a Focus is on: check System Settings → Notifications → Guildie, and Focus.",
	linux: "Your desktop may hold notifications while a game is fullscreen or Do not disturb is on.",
};

/** Why a copy of the app can't update itself, and what to do about it. */
const UPDATES_OFF: Record<DesktopPlatform, string> = {
	win: "Off: this copy can't update itself. Install Guildie from the App tab on guildie.club.",
	mac: "Off: this copy can't update itself. Quit Guildie, move it to your Applications folder, and open it from there.",
	linux:
		"Off: this copy can't update itself. Run the Guildie AppImage from the App tab on guildie.club (not an unpacked copy).",
};

function UpdateLine({ update, ready, platform }: { update?: UpdateState; ready?: string; platform: DesktopPlatform }) {
	if (ready) return <span>Version {ready} is downloaded and ready</span>;
	switch (update?.state) {
		case "checking":
			return <span>Checking…</span>;
		case "downloading":
			return (
				<span>
					Downloading {update.version}
					{update.percent !== undefined ? ` (${update.percent}%)` : ""}…
				</span>
			);
		case "current":
			return <span>Up to date. Checked {ago(update.checkedAt)}</span>;
		case "failed":
			return (
				<span className="text-muted-foreground">Couldn't check {ago(update.checkedAt)}. It tries again by itself.</span>
			);
		case "off":
			return <span className="text-muted-foreground">{UPDATES_OFF[platform]}</span>;
		default:
			return (
				<span className="text-muted-foreground">
					Checked automatically every hour, and downloaded in the background
				</span>
			);
	}
}

function GetTheApp() {
	return (
		<section className="surface-card max-w-xl p-5 text-[0.8125rem]">
			<span aria-hidden className="streak" />
			<SectionTitle>The Guildie app</SectionTitle>
			<p className="mt-1 text-muted-foreground">
				Guildie in its own window, plus the Guildie addon: it installs the addon in World of Warcraft, keeps it up to
				date, and keeps your character current on Guildie as you play. It updates itself.
			</p>
			<DownloadAppButton className="mt-4" />
			<p className="mt-3 text-muted-foreground">For Windows, with early alpha builds for macOS and Linux.</p>
		</section>
	);
}
