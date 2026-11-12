import { api } from "@convex/_generated/api";
import { REGIONS, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type ReactNode, useState } from "react";
import { ClassText } from "@/components/class-name";
import { ItemIcon, type ItemLike, ItemTooltipBody } from "@/components/item";
import { Page, PageHeader, SectionTitle } from "@/components/page-header";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RELEASES, useInDesktopApp } from "@/lib/desktop";

// No home page for signed-in players: "/" opens your guild (the sidebar
// switches between guilds). It shows a page only to signed-out visitors (what
// Guildie is, and sign in), and to players whose guild Guildie hasn't found
// yet (characters under level 10, or not logged out since joining).
export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		const viewer = await context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}));
		const first = viewer?.guilds[0];
		if (first)
			throw redirect({ to: "/g/$region/$slug", params: { region: first.region, slug: first.slug }, replace: true });
	},
	component: Home,
});

function Home() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) return <Welcome />;
	return (
		<Page width="medium">
			<PageHeader
				title="No guild found yet"
				description="Guildie finds your guild from your characters. A character shows up once it's level 10 and has logged out since joining the guild; then sign out and in again. Or add your guild."
			/>
			<AddGuild />
		</Page>
	);
}

const REPO = "https://github.com/natedunn/guildie";
const icon = (fileId: number) => `https://render.worldofwarcraft.com/forever-us/icons/56/${fileId}.jpg`;

// ---- Signed out: what Guildie is -----------------------------------------------------

function Welcome() {
	return (
		<div className="@container max-w-5xl pb-16">
			<Hero />
			<RosterPreview />
			<Features />
			<WindowsApp />
			<OpenSource />
		</div>
	);
}

function Hero() {
	const inApp = useInDesktopApp();
	return (
		<section className="grid items-center gap-x-12 gap-y-10 pt-10 pb-12 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] @3xl:pt-16">
			<div className="min-w-0">
				<p className="text-[0.8125rem] text-muted-foreground">For WoW: Forever guilds</p>
				<h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
					Your guild's roster, gear and crafters, in one place.
				</h1>
				<p className="mt-3 max-w-[34rem] text-sm text-pretty text-muted-foreground">
					Guildie reads your guild from Blizzard's API and keeps it current: who's in it, what they wear, their talents
					and what they can craft. Ask the guild for things, see who's ready for which dungeon, and get guild hints on
					item tooltips in game.
				</p>
				<div className="mt-6 flex flex-wrap items-start gap-2">
					<SignInButton />
					{!inApp && (
						<Button size="lg" variant="outline" render={<a href={RELEASES} target="_blank" rel="noreferrer" />}>
							Get the Windows app
						</Button>
					)}
				</div>
				<p className="mt-5 text-[0.8125rem] text-muted-foreground">
					Free and open source.{" "}
					<a
						href={REPO}
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-4 hover:text-foreground"
					>
						github.com/natedunn/guildie
					</a>
				</p>
			</div>
			<HeroTooltips />
		</section>
	);
}

// ---- The addon's tooltips, as the game shows them (apps/addon/Guildie/Tooltip.lua) ----

const CLOAK: ItemLike = {
	itemId: 2316,
	name: "Dark Leather Cloak",
	quality: "UNCOMMON",
	icon: icon(133762),
	tooltip: [
		{ left: "Binds when equipped" },
		{ left: "Back" },
		{ left: "18 Armor" },
		{ left: "+3 Agility" },
		{ left: "+2 Strength" },
		{ left: "Requires Level 17" },
	],
};

const SILK: ItemLike = { itemId: 4306, name: "Silk Cloth", quality: "COMMON", icon: icon(132905) };

type GuildieRow = { name: string; classId: number; note: string };

function HeroTooltips() {
	return (
		<figure className="min-w-0" aria-label="Item tooltips in game, with Guildie's lines">
			<div className="flex flex-col gap-4 @3xl:gap-5">
				<GameTooltip
					item={CLOAK}
					rows={[
						{ name: "Brisket", classId: 11, note: "upgrade (Feral)" },
						{ name: "Pip", classId: 4, note: "upgrade (Combat)" },
						{ name: "Miller", classId: 3, note: "maybe (lvl 17)" },
					]}
				/>
				<GameTooltip
					item={SILK}
					className="@3xl:ml-8"
					rows={[
						{ name: "Todd", classId: 1, note: "requesting 20" },
						{ name: "Brenna", classId: 8, note: "might want (Tailoring)" },
						{ name: "Isai", classId: 5, note: "might want (First Aid)" },
					]}
				/>
			</div>
			<figcaption className="mt-4 text-[0.8125rem] text-muted-foreground">
				In game, with the addon: who an item would help, and who's asking for it.
			</figcaption>
		</figure>
	);
}

