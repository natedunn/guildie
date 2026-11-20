import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { AppleIcon, Download04Icon, WindowsNewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { AlphaDownloadButton } from "@/components/download-app";
import { LandingFooter, LandingNav } from "@/components/landing/chrome";
import { WindowMock } from "@/components/landing/more";
import { Button } from "@/components/ui/button";
import { type DesktopPlatform, DOWNLOADS, RELEASES } from "@/lib/desktop";
import { cn } from "@/lib/utils";

// Every download of the Guildie app, side by side. Windows (the beta)
// downloads straight away; macOS and Linux are alpha builds whose button
// opens a dialog with what's likely to go wrong and an "I understand" tick
// (AlphaDownloadButton). Signed out it's drawn like the landing page, with its
// nav and footer; signed in it's a page in the app shell.

export const Route = createFileRoute("/download")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}));
	},
	staticData: { shell: "landing" },
	head: () => ({ meta: [{ title: "Download · Guildie" }] }),
	component: DownloadPage,
});

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

function DownloadPage() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (viewer) return <Downloads />;
	return (
		<>
			<LandingNav />
			<Downloads />
			<LandingFooter />
		</>
	);
}

function Downloads() {
	return (
		<section className="relative isolate pb-24">
			<div
				aria-hidden
				className="map-backdrop pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] [--map-opacity:0.09]"
			/>
			<div aria-hidden className="glow pointer-events-none absolute inset-x-[18%] top-24 -z-10 h-72 opacity-60" />

			<div className="mx-auto max-w-5xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
				<p style={delay(0)} className="landing-enter pill">
					<span className="text-foreground">Free</span>
					<span className="h-3 w-px bg-white/15" />
					Installs and updates the addon for you
				</p>
				<h1
					style={delay(80)}
					className="landing-enter heading-display text-fade mx-auto mt-6 max-w-3xl text-[2.5rem] sm:text-6xl"
				>
					Guildie, on your desktop
				</h1>
				<p
					style={delay(160)}
					className="landing-enter mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground"
				>
					Guildie in its own window. It keeps the addon up to date and uploads what it saves as you play, so your guild
					sees your gear, bags and quests after a /reload.
				</p>
			</div>

			<div style={delay(240)} className="landing-enter mx-auto mt-14 grid max-w-5xl gap-4 px-4 sm:px-6 md:grid-cols-3">
				<Platform os="win" icon={WindowsNewIcon} stage="Beta" spec="Windows 10 and 11">
					<Button
						size="lg"
						className="h-10 w-full"
						nativeButton={false}
						render={<a href={DOWNLOADS.win.href} target="_blank" rel="noreferrer" />}
					>
						<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
						Download
					</Button>
					<p className="mt-3 text-xs text-pretty text-muted-foreground">
						Not code-signed yet: if Windows warns you, choose More info, then Run anyway.
					</p>
				</Platform>
				<Platform os="mac" icon={AppleIcon} stage="Alpha" spec="macOS 12 or later, Apple Silicon and Intel">
					<AlphaDownloadButton os="mac" size="lg" className="h-10 w-full" />
					<p className="mt-3 text-xs text-pretty text-muted-foreground">Early and unsigned. Read before installing.</p>
				</Platform>
				<Platform os="linux" icon={PenguinIcon} stage="Alpha" spec="64-bit AppImage">
					<AlphaDownloadButton os="linux" size="lg" className="h-10 w-full" />
					<p className="mt-3 text-xs text-pretty text-muted-foreground">Early, for WoW under Wine or Proton.</p>
				</Platform>
			</div>

			<div className="mx-auto mt-20 max-w-4xl px-4 sm:px-6">
				<div className="fade-bottom">
					<WindowMock />
				</div>
				<p className="mt-6 text-center text-xs text-muted-foreground">
					Downloads come from{" "}
					<a
						href={RELEASES}
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-2 hover:text-foreground"
					>
						the latest release on GitHub
					</a>
					. The app updates itself after that.
				</p>
			</div>
		</section>
	);
}

function Platform({
	os,
	icon,
	stage,
	spec,
	children,
}: {
	os: DesktopPlatform;
	icon: IconSvgElement;
	stage: "Beta" | "Alpha";
	spec: string;
	children: ReactNode;
}) {
	return (
		<section className="surface-card flex flex-col p-6 text-left">
			<span aria-hidden className="streak" />
			<div className="flex items-center justify-between">
				<span className="grid size-11 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-foreground">
					<HugeiconsIcon icon={icon} size={22} strokeWidth={1.5} />
				</span>
				<span className="flex items-center gap-2 text-xs text-muted-foreground">
					<span
						className={cn(
							"rounded-[4px] border px-1.5 text-[11px] font-medium",
							stage === "Alpha"
								? "border-[color-mix(in_oklab,var(--highlight)_50%,transparent)] text-[var(--highlight)]"
								: "border-border text-muted-foreground",
						)}
					>
						{stage}
					</span>
				</span>
			</div>
			<h2 className="mt-5 text-lg font-semibold">{DOWNLOADS[os].name}</h2>
			<p className="mt-1 mb-6 text-[0.8125rem] text-muted-foreground">{spec}</p>
			<div className="mt-auto">{children}</div>
		</section>
	);
}

/** Linux's penguin, drawn like the Hugeicons outline set (none ships one). */
const PenguinIcon: IconSvgElement = [
	[
		"path",
		{
			d: "M12 2.75C9.6 2.75 8.25 4.6 8.25 7.25V9.25C6.6 11.2 5 13.9 5 16.5C5 18.8 6.4 20.4 8 21.25H16C17.6 20.4 19 18.8 19 16.5C19 13.9 17.4 11.2 15.75 9.25V7.25C15.75 4.6 14.4 2.75 12 2.75Z",
			stroke: "currentColor",
			strokeLinejoin: "round",
			strokeWidth: "1.5",
			key: "0",
		},
	],
	[
		"path",
		{
			d: "M9.75 13C9.75 11.6 10.7 10.75 12 10.75C13.3 10.75 14.25 11.6 14.25 13V16.25C14.25 17.8 13.3 18.75 12 18.75C10.7 18.75 9.75 17.8 9.75 16.25V13Z",
			stroke: "currentColor",
			strokeLinejoin: "round",
			strokeWidth: "1.5",
			key: "1",
		},
	],
	[
		"path",
		{
			d: "M11 8.25H13L12 9.25L11 8.25Z",
			stroke: "currentColor",
			strokeLinejoin: "round",
			strokeWidth: "1.5",
			key: "2",
		},
	],
	["circle", { cx: "10.6", cy: "6.4", r: "0.6", fill: "currentColor", key: "3" }],
	["circle", { cx: "13.4", cy: "6.4", r: "0.6", fill: "currentColor", key: "4" }],
];
