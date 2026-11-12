import type { ReactNode } from "react";
import { ClassText } from "@/components/class-name";
import { ItemIcon, type ItemLike, ItemTooltipBody } from "@/components/item";
import { cn } from "@/lib/utils";

// Building blocks for the landing page: section headings, framed visuals,
// and the sample guild the visuals show. Every name here is made up; none is
// a real player's.

export const REPO = "https://github.com/natedunn/guildie";
export const icon = (fileId: number) => `https://render.worldofwarcraft.com/forever-us/icons/56/${fileId}.jpg`;

/** The sample guild's members. Alliance, levelling: the shape most Forever guilds have. */
export const MEMBERS = [
	{
		name: "Todd",
		surname: "Ashgrove",
		classId: 1,
		level: 31,
		race: "Human",
		talents: ["Arms 17", "Protection 5"],
		ilvl: 29,
		synced: "12 min ago",
		app: true,
	},
	{
		name: "Brisket",
		surname: "Oakhollow",
		classId: 11,
		level: 28,
		race: "Night Elf",
		talents: ["Feral Combat 19"],
		ilvl: 27,
		synced: "20 min ago",
		app: true,
	},
	{
		name: "Brenna",
		surname: "Copperwick",
		classId: 8,
		level: 27,
		race: "Gnome",
		talents: ["Frost 15", "Arcane 3"],
		ilvl: 26,
		synced: "1 hr ago",
	},
	{
		name: "Pip",
		surname: "Underbough",
		classId: 4,
		level: 26,
		race: "Human",
		talents: ["Combat 14", "Assassination 3"],
		ilvl: 25,
		synced: "3 hr ago",
		app: true,
	},
	{
		name: "Isai",
		surname: "Lightmere",
		classId: 5,
		level: 25,
		race: "Human",
		talents: ["Holy 11", "Discipline 5"],
		ilvl: 23,
		synced: "5 hr ago",
	},
	{
		name: "Corwin",
		surname: "Halebrook",
		classId: 2,
		level: 24,
		race: "Dwarf",
		talents: ["Holy 10", "Retribution 5"],
		ilvl: 22,
		synced: "6 hr ago",
	},
	{
		name: "Ottilie",
		surname: "Vane",
		classId: 9,
		level: 22,
		race: "Gnome",
		talents: ["Affliction 13"],
		ilvl: 20,
		synced: "1 day ago",
	},
	{
		name: "Miller",
		surname: "Thornfield",
		classId: 3,
		level: 17,
		race: "Dwarf",
		talents: ["Beast Mastery 8"],
		ilvl: 16,
		synced: "2 days ago",
	},
	{
		name: "Wren",
		surname: "Mossfeather",
		classId: 11,
		level: 15,
		race: "Night Elf",
		talents: ["Balance 6"],
		ilvl: 14,
		synced: "3 days ago",
	},
	{
		name: "Hollis",
		surname: "Brightforge",
		classId: 1,
		level: 12,
		race: "Dwarf",
		talents: ["Arms 3"],
		ilvl: 10,
		synced: "4 days ago",
	},
] as const;

export type Member = (typeof MEMBERS)[number];
export const member = (name: string) => MEMBERS.find((m) => m.name === name) ?? MEMBERS[0];

/** A name in its class color, as everywhere in Guildie. */
export function Name({ of, surname, className }: { of: string; surname?: boolean; className?: string }) {
	const m = member(of);
	return (
		<span className={className}>
			<ClassText classId={m.classId} className="font-medium">
				{m.name}
			</ClassText>
			{surname && <span className="text-muted-foreground"> {m.surname}</span>}
		</span>
	);
}

/** "Roster", with a small mark in front: the label above a section's heading. */
export function Eyebrow({ color = "var(--muted-foreground)", children }: { color?: string; children: ReactNode }) {
	return (
		<p className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted-foreground">
			<span className="size-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }} />
			{children}
		</p>
	);
}

/** A section's heading: eyebrow, a big fading title, and a line of copy beside it on wide screens. */
export function SectionHead({
	eyebrow,
	color,
	title,
	children,
	className,
}: {
	eyebrow: string;
	color?: string;
	title: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"landing-reveal grid gap-x-16 gap-y-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end",
				className,
			)}
		>
			<div>
				<Eyebrow color={color}>{eyebrow}</Eyebrow>
				<h2 className="heading-display text-fade mt-4 text-[2.25rem] sm:text-5xl">{title}</h2>
			</div>
			<div className="max-w-[30rem] text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground lg:pb-1.5">
				{children}
			</div>
		</div>
	);
}

/** A page section: a wide, centered column. */
export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
	return (
		<section id={id} className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>
			{children}
		</section>
	);
}

/** A framed visual with a hairline that catches the light. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
	return <div className={cn("surface-card overflow-hidden", className)}>{children}</div>;
}

/** A small caption above a visual's content ("Roster · Stat priority"). */
export function CardLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 text-[0.8125rem]">
			<span className="font-medium">{children}</span>
			{right && <span className="text-xs text-muted-foreground">{right}</span>}
		</div>
	);
}

// ---- The addon's tooltip, as the game shows it (apps/addon/Guildie/Tooltip.lua) ----

export type GuildieLine = { name: string; note: string };

/** An item tooltip in game, with the Guildie lines the addon adds under it. */
export function GameTooltip({
	item,
	lines,
	className,
	iconSize = 36,
}: {
	item: ItemLike;
	lines: GuildieLine[];
	className?: string;
	iconSize?: number;
}) {
	return (
		<div className={cn("flex items-start gap-2", className)}>
			<ItemIcon icon={item.icon} quality={item.quality} size={iconSize} />
			<div className="item-tooltip min-w-0 flex-1 px-3 py-2 sm:w-[17.5rem] sm:flex-none">
				<ItemTooltipBody item={item} />
				<div className="mt-3 text-[13px] leading-snug">
					<div className="flex items-center gap-1.5 font-semibold text-[#d9b559]">
						{/* The addon's icon (apps/addon/Guildie/icon.tga), not the site's. */}
						<img src="/landing/addon-icon.svg" alt="" className="size-3.5" />
						Guildie
					</div>
					{lines.map((line) => (
						<div key={line.name} className="flex justify-between gap-6 pl-3">
							<ClassText classId={member(line.name).classId}>{line.name}</ClassText>
							<span className="text-[#a8a8a8]">{line.note}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ---- Items from the game (Blizzard's tooltips, as the sample guild has them) ----

export const SILK: ItemLike = { itemId: 4306, name: "Silk Cloth", quality: "COMMON", icon: icon(132905) };

export const GLOVES: ItemLike = {
	itemId: 4253,
	name: "Toughened Leather Gloves",
	quality: "RARE",
	icon: icon(132958),
	tooltip: [
		{ left: "Binds when equipped" },
		{ left: "Hands", right: "Leather" },
		{ left: "61 Armor" },
		{ left: "+6 Agility" },
		{ left: "+6 Strength" },
		{ left: "+3 Stamina" },
		{ left: "Durability 35 / 35" },
		{ left: "Requires Level 22" },
	],
};