function GameTooltip({ item, rows, className }: { item: ItemLike; rows: GuildieRow[]; className?: string }) {
	return (
		<div className={`flex items-start gap-2 ${className ?? ""}`} aria-hidden>
			<ItemIcon icon={item.icon} quality={item.quality} size={36} />
			<div className="item-tooltip min-w-0 flex-1 px-3 py-2 @3xl:w-[17.5rem] @3xl:flex-none">
				<ItemTooltipBody item={item} />
				<div className="mt-3 text-[13px] leading-snug">
					<div className="font-semibold text-[#d9b559]">Guildie</div>
					{rows.map((row) => (
						<div key={row.name} className="flex justify-between gap-6 pl-3">
							<ClassText classId={row.classId}>{row.name}</ClassText>
							<span className="text-[#a8a8a8]">{row.note}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ---- A roster, as the site shows it -------------------------------------------------

const ROSTER = [
	{ name: "Todd", classId: 1, level: 30, race: "Human", talents: "Arms 21 · Protection 5", seen: "2h" },
	{ name: "Brisket", classId: 11, level: 28, race: "Night Elf", talents: "Feral 23 · Restoration 3", seen: "20m" },
	{ name: "Brenna", classId: 8, level: 26, race: "Gnome", talents: "Frost 19 · Arcane 5", seen: "1d" },
	{ name: "Pip", classId: 4, level: 24, race: "Dwarf", talents: "Combat 15 · Assassination 6", seen: "5h" },
	{ name: "Isai", classId: 5, level: 21, race: "Human", talents: "Holy 12 · Discipline 7", seen: "3d" },
];

function RosterPreview() {
	return (
		<section aria-label="A guild roster on Guildie" className="overflow-hidden rounded-md border border-border">
			<div className="flex items-center justify-between gap-4 border-b border-border bg-surface px-3 py-2 text-[0.8125rem]">
				<span className="font-semibold">Roster</span>
				<span className="text-muted-foreground">Synced from Blizzard every hour</span>
			</div>
			<table className="w-full text-[0.8125rem]">
				<thead className="text-left text-muted-foreground">
					<tr className="border-b border-border">
						<th className="px-3 py-1.5 font-medium">Name</th>
						<th className="px-3 py-1.5 text-right font-medium">Level</th>
						<th className="hidden px-3 py-1.5 font-medium @xl:table-cell">Race</th>
						<th className="hidden px-3 py-1.5 font-medium @md:table-cell">Talents</th>
						<th className="px-3 py-1.5 text-right font-medium">Last seen</th>
					</tr>
				</thead>
				<tbody>
					{ROSTER.map((c) => (
						<tr key={c.name} className="border-b border-border last:border-0">
							<td className="px-3 py-1.5 font-medium">
								<ClassText classId={c.classId}>{c.name}</ClassText>
							</td>
							<td className="num px-3 py-1.5 text-right">{c.level}</td>
							<td className="hidden px-3 py-1.5 text-muted-foreground @xl:table-cell">{c.race}</td>
							<td className="hidden px-3 py-1.5 text-muted-foreground @md:table-cell">{c.talents}</td>
							<td className="num px-3 py-1.5 text-right text-muted-foreground">{c.seen}</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

// ---- What's in it -------------------------------------------------------------------

type Feature = { title: string; body: ReactNode; art: number; quality?: string };

const FEATURES: Feature[] = [
	{
		title: "Roster",
		art: 134949,
		quality: "RARE",
		body: "Every member's level, class, race, rank and last seen, with views for talents and stat priority.",
	},
	{
		title: "Gear and upgrades",
		art: 132750,
		quality: "RARE",
		body: "Each character's gear as a paper doll, and which guildmates an item would be an upgrade for. Set your own stat priority.",
	},
	{
		title: "Talents",
		art: 132190,
		body: "Each character's three talent trees, laid out as in the game.",
	},
	{
		title: "Crafting",
		art: 132907,
		body: "Who can make it: every recipe anyone in the guild knows, with reagents, and what the guild could craft that's an upgrade for you.",
	},
	{
		title: "Requests",
		art: 132905,
		body: "Ask the guild for an item or a craft. A guildmate claims it, and you mark it done.",
	},
	{
		title: "Dungeons",
		art: 133760,
		quality: "RARE",
		body: "Who's level ready and quest ready for each dungeon, and every quest chain that leads there.",
	},
	{
		title: "Feed",
		art: 133739,
		quality: "UNCOMMON",
		body: "Level-ups, first dungeon clears, quests turned in and requests, newest first.",
	},
	{
		title: "Who can use what",
		art: 132417,
		quality: "RARE",
		body: "Which class can wear and wield each type, and which guildmates can use it now or later.",
	},
	{
		title: "Your bags and quests",
		art: 133639,
		body: "Every bag and bank of your characters in one search, and your quest logs, with guildmates on the same quest.",
	},
	{
		title: "In-game tooltips",
		art: 133762,
		quality: "UNCOMMON",
		body: "The addon adds guild hints to item tooltips: who's requesting it, who needs the reagent, who it's an upgrade for.",
	},
	{
		title: "AI apps",
		art: 134333,
		quality: "UNCOMMON",
		body: "Connect Claude, ChatGPT or another MCP app, and ask it about your guild: who can craft what, what's open. Experimental.",
	},
];

function Features() {
	return (
		<section className="mt-14">
			<SectionTitle>What's in it</SectionTitle>
			<ul className="mt-3 grid gap-px overflow-hidden rounded-md border border-border bg-border @xl:grid-cols-2 @4xl:grid-cols-3">
				{FEATURES.map((f) => (
					<li key={f.title} className="flex gap-3 bg-background p-4">
						<ItemIcon icon={icon(f.art)} quality={f.quality} size={36} />
						<div className="min-w-0">
							<h3 className="text-[0.8125rem] font-semibold">{f.title}</h3>
							<p className="mt-0.5 text-[0.8125rem] text-pretty text-muted-foreground">{f.body}</p>
						</div>
					</li>
				))}
				{/* Fill the last row so the grid has no gap in its border. */}
				<li aria-hidden className="hidden bg-background @xl:block" />
			</ul>
		</section>
	);
}

// ---- The Windows app -----------------------------------------------------------------

function WindowsApp() {
	const inApp = useInDesktopApp();
	return (
		<section className="mt-14 grid gap-x-12 gap-y-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<div>
				<SectionTitle>Guildie for Windows</SectionTitle>
				<p className="mt-1 text-[0.8125rem] text-pretty text-muted-foreground">
					Blizzard updates a character only when they log out, and never sees bags or banks. The app fills that in: it
					uploads what the addon saves in game, so your guild sees your changes after a /reload.
				</p>
				{inApp ? (
					<p className="mt-4 text-[0.8125rem] text-muted-foreground">You're in it. Sign in to connect it.</p>
				) : (
					<div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
						<Button variant="outline" render={<a href={RELEASES} target="_blank" rel="noreferrer" />}>
							Download Guildie-Setup.exe
						</Button>
						<span className="text-[0.8125rem] text-muted-foreground">Free, from GitHub</span>
					</div>
				)}
			</div>
			<ul className="divide-y divide-border rounded-md border border-border text-[0.8125rem]">
				<AppFact title="The site in its own window">Everything here, without a browser tab.</AppFact>
				<AppFact title="Installs the addon">And keeps it up to date in your WoW folder.</AppFact>
				<AppFact title="Uploads as you play">Gear, bags, banks and quests, from the addon's saved data.</AppFact>
				<AppFact title="Updates itself">New versions download in the background.</AppFact>
			</ul>
		</section>
	);
}

function AppFact({ title, children }: { title: string; children: ReactNode }) {
	return (
		<li className="px-3 py-2">
			<span className="font-medium">{title}</span>
			<span className="text-muted-foreground"> · {children}</span>
		</li>
	);
}

// ---- Open source ---------------------------------------------------------------------

function OpenSource() {
	return (
		<section className="mt-14 border-t border-border pt-6 text-[0.8125rem]">
			<div className="grid gap-x-12 gap-y-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<div>
					<SectionTitle>Free and open source</SectionTitle>
					<p className="mt-1 text-pretty text-muted-foreground">
						Guildie is free, built by guild members, and open source under the MIT license: the site, the app and the
						addon. Read the code, report a bug or help build it.
					</p>
					<p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
						<a href={REPO} target="_blank" rel="noreferrer" className="underline underline-offset-4">
							github.com/natedunn/guildie
						</a>
						<a
							href={`${REPO}/issues/new/choose`}
							target="_blank"
							rel="noreferrer"
							className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
						>
							Report a bug
						</a>
						<Link to="/data" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
							Where the data comes from
						</Link>
					</p>
				</div>
				<div>
					<SectionTitle>Signing in</SectionTitle>
					<p className="mt-1 text-pretty text-muted-foreground">
						With your Battle.net account. Guildie learns your BattleTag and your character list, which is how it finds
						your guild. It doesn't keep Battle.net's tokens.
					</p>
					<div className="mt-3">
						<SignInButton size="default" />
					</div>
				</div>
			</div>
		</section>
	);
}

// ---- Signed in, no guild yet --------------------------------------------------------

function AddGuild() {
	const add = useMutation(api.guilds.add);
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [region, setRegion] = useState<Region>("us");
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			onSubmit={async (e) => {
				e.preventDefault();
				setError(null);
				try {
					const params = await add({ name, region });
					await navigate({ to: "/g/$region/$slug", params });
				} catch (err) {
					setError(err instanceof ConvexError ? String(err.data) : "Couldn't add that guild.");
				}
			}}
		>
			<label htmlFor="guild-name" className="text-[0.8125rem] font-medium">
				Not on Guildie yet? Add it
			</label>
			<div className="mt-1.5 flex gap-2">
				<select
					aria-label="Region"
					value={region}
					onChange={(e) => setRegion(e.target.value as Region)}
					className="h-8 rounded-md border px-1.5 text-[0.8125rem] pointer-coarse:h-10"
				>
					{REGIONS.map((r) => (
						<option key={r} value={r}>
							{r.toUpperCase()}
						</option>
					))}
				</select>
				<Input
					id="guild-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Guild name, exactly as in game"
				/>
				<Button type="submit" disabled={!name.trim()}>
					Add
				</Button>
			</div>
			{error && <p className="mt-2 text-sm text-destructive">{error}</p>}
		</form>
	);
}
