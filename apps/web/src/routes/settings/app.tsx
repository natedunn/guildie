import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HelperTokens } from "@/components/helper-tokens";
import { OpenSourceNote } from "@/components/open-source-note";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { WhatsNew } from "@/components/whats-new";
import { desktop, RELEASES, type UpdateState, useDesktopStatus, useInDesktopApp } from "@/lib/desktop";
import { ago } from "@/lib/format";
import { markSeen } from "@/lib/release-notes";
import { Row, Rows } from "./addon";

// Settings → App: the Guildie app for Windows. In the app, its version and
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
			<section id="whats-new" className="mt-10 scroll-mt-4">
				<SectionTitle>What's new</SectionTitle>
				<WhatsNew upTo={inApp ? desktop()?.version : undefined} />
			</section>
			<section className="mt-10">
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
	const [checking, setChecking] = useState(false);
	const update = status?.update;
	const ready = update?.state === "ready" ? update.version : status?.updateReady;
	return (
		<section>
			<SectionTitle>Guildie for Windows</SectionTitle>
			<Rows>
				<Row label="Version">
					<span className="num">{app?.version ?? "Unknown"}</span>
				</Row>
				<Row label="Updates">
					<UpdateLine update={update} ready={ready} />
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

function UpdateLine({ update, ready }: { update?: UpdateState; ready?: string }) {
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
			return (
				<span className="text-muted-foreground">
					Off: this copy can't update itself. Install Guildie from the App tab on guildie.club.
				</span>
			);
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
		<section className="max-w-xl text-[0.8125rem]">
			<SectionTitle>Guildie for Windows</SectionTitle>
			<p className="mt-1 text-muted-foreground">
				Guildie in its own window, plus the Guildie addon: it installs the addon in World of Warcraft, keeps it up to
				date, and keeps your character current on Guildie as you play. It updates itself.
			</p>
			<Button className="mt-4" render={<a href={RELEASES} target="_blank" rel="noreferrer" />}>
				Get Guildie for Windows
			</Button>
			<p className="mt-3 text-muted-foreground">
				Download <span className="text-foreground">Guildie-Setup.exe</span> from the latest release and run it. Windows
				may warn that it's from an unknown publisher: choose More info, then Run anyway.
			</p>
		</section>
	);
}
