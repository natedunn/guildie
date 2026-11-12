import { CLASSES } from "@convex/shared/wow";
import {
	Activity01Icon,
	AiChat02Icon,
	Download04Icon,
	GithubIcon,
	MoneyBag01Icon,
	ScrollTextIcon,
	Search01Icon,
	Shield01Icon,
	SlidersHorizontalIcon,
	SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { ClassText } from "@/components/class-name";
import { ItemIcon } from "@/components/item";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";
import { RELEASES, useInDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { AppMock } from "./app-mock";
import { Card, Eyebrow, icon, Name, REPO, Section, SectionHead } from "./primitives";

// The rest of the landing page: the Windows app, AI apps, a grid of smaller
// features, open source, and a last call to sign in.

// ---- 6. The Windows app ----------------------------------------------------------------

export function WindowsAppSection() {
	const inApp = useInDesktopApp();
	return (
		<Section id="app" className="pt-28 sm:pt-36">
			<SectionHead eyebrow="Guildie for Windows" color="#3fc7eb" title="The companion app">
				Blizzard updates a character only when they log out, and never sees bags or banks. The app fills that in: it
				uploads what the addon saves in game, so your guild sees your changes after a /reload. And it's Guildie in its
				own window.
			</SectionHead>
			<div className="landing-reveal mt-14 grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
				<WindowMock />
				<div className="flex flex-col gap-4">
					<Card>
						<ul className="divide-y divide-border text-[0.8125rem]">
							<AppFact title="The site in its own window">Everything here, without a browser tab.</AppFact>
							<AppFact title="Installs the addon">And keeps it up to date in your WoW folder.</AppFact>
							<AppFact title="Uploads as you play">Gear, bags, banks and quests, from the addon's saved data.</AppFact>
							<AppFact title="Updates itself">New versions download in the background.</AppFact>
						</ul>
					</Card>
					<Card className="p-5">
						{inApp ? (
							<p className="text-[0.8125rem] text-muted-foreground">You're in it. Sign in to connect it.</p>
						) : (
							<>
								<Button
									size="lg"
									className="h-10 w-full"
									nativeButton={false}
									render={<a href={RELEASES} target="_blank" rel="noreferrer" />}
								>
									<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
									Download Guildie-Setup.exe
								</Button>
								<p className="mt-3 text-center text-xs text-muted-foreground">Free, from GitHub Releases</p>
							</>
						)}
					</Card>
				</div>
			</div>
		</Section>
	);
}

function AppFact({ title, children }: { title: string; children: ReactNode }) {
	return (
		<li className="px-5 py-3.5">
			<p className="font-medium">{title}</p>
			<p className="mt-0.5 text-muted-foreground">{children}</p>
		</li>
	);
}

/** A Windows window with the app in it (scaled down), and the tray menu beside it. */
function WindowMock() {
	return (
		<div className="relative pb-10 sm:pb-0" aria-hidden>
			<div className="landing-frame hairline overflow-hidden">
				<div className="flex h-8 items-center justify-end border-b border-border bg-chrome text-muted-foreground">
					{/* minimize / maximize / close, as Windows draws them */}
					<span className="grid h-full w-11 place-items-center">
						<span className="h-px w-2.5 bg-current" />
					</span>
					<span className="grid h-full w-11 place-items-center">
						<span className="size-2.5 border border-current" />
					</span>
					<span className="grid h-full w-11 place-items-center text-sm leading-none">✕</span>
				</div>
				<div className="h-[16rem] overflow-hidden sm:h-[22.2rem]">
					<div className="w-[166%] origin-top-left scale-[0.6]">
						<AppMock className="rounded-none" />
					</div>
				</div>
			</div>
			<div className="absolute right-3 -bottom-2 w-48 sm:w-56 rounded-md border border-border-strong bg-popover p-1 text-[12.5px] shadow-[0_16px_40px_rgb(0_0_0/0.6)] sm:-right-4 sm:bottom-6">
				<p className="max-sm:hidden px-2.5 py-1.5 text-muted-foreground">
					Connected as <span className="text-foreground">Brisket</span>
				</p>
				<p className="max-sm:hidden px-2.5 pb-1.5 text-muted-foreground">Last upload: 2 min ago</p>
				<p className="max-sm:hidden px-2.5 pb-1.5 text-muted-foreground">Addon 0.13.0</p>
				<div className="max-sm:hidden my-1 h-px bg-border" />
				{["Open Guildie", "Upload now", "Choose World of Warcraft folder…", "Start with Windows"].map((t, i) => (
					<p key={t} className={cn("rounded-sm px-2.5 py-1.5", i === 1 && "bg-selected")}>
						{t}
					</p>
				))}
			</div>
		</div>
	);
}

// ---- 7. AI apps (experimental) -----------------------------------------------------------

export function AiSection() {
	return (
		<Section id="ai" className="pt-28 sm:pt-36">
			<Card className="landing-reveal">
				<div className="grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
					<div>
						<Eyebrow color="#8788ee">
							AI apps{" "}
							<span className="rounded-full border border-white/10 px-2 py-px text-[11px] font-normal">
								Experimental
							</span>
						</Eyebrow>
						<h2 className="heading-display text-fade mt-4 text-3xl sm:text-4xl">Ask about your guild</h2>
						<p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
							Connect Claude, ChatGPT or another app that speaks MCP, and ask: who can craft what, what someone's
							wearing, which requests are open. It sees what you see on Guildie, nothing more.
						</p>
					</div>
					<div className="space-y-3 text-[13px]" aria-hidden>
						<div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-white/[0.06] px-3.5 py-2.5">
							Who in my guild can make Spidersilk Boots?
						</div>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<HugeiconsIcon icon={AiChat02Icon} size={14} strokeWidth={1.75} />
							Asked Guildie: who_can_craft
						</div>
						<div className="max-w-[92%] rounded-lg rounded-bl-sm border border-border px-3.5 py-2.5 leading-relaxed">
							<Name of="Brenna" surname /> knows it (Tailoring). It takes 2 Bolt of Silk Cloth, 4 Medium Leather, 4
							Spider's Silk and an Iridescent Pearl. Nobody else in the guild has the pattern yet.
						</div>
					</div>
				</div>
			</Card>
		</Section>
	);
}

// ---- 8. And more: a bento grid ----------------------------------------------------------------

export function BentoSection() {
	return (
		<Section className="pt-28 sm:pt-36">
			<SectionHead eyebrow="And more" title="The rest of the guild, too">
				The small things that save a whisper: what happened while you were out, what you have on which alt, and who's on
				the same quest.
			</SectionHead>
			<div className="landing-reveal mt-14 grid gap-4 md:grid-cols-6">
				<Tile
					className="md:col-span-3"
					icon={Activity01Icon}
					title="Feed"
					body="Level-ups, first dungeon clears, quests turned in and requests, newest first."
				>
					<ul className="space-y-2 text-[13px]">
						<li>
							<Name of="Brisket" /> reached level <span className="num font-semibold">28</span>
						</li>
						<li>
							<Name of="Pip" /> cleared <span className="font-medium">Deadmines</span> for the first time
						</li>
						<li>
							<Name of="Brenna" /> will craft <ClassText quality="RARE">Spidersilk Boots</ClassText> for{" "}
							<Name of="Ottilie" />
						</li>
						<li className="text-muted-foreground">
							<Name of="Isai" /> turned in <span className="num">2</span> Deadmines quests
						</li>
					</ul>
				</Tile>
				<Tile
					className="md:col-span-3"
					icon={MoneyBag01Icon}
					title="Your bags and banks"
					body="Every bag and bank of all your characters, in one search."
				>
					<div className="flex h-8 items-center gap-2 rounded-md border border-input px-2.5 text-[13px]">
						<HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.75} className="text-muted-foreground" />
						silk
					</div>
					<ul className="mt-2 space-y-1.5 text-[13px]">
						<BagRow file={132905} name="Silk Cloth" count={34} where="Brisket · Bank" />
						<BagRow file={132907} name="Bolt of Silk Cloth" count={6} where="Wren · Bags" />
						<BagRow file={136113} name="Spider's Silk" count={3} where="Brisket · Bags" />
					</ul>
				</Tile>
				<Tile
					className="md:col-span-2"
					icon={ScrollTextIcon}
					title="Quests"
					body="Your quest logs, with guildmates on the same quest."
				>
					<ul className="space-y-1.5 text-[13px]">
						<li className="flex justify-between gap-3">
							<span className="qd-normal truncate">[27] Blackfathom Villainy</span>
							<Name of="Ottilie" className="text-xs" />
						</li>
						<li className="flex justify-between gap-3">
							<span className="qd-easy truncate">[23] Knowledge in the Deeps</span>
							<Name of="Pip" className="text-xs" />
						</li>
						<li className="flex justify-between gap-3">
							<span className="qd-hard truncate">[33] Hearts of Zeal</span>
						</li>
					</ul>
				</Tile>
				<Tile
					className="md:col-span-2"
					icon={Shield01Icon}
					title="Who can use what"
					body="Which classes can wear and wield each type, and who in the guild can use it now or later."
				>
					<div className="flex items-center gap-2.5 text-[13px]">
						<ItemIcon icon={icon(132958)} quality="RARE" size={28} />
						<span>
							Leather <span className="text-muted-foreground">· Hands</span>
						</span>
					</div>
					<p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
						{[1, 2, 3, 4, 11].map((id) => (
							<ClassText key={id} classId={id}>
								{CLASSES[id]?.name}
							</ClassText>
						))}
					</p>
				</Tile>
				<Tile
					className="md:col-span-2"
					icon={SlidersHorizontalIcon}
					title="Your stat priority"
					body="From your talents, or set your own: the stats, and how steep."
				>
					<div className="flex items-center gap-1.5 text-[13px]">
						{["Agility", "Strength", "Stamina"].map((s, i) => (
							<span key={s} className="flex items-center gap-1.5">
								{i > 0 && <span className="text-muted-foreground">›</span>}
								<span className="rounded-md border border-border bg-white/[0.03] px-2 py-0.5">{s}</span>
							</span>
						))}
					</div>
					<div className="mt-2.5 inline-flex rounded-md border border-border p-0.5 text-xs">
						{["Even", "Balanced", "Steep"].map((s) => (
							<span
								key={s}
								className={cn("rounded-sm px-2 py-0.5", s === "Balanced" ? "bg-selected" : "text-muted-foreground")}
							>
								{s}
							</span>
						))}
					</div>
				</Tile>
				<Tile
					className="md:col-span-6"
					icon={SmartPhone01Icon}
					title="On your phone"
					body="The whole site works at phone size, and installs to your home screen like an app."
					row
				>
					<div className="flex gap-3" aria-hidden>
						{PHONES.map((phone) => (
							<div
								key={phone.title}
								className="w-[5.5rem] flex-none overflow-hidden rounded-[12px] border border-border-strong bg-chrome p-1 sm:w-24"
							>
								<div className="mx-auto mb-1.5 h-1 w-6 rounded-full bg-white/10" />
								<div className="px-1 text-[8px] font-semibold">{phone.title}</div>
								<div className="mt-1 space-y-[3px] rounded-[6px] bg-background p-1">
									{phone.rows.map((classId, i) => (
										<div key={i} className="flex items-center gap-1">
											<span
												className="h-1 w-6 rounded-full opacity-80"
												style={{ backgroundColor: CLASSES[classId]?.color }}
											/>
											<span className="h-1 flex-1 rounded-full bg-white/10" />
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</Tile>
			</div>
		</Section>
	);
}

const PHONES = [
	{ title: "Roster", rows: [1, 11, 8, 4, 5, 2, 9, 3] },
	{ title: "Crafting", rows: [8, 11, 4, 8, 1, 5, 9, 11] },
	{ title: "Requests", rows: [1, 4, 3, 11, 8, 2, 5, 9] },
];

function Tile({
	icon: tileIcon,
	title,
	body,
	className,
	row,
	children,
}: {
	icon: IconSvgElement;
	title: string;
	body: string;
	className?: string;
	row?: boolean;
	children: ReactNode;
}) {
	return (
		<Card
			className={cn("flex flex-col p-5", row && "sm:flex-row sm:items-center sm:justify-between sm:gap-8", className)}
		>
			<div className={cn(!row && "mb-5")}>
				<p className="flex items-center gap-2 text-[0.8125rem] font-medium">
					<HugeiconsIcon icon={tileIcon} size={15} strokeWidth={1.75} className="text-muted-foreground" />
					{title}
				</p>
				<p className="mt-1 max-w-sm text-[0.8125rem] text-pretty text-muted-foreground">{body}</p>
			</div>
			<div className={cn(row ? "mt-5 sm:mt-0" : "mt-auto")}>{children}</div>
		</Card>
	);
}

function BagRow({ file, name, count, where }: { file: number; name: string; count: number; where: string }) {
	return (
		<li className="flex items-center gap-2.5">
			<ItemIcon icon={icon(file)} size={22} />
			<span className="flex-1 truncate">
				{name} <span className="num text-muted-foreground">× {count}</span>
			</span>
			<span className="text-xs text-muted-foreground">{where}</span>
		</li>
	);
}

// ---- 9. Open source -----------------------------------------------------------------------

const REPO_TREE = [
	["apps/web", "The site: TanStack Start and Convex"],
	["apps/desktop", "The Windows app (Electron)"],
	["apps/addon", "The in-game addon (Lua)"],
	["apps/mcp", "The MCP server for AI apps"],
	["packages/sync", "Reads and writes the addon's files"],
];

export function OpenSourceSection() {
	return (
		<Section id="open-source" className="pt-28 sm:pt-36">
			<Card className="landing-reveal">
				<div className="grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
					<div>
						<Eyebrow>Open source</Eyebrow>
						<h2 className="heading-display text-fade mt-4 text-3xl sm:text-4xl">Free, and built in the open</h2>
						<p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
							Guildie is free, built by guild members, and open source under the MIT license: the site, the app and the
							addon. Read the code, report a bug, or help build it.
						</p>
						<div className="mt-6 flex flex-wrap gap-2">
							<Button
								size="lg"
								variant="outline"
								nativeButton={false}
								render={<a href={REPO} target="_blank" rel="noreferrer" />}
							>
								<HugeiconsIcon icon={GithubIcon} strokeWidth={1.75} />
								natedunn/guildie
							</Button>
							<Button
								size="lg"
								variant="ghost"
								nativeButton={false}
								render={<a href={`${REPO}/issues/new/choose`} target="_blank" rel="noreferrer" />}
							>
								Report a bug
							</Button>
						</div>
					</div>
					<div
						className="overflow-hidden rounded-lg border border-border bg-chrome font-mono text-[12.5px]"
						aria-hidden
					>
						<div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-muted-foreground">
							<HugeiconsIcon icon={GithubIcon} size={14} strokeWidth={1.75} />
							natedunn/guildie
							<span className="ml-auto rounded-full border border-white/10 px-2 py-px font-sans text-[11px]">MIT</span>
						</div>
						<ul className="divide-y divide-white/[0.04]">
							{REPO_TREE.map(([path, what]) => (
								<li key={path} className="flex gap-4 px-4 py-2.5">
									<span className="w-28 flex-none text-foreground">{path}</span>
									<span className="truncate font-sans text-muted-foreground">{what}</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			</Card>
		</Section>
	);
}

// ---- 10. Closing call -------------------------------------------------------------------------

export function ClosingSection() {
	const inApp = useInDesktopApp();
	return (
		<section className="relative isolate mt-16 overflow-hidden px-4 pt-28 pb-32 text-center sm:mt-24 sm:px-6">
			<div aria-hidden className="grid-lines pointer-events-none absolute inset-0 -z-10 rotate-180" />
			<div
				aria-hidden
				className="glow pointer-events-none absolute inset-x-[15%] bottom-[-14rem] -z-10 h-[26rem] opacity-80"
			/>
			<h2 className="landing-reveal heading-display text-fade mx-auto max-w-3xl text-[2.5rem] sm:text-6xl">
				Bring your guild
			</h2>
			<p className="landing-reveal mx-auto mt-5 max-w-md text-base text-pretty text-muted-foreground">
				Sign in with Battle.net and Guildie finds your guild from your characters. Nothing to set up.
			</p>
			<div className="landing-reveal mt-9 flex flex-wrap items-start justify-center gap-3 [&>span]:items-center [&>span]:text-center">
				<SignInButton className="h-10 px-5" />
				{!inApp && (
					<Button
						size="lg"
						variant="outline"
						className="h-10 bg-white/[0.02] px-5"
						nativeButton={false}
						render={<a href={RELEASES} target="_blank" rel="noreferrer" />}
					>
						<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
						Get the Windows app
					</Button>
				)}
			</div>
		</section>
	);
}
