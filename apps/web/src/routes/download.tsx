import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AlphaDownloadButton, AlphaRisks, DownloadAppButton } from "@/components/download-app";
import { LandingFooter, LandingNav } from "@/components/landing/chrome";
import { Page, PageHeader } from "@/components/page-header";
import { DOWNLOADS, RELEASES } from "@/lib/desktop";

// Every download of the Guildie app in one place. Windows is the beta; macOS
// and Linux are alpha builds, each behind its own acknowledgement dialog
// (components/download-app.tsx). Signed out, it's drawn like the landing page
// (its nav and footer); signed in, it's a page in the app shell.

export const Route = createFileRoute("/download")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}));
	},
	staticData: { shell: "landing" },
	head: () => ({ meta: [{ title: "Download · Guildie" }] }),
	component: DownloadPage,
});

function DownloadPage() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (viewer)
		return (
			<>
				<PageHeader title="Download" description="The Guildie app for your computer." />
				<Page width="medium">
					<Downloads />
				</Page>
			</>
		);
	return (
		<>
			<LandingNav />
			<div className="mx-auto max-w-3xl px-4 pt-16 pb-24 sm:px-6">
				<h1 className="heading-display text-fade text-3xl sm:text-4xl">Download Guildie</h1>
				<p className="mt-3 max-w-xl text-pretty text-muted-foreground">
					Guildie in its own window, plus the addon: it installs the addon in World of Warcraft, keeps it up to date,
					and uploads what it saves as you play.
				</p>
				<div className="mt-10">
					<Downloads />
				</div>
			</div>
			<LandingFooter />
		</>
	);
}

function Downloads() {
	return (
		<div className="space-y-4 text-[0.8125rem]">
			<Platform name="Windows" stage="Beta" note="Windows 10 and 11, 64-bit.">
				<p className="text-muted-foreground">
					The one to use. It isn't code-signed yet, so Windows may say "Windows protected your PC" the first time:
					choose More info, then Run anyway.
				</p>
				<DownloadAppButton className="mt-4" />
			</Platform>

			<h2 className="pt-6 font-semibold">macOS and Linux alpha</h2>
			<p className="text-pretty text-muted-foreground">
				Early, unfinished builds for people willing to test. They haven't been tried with WoW yet and{" "}
				<span className="text-foreground">will likely have problems</span>. Please don't rely on them; Guildie in your
				browser works on any computer.
			</p>

			<Platform name="macOS" stage="Alpha" note="macOS 12 or later, Apple Silicon or Intel. Not signed by Apple.">
				<div className="text-muted-foreground">
					<AlphaRisks os="mac" />
				</div>
				<AlphaDownloadButton os="mac" className="mt-4" />
			</Platform>

			<Platform name="Linux" stage="Alpha" note="64-bit (x86_64) AppImage.">
				<div className="text-muted-foreground">
					<AlphaRisks os="linux" />
				</div>
				<AlphaDownloadButton os="linux" className="mt-4" />
			</Platform>

			<p className="pt-4 text-xs text-muted-foreground">
				All files come from{" "}
				<a href={RELEASES} target="_blank" rel="noreferrer" className="underline underline-offset-2">
					the latest release on GitHub
				</a>
				: {DOWNLOADS.win.file}, {DOWNLOADS.mac.file}, {DOWNLOADS.linux.file}.
			</p>
		</div>
	);
}

function Platform({
	name,
	stage,
	note,
	children,
}: {
	name: string;
	stage: "Beta" | "Alpha";
	note: string;
	children: ReactNode;
}) {
	return (
		<section className="surface-card p-5">
			<span aria-hidden className="streak" />
			<div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
				<h2 className="text-[15px] font-semibold">{name}</h2>
				<span
					className={
						stage === "Alpha"
							? "rounded-[4px] border border-[color-mix(in_oklab,var(--highlight)_50%,transparent)] px-1.5 text-[11px] font-medium text-[var(--highlight)]"
							: "rounded-[4px] border border-border px-1.5 text-[11px] font-medium text-muted-foreground"
					}
				>
					{stage}
				</span>
				<span className="text-xs text-muted-foreground">{note}</span>
			</div>
			<div className="mt-3">{children}</div>
		</section>
	);
}
