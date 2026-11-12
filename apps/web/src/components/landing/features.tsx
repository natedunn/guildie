import { dungeonArtUrl } from "@convex/shared/dungeons";
import {
	Calendar03Icon,
	GameController03Icon,
	LayoutTable01Icon,
	RefreshIcon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { ClassText } from "@/components/class-name";
import { DoneMark, DungeonArt } from "@/components/dungeon";
import { ItemIcon, type ItemLike, ItemTooltipBody } from "@/components/item";
import { TalentTree } from "@/components/talent-tree";
import { cn } from "@/lib/utils";
import { Card, CardLabel, GameTooltip, icon, member, Name, Section, SectionHead, SILK } from "./primitives";
import { FERAL_LAYOUT, FERAL_TREE } from "./sample-talents";

// The landing page's feature sections, each a heading and a crafted visual
// built from Guildie's own pieces (ClassText, ItemIcon, the item tooltip,
// TalentTree, DungeonArt) with the sample guild in them.

// ---- 1. Roster ------------------------------------------------------------------------

const PRIORITY = [
	{ name: "Todd", tree: "Arms 17", stats: ["Strength", "Crit", "Hit"] },
	{ name: "Brisket", tree: "Feral Combat 19", stats: ["Agility", "Strength", "Stamina"] },
	{ name: "Brenna", tree: "Frost 15", stats: ["Spell damage", "Intellect", "Hit"] },
	{ name: "Pip", tree: "Combat 14", stats: ["Agility", "Hit", "Crit"] },
	{ name: "Isai", tree: "Holy 11", stats: ["Healing", "Spirit", "Intellect"] },
	{ name: "Corwin", tree: "Holy 10", stats: ["Healing", "Intellect", "Mana per 5"] },
	{ name: "Ottilie", tree: "Affliction 13", stats: ["Spell damage", "Stamina", "Intellect"] },
];

const GEAR_VIEW = [
	{ name: "Todd", wears: "Mail, shields", wields: "Axes, maces, swords", prefers: "Mail" },
	{ name: "Brisket", wears: "Leather", wields: "Staves, maces, daggers", prefers: "Leather" },
	{ name: "Brenna", wears: "Cloth", wields: "Staves, swords, wands", prefers: "Cloth" },
];

export function RosterSection() {
	return (
		<Section id="features" className="pt-20 sm:pt-24">
			<SectionHead eyebrow="Roster" color="#ff7c0a" title="Your roster, always current">
				Every member's level, class, race, rank and talents, synced from Blizzard every hour. Switch the view for stat
				priority, what each character can wear, or professions. Open anyone for their gear and talent trees, laid out as
				in the game.
			</SectionHead>
			<div className="landing-reveal mt-14 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
				<div className="flex flex-col gap-4">
					<Card>
						<CardLabel right="From their main talent tree">Roster · Stat priority</CardLabel>
						<div className="overflow-hidden px-4 pb-2">
							<table className="w-full text-[0.8125rem]">
								<thead className="text-left text-muted-foreground">
									<tr className="border-b border-border">
										<th className="py-2 pr-3 font-medium">Name</th>
										<th className="px-3 py-2 font-medium max-sm:hidden">Talents</th>
										<th className="px-3 py-2 font-medium">1st</th>
										<th className="px-3 py-2 font-medium max-sm:hidden">2nd</th>
										<th className="py-2 pl-3 font-medium max-md:hidden">3rd</th>
									</tr>
								</thead>
								<tbody>
									{PRIORITY.map((p) => (
										<tr key={p.name} className="border-b border-white/5 last:border-0">
											<td className="py-2 pr-3 whitespace-nowrap">
												<Name of={p.name} />
											</td>
											<td className="num px-3 whitespace-nowrap max-sm:hidden">{p.tree}</td>
											<td className="px-3 whitespace-nowrap">{p.stats[0]}</td>
											<td className="px-3 whitespace-nowrap text-muted-foreground max-sm:hidden">{p.stats[1]}</td>
											<td className="pl-3 whitespace-nowrap text-muted-foreground max-md:hidden">{p.stats[2]}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Card>
					<Card className="flex-1">
						<CardLabel right="At their level">Roster · Gear</CardLabel>
						<div className="overflow-hidden px-4 pb-2">
							<table className="w-full text-[0.8125rem]">
								<thead className="text-left text-muted-foreground">
									<tr className="border-b border-border">
										<th className="py-2 pr-3 font-medium">Name</th>
										<th className="px-3 py-2 font-medium">Wears</th>
										<th className="px-3 py-2 font-medium max-sm:hidden">Wields</th>
										<th className="py-2 pl-3 font-medium max-md:hidden">Prefers armor</th>
									</tr>
								</thead>
								<tbody>
									{GEAR_VIEW.map((g) => (
										<tr key={g.name} className="border-b border-white/5 last:border-0">
											<td className="py-2 pr-3 whitespace-nowrap">
												<Name of={g.name} />
											</td>
											<td className="px-3 whitespace-nowrap">{g.wears}</td>
											<td className="px-3 text-muted-foreground max-sm:hidden">{g.wields}</td>
											<td className="pl-3 whitespace-nowrap text-muted-foreground max-md:hidden">{g.prefers}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Card>
				</div>
				<Card>
					<CardLabel right="Hover a talent">
						<Name of="Brisket" surname /> · Talents
					</CardLabel>
					<div className="flex justify-center p-4 [&_section]:w-full [&_section]:max-w-[17rem] [&_section]:bg-transparent">
						<TalentTree layout={FERAL_LAYOUT} tree={FERAL_TREE} />
					</div>
				</Card>
			</div>
			<Facts
				items={[
					{
						icon: RefreshIcon,
						title: "Synced every hour",
						body: "From Blizzard's API, as of each character's last logout. Or sync by hand.",
					},
					{
						icon: LayoutTable01Icon,
						title: "Four views",
						body: "Overview, stat priority, gear and professions, with class filters.",
					},
					{
						icon: GameController03Icon,
						title: "Fresher with the app",
						body: "Characters synced in game show it, minutes old instead of a logout old.",
					},
				]}
			/>
		</Section>
	);
}

function Facts({ items }: { items: { icon: IconSvgElement; title: string; body: string }[] }) {
	return (
		<ul className="landing-reveal mt-10 grid gap-x-10 gap-y-6 text-[0.8125rem] sm:grid-cols-3">
			{items.map((f) => (
				<li key={f.title} className="border-l border-white/10 pl-4">
					<p className="flex items-center gap-2 font-medium">
						<HugeiconsIcon icon={f.icon} size={15} strokeWidth={1.75} className="text-muted-foreground" />
						{f.title}
					</p>
					<p className="mt-1 text-pretty text-muted-foreground">{f.body}</p>
				</li>
			))}
		</ul>
	);
}

// ---- 2. Gear --------------------------------------------------------------------------

const BREASTPLATE: ItemLike = {
	itemId: 2870,
	name: "Shining Silver Breastplate",
	quality: "RARE",
	icon: icon(132750),
	tooltip: [
		{ left: "Binds when equipped" },
		{ left: "Chest", right: "Mail" },
		{ left: "214 Armor" },
		{ left: "+14 Strength" },
		{ left: "+6 Stamina" },
		{ left: "Durability 120 / 120" },
		{ left: "Requires Level 24" },
	],
};

const UPGRADES = [
	{ name: "Todd", spec: "Arms", verdict: "Upgrade", why: "+14 Strength, +6 Stamina over Rough Bronze Cuirass" },
	{ name: "Corwin", spec: "Holy", verdict: "Trade-off", why: "+14 Strength, −5 Intellect over Guard's Chain Shirt" },
	{
		name: "Hollis",
		spec: "Arms",
		verdict: "Maybe, at lvl 24",
		why: "+14 Strength over Rough Copper Vest",
		quiet: true,
	},
];

export function GearSection() {
	return (
		<Section className="pt-28 sm:pt-36">
			<SectionHead eyebrow="Gear and upgrades" color="#0070dd" title="Know who an item is for">
				Every item shows which guildmates it would be an upgrade for, by their stat priority and what they wear now.
				Players can set their own priority and preferred armor. A best guess, not a sim, and it's the same on the site
				and in game.
			</SectionHead>
			<Card className="landing-reveal mt-14">
				<div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
					<div className="relative flex items-center justify-center overflow-hidden border-b border-border px-6 py-12 lg:border-r lg:border-b-0">
						<div
							aria-hidden
							className="pointer-events-none absolute inset-0"
							style={{ background: "radial-gradient(closest-side, rgb(0 112 221 / 0.16), transparent)" }}
						/>
						<div className="relative flex items-start gap-2">
							<ItemIcon icon={BREASTPLATE.icon} quality={BREASTPLATE.quality} size={44} />
							<div className="item-tooltip px-3 py-2">
								<ItemTooltipBody item={BREASTPLATE} />
							</div>
						</div>
					</div>
					<div className="p-5 sm:p-6">
						<p className="text-[0.8125rem] font-semibold">Who can make it</p>
						<div className="mt-2 flex items-center gap-3 rounded-md border border-border px-3 py-2 text-[13px]">
							<span className="text-muted-foreground">Blacksmithing</span>
							<Name of="Hollis" />
							<span className="ml-auto flex -space-x-1">
								{[133227, 134105, 134087, 134121, 133215].map((f) => (
									<ItemIcon key={f} icon={icon(f)} size={20} className="ring-1 ring-background" />
								))}
							</span>
						</div>
						<p className="mt-5 text-[0.8125rem] font-semibold">Upgrade for</p>
						<div className="mt-2 divide-y divide-border rounded-md border border-border">
							{UPGRADES.map((u) => {
								const m = member(u.name);
								return (
									<div key={u.name} className="space-y-0.5 px-3 py-2 text-[13px]">
										<div className="flex items-baseline gap-2">
											<ClassText classId={m.classId} className="font-medium">
												{m.name}
											</ClassText>
											<span className="text-xs text-muted-foreground">
												<span className="num">{m.level}</span> {u.spec}
											</span>
											<span className={cn("ml-auto text-xs", u.quiet && "text-muted-foreground")}>{u.verdict}</span>
										</div>
										<p className="text-xs text-muted-foreground">{u.why}</p>
									</div>
								);
							})}
						</div>
						<p className="mt-3 text-xs text-muted-foreground">
							A best guess from stat weights and what they wear, not a sim.
						</p>
					</div>
				</div>
			</Card>
		</Section>
	);
}

// ---- 3. Crafting and requests ---------------------------------------------------------------

type Recipe = { item: ItemLike; profession: string; crafters: string[]; reagents: [number, number][] };

const RECIPES: Recipe[] = [
	{
		item: { itemId: 4320, name: "Spidersilk Boots", quality: "RARE", icon: icon(132539) },
		profession: "Tailoring",
		crafters: ["Brenna"],
		reagents: [
			[132907, 2],
			[134254, 4],
			[136113, 4],
			[134121, 1],
		],
	},
	{
		item: { itemId: 4253, name: "Toughened Leather Gloves", quality: "RARE", icon: icon(132958) },
		profession: "Leatherworking",
		crafters: ["Brisket", "Pip"],
		reagents: [
			[134254, 4],
			[134354, 2],
			[134844, 2],
			[136113, 2],
		],
	},
	{
		item: { itemId: 6242, name: "Azure Silk Vest", quality: "UNCOMMON", icon: icon(132678) },
		profession: "Tailoring",
		crafters: ["Brenna", "Isai"],
		reagents: [
			[132907, 5],
			[134776, 4],
		],
	},
	{
		item: { itemId: 3851, name: "Guard's Chain Shirt", quality: "RARE", icon: icon(132631) },
		profession: "Blacksmithing",
		crafters: ["Hollis"],
		reagents: [
			[133227, 4],
			[135243, 2],
			[134074, 2],
		],
	},
];

export function CraftingSection() {
	return (
		<Section className="pt-28 sm:pt-36">
			<SectionHead eyebrow="Crafting and requests" color="#1eff00" title="Who can make it, and who's on it">
				Every recipe anyone in the guild knows, with reagents, and what the guild could craft that's an upgrade for you.
				Need something? Ask the guild. A guildmate claims it, and you mark it done.
			</SectionHead>
			<div className="landing-reveal mt-14 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
				<Card>
					<CardLabel right="342 recipes">Crafting</CardLabel>
					<div className="p-4">
						<div className="flex h-8 items-center gap-2 rounded-md border border-input px-2.5 text-[0.8125rem] text-muted-foreground">
							<HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.75} />
							Search recipes, items, reagents
						</div>
						<ul className="mt-3 divide-y divide-border">
							{RECIPES.map((r) => (
								<li key={r.item.name} className="flex items-center gap-3 py-2.5">
									<ItemIcon icon={r.item.icon} quality={r.item.quality} size={34} />
									<div className="min-w-0 flex-1 text-[13px]">
										<ClassText quality={r.item.quality} className="block truncate font-medium">
											{r.item.name}
										</ClassText>
										<span className="text-xs text-muted-foreground">
											{r.profession} ·{" "}
											{r.crafters.map((c, i) => (
												<span key={c}>
													{i > 0 && ", "}
													<Name of={c} />
												</span>
											))}
										</span>
									</div>
									<span className="flex flex-none gap-1 max-sm:hidden">
										{r.reagents.map(([f, n]) => (
											<span key={f} className="relative">
												<ItemIcon icon={icon(f)} size={24} />
												<span className="num absolute -right-1 -bottom-1 rounded-[3px] bg-chrome/90 px-[3px] text-[10px] leading-[13px]">
													{n}
												</span>
											</span>
										))}
									</span>
								</li>
							))}
						</ul>
					</div>
				</Card>
				<Card>
					<CardLabel right="3 you could fill">Requests</CardLabel>
					<ul className="divide-y divide-border">
						<Request
							who="Todd"
							item={SILK}
							what={
								<>
									<span className="num">20</span> × Silk Cloth
								</>
							}
							status={
								<>
									Claimed by <Name of="Brenna" /> · 2 hr ago
								</>
							}
							actions={["Got it, mark done"]}
						/>
						<Request
							who="Pip"
							item={RECIPES[1].item}
							what={<ClassText quality="RARE">Toughened Leather Gloves</ClassText>}
							note="Crafted"
							status="Not claimed yet"
							actions={["Claim"]}
							highlight
						/>
						<Request
							who="Miller"
							item={{ itemId: 2589, name: "Linen Cloth", quality: "COMMON", icon: icon(132889) }}
							what={
								<>
									<span className="num">40</span> × Linen Cloth
								</>
							}
							status="Done · yesterday"
							done
						/>
					</ul>
				</Card>
			</div>
		</Section>
	);
}

function Request({
	who,
	item,
	what,
	note,
	status,
	actions = [],
	highlight,
	done,
}: {
	who: string;
	item: ItemLike;
	what: ReactNode;
	note?: string;
	status: ReactNode;
	actions?: string[];
	highlight?: boolean;
	done?: boolean;
}) {
	return (
		<li className={cn("flex gap-3 px-4 py-3.5 text-[13px]", highlight && "bg-white/[0.025]", done && "opacity-60")}>
			<ItemIcon icon={item.icon} quality={item.quality} size={30} />
			<div className="min-w-0 flex-1">
				<p>
					<Name of={who} /> <span className="text-muted-foreground">wants</span> {what}
				</p>
				{note && <p className="text-xs text-muted-foreground">{note}</p>}
				<p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
					{done && <DoneMark label="Done" className="size-3.5" iconSize={8} />}
					{status}
				</p>
				{actions.length > 0 && (
					<div className="mt-2 flex gap-1.5">
						{actions.map((a) => (
							<span
								key={a}
								className="inline-flex h-6 items-center rounded-sm border border-input px-2 text-xs font-medium"
							>
								{a}
							</span>
						))}
					</div>
				)}
			</div>
		</li>
	);
}

// ---- 4. Dungeons ----------------------------------------------------------------------

const DUNGEONS = [
	{ key: "deadmines", name: "Deadmines", level: 16, levelReady: 8, questReady: 5, done: true },
	{ key: "shadowfang-keep", name: "Shadowfang Keep", level: 18, levelReady: 7, questReady: 2 },
	{ key: "blackfathom-deeps", name: "Blackfathom Deeps", level: 22, levelReady: 5, questReady: 3 },
];

export function DungeonsSection() {
	return (
		<Section className="pt-28 sm:pt-36">
			<SectionHead eyebrow="Dungeons" color="#e3bd5a" title="Dungeon ready, and quest ready">
				For each dungeon, who's the level for it and who has its quests, plus every quest chain that leads there, and
				the ones that start inside. View it as any guildmate to plan the run.
			</SectionHead>
			<div className="landing-reveal mt-14 grid gap-4 md:grid-cols-3">
				{DUNGEONS.map((d) => (
					<Card key={d.key} className="group">
						<div className="relative">
							<DungeonArt
								src={dungeonArtUrl(d.key)}
								className="aspect-[2/1] transition-transform duration-700 group-hover:scale-[1.03]"
							/>
							<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgb(26_24_21/0.85)] via-transparent to-transparent" />
						</div>
						<div className="px-4 py-3">
							<div className="flex items-baseline gap-2">
								<span className="truncate text-base font-semibold">{d.name}</span>
								<span className="num text-xs text-muted-foreground">lvl {d.level}</span>
								{d.done && <DoneMark label="Cleared" className="ml-auto self-center" />}
							</div>
							<p className="num mt-1.5 text-xs text-muted-foreground">
								<span className="text-foreground">{d.levelReady}</span> level ready ·{" "}
								<span className="text-foreground">{d.questReady}</span> quest ready
							</p>
						</div>
					</Card>
				))}
			</div>
			<Card className="landing-reveal mt-4">
				<div className="grid gap-x-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
					<div className="p-4 sm:p-5">
						<p className="flex items-center justify-between text-[0.8125rem] font-medium">
							Deadmines quests
							<span className="text-xs font-normal text-muted-foreground">
								Viewing as <Name of="Pip" />
							</span>
						</p>
						<ol className="mt-3 space-y-2 text-[13px]">
							<QuestRow title="Red Silk Bandanas" done />
							<QuestRow title="The Defias Brotherhood" note="Chain, step 5 of 7" active />
							<QuestRow title="The Unsent Letter" note="Starts inside" />
						</ol>
					</div>
					<div className="border-t border-border p-4 sm:p-5 md:border-t-0 md:border-l">
						<p className="text-[0.8125rem] font-medium">Ready for it</p>
						<ul className="mt-3 flex flex-wrap gap-1.5 text-[13px]">
							{["Todd", "Brisket", "Brenna", "Pip", "Isai", "Corwin", "Ottilie", "Miller"].map((n, i) => (
								<li
									key={n}
									className={cn(
										"rounded-md border border-border px-2 py-1",
										i < 5 ? "bg-white/[0.03]" : "text-muted-foreground",
									)}
								>
									<Name of={n} />
									{i < 5 && <span className="ml-1.5 text-xs text-muted-foreground">quests</span>}
								</li>
							))}
						</ul>
					</div>
				</div>
			</Card>
		</Section>
	);
}

function QuestRow({ title, note, done, active }: { title: string; note?: string; done?: boolean; active?: boolean }) {
	return (
		<li className="flex items-start gap-2.5">
			{done ? (
				<DoneMark label="Turned in" className="mt-0.5" />
			) : (
				<span
					className={cn(
						"mt-0.5 size-4 flex-none rounded-full border",
						active ? "border-done/70 bg-done/10" : "border-white/15",
					)}
				/>
			)}
			<span className="min-w-0">
				<span className={cn("block", done && "text-muted-foreground line-through decoration-white/20")}>{title}</span>
				{note && <span className="block text-xs text-muted-foreground">{note}</span>}
			</span>
		</li>
	);
}

// ---- 5. The addon -----------------------------------------------------------------------

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

export function AddonSection() {
	return (
		<Section id="addon" className="pt-28 sm:pt-36">
			<SectionHead eyebrow="In-game addon" color="#d9b559" title="Your guild, on your tooltips">
				The Guildie addon adds a few lines to item tooltips in game: who it's an upgrade for, who's requesting it, and
				who needs it as a reagent. It comes with the Windows app, which keeps its guild data current.
			</SectionHead>
			<Card className="landing-reveal mt-14">
				<div className="relative overflow-hidden">
					{/* Game art, dimmed and soft, as the "screen" behind the tooltips. */}
					<div aria-hidden className="absolute inset-0">
						<img
							src={dungeonArtUrl("wailing-caverns")}
							alt=""
							loading="lazy"
							className="size-full scale-110 object-cover opacity-50 blur-[2px]"
						/>
						<div className="absolute inset-0 bg-gradient-to-r from-[rgb(19_17_14/0.9)] via-[rgb(19_17_14/0.45)] to-[rgb(19_17_14/0.85)]" />
					</div>
					<div className="relative grid gap-8 px-5 py-10 sm:px-10 sm:py-14 md:grid-cols-2 md:gap-6">
						<GameTooltip
							item={CLOAK}
							className="md:justify-self-end"
							lines={[
								{ name: "Brisket", note: "upgrade (Feral)" },
								{ name: "Pip", note: "trade-off (Agi/Str)" },
								{ name: "Miller", note: "maybe (lvl 17)" },
							]}
						/>
						<GameTooltip
							item={SILK}
							className="md:mt-24"
							lines={[
								{ name: "Todd", note: "requesting 20" },
								{ name: "Brenna", note: "might want (Tailoring)" },
								{ name: "Isai", note: "might want (First Aid)" },
							]}
						/>
					</div>
				</div>
			</Card>
			<Facts
				items={[
					{
						icon: Calendar03Icon,
						title: "Saves as you play",
						body: "Gear, bags, banks, quests and recipes, read from the game. Your guild sees them after a /reload.",
					},
					{
						icon: RefreshIcon,
						title: "Guild data, kept current",
						body: "The app writes your guild's data into the addon every 15 minutes.",
					},
					{
						icon: GameController03Icon,
						title: "Installed for you",
						body: "The app puts the addon in your WoW: Forever folder and updates it.",
					},
				]}
			/>
		</Section>
	);
}
