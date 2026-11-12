import { useState } from "react";
import type { Character } from "@/components/character-data";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { cn } from "@/lib/utils";

// The game's character pane: armor down both sides, weapons along the bottom,
// the character in the middle. Layout switches on the pane's width (container
// queries), not the window's, because the app shell's sidebar takes a share.

const LEFT = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "SHIRT", "TABARD", "WRIST"];
const RIGHT = ["HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2"];

const SLOT_LABELS: Record<string, string> = {
	HEAD: "Head",
	NECK: "Neck",
	SHOULDER: "Shoulder",
	BACK: "Back",
	CHEST: "Chest",
	SHIRT: "Shirt",
	TABARD: "Tabard",
	WRIST: "Wrist",
	HANDS: "Hands",
	WAIST: "Waist",
	LEGS: "Legs",
	FEET: "Feet",
	FINGER_1: "Finger",
	FINGER_2: "Finger",
	TRINKET_1: "Trinket",
	TRINKET_2: "Trinket",
	MAIN_HAND: "Main Hand",
	OFF_HAND: "Off Hand",
	RANGED: "Ranged",
};

const ICON = 44;
// Side columns share the leftover width; the figure gets a fixed band.
const WIDE_COLS = "@2xl:grid-cols-[minmax(0,1fr)_minmax(200px,260px)_minmax(0,1fr)]";

type Item = NonNullable<Character["equipment"]>[number];
// "start": icon on the outer left (left column). "end": icon on the outer
// right (right column, wide only). "center": icon over the name (off hand).
type Align = "start" | "end" | "center";

export function PaperDoll({ character }: { character: Character }) {
	const bySlot = new Map((character.equipment ?? []).map((item) => [item.slot, item]));
	const slot = (name: string, align: Align) => <Slot key={name} slot={name} item={bySlot.get(name)} align={align} />;
	return (
		<div className="@container w-full">
			<div className={cn("grid grid-cols-1 gap-x-4 gap-y-1.5 @md:grid-cols-2", WIDE_COLS)}>
				<div className="flex flex-col gap-1.5">{LEFT.map((s) => slot(s, "start"))}</div>
				<Figure character={character} />
				<div className="flex flex-col gap-1.5">{RIGHT.map((s) => slot(s, "end"))}</div>
			</div>
			<div className={cn("mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1.5 @md:grid-cols-2 @2xl:mt-3", WIDE_COLS)}>
				{slot("MAIN_HAND", "end")}
				{slot("OFF_HAND", "center")}
				{slot("RANGED", "start")}
			</div>
		</div>
	);
}

function Figure({ character }: { character: Character }) {
	const [failed, setFailed] = useState(false);
	const render = !failed && character.renderUrl;
	return (
		// Only on wide panes: on narrow ones the slots need the room more. The
		// page's featured card: lit frame, amber streak along the top. Clipped
		// with clip-path, not overflow-hidden, which would cut off the hairline.
		<div className="surface-card hidden card-clip @2xl:block">
			<span aria-hidden className="streak" />
			{render ? (
				// main-raw is 1600x1200 with the figure in roughly the middle 55%
				// of its height, a little below center. Scale it so the figure
				// spans the column's height and shift it up to center the figure.
				<img
					src={render}
					alt=""
					draggable={false}
					onError={() => setFailed(true)}
					className="pointer-events-none absolute top-[43%] left-1/2 h-[165%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
				/>
			) : character.avatarUrl ? (
				<img
					src={character.avatarUrl}
					alt=""
					className="absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/10 opacity-80"
				/>
			) : null}
		</div>
	);
}

function Slot({ slot, item, align }: { slot: string; item?: Item; align: Align }) {
	// Each alignment applies on wide panes only; narrow panes list every slot
	// icon-first so the two columns read the same way.
	// Rows are only as wide as their content (not the whole column), so an
	// item's tooltip opens beside it rather than over the character.
	const layout = cn(
		"flex min-w-0 max-w-full items-center gap-2.5 self-start justify-self-start text-left",
		align === "end" && "@2xl:flex-row-reverse @2xl:self-end @2xl:justify-self-end @2xl:text-right",
		align === "center" && "@2xl:flex-col @2xl:gap-1 @2xl:self-center @2xl:justify-self-center @2xl:text-center",
	);
	if (!item) {
		return (
			<div className={layout}>
				<ItemIcon empty size={ICON} className="border-dashed border-white/[0.09] bg-white/[0.015]" />
				<span className="truncate text-xs text-muted-foreground/55">{SLOT_LABELS[slot] ?? slot}</span>
			</div>
		);
	}
	return (
		<ItemHover
			item={item}
			side={align === "end" ? "left" : align === "center" ? "top" : "right"}
			className={cn(layout, "group rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring")}
		>
			<ItemIcon icon={item.icon} quality={item.quality} size={ICON} />
			<span className={cn("min-w-0 leading-tight", align === "center" && "@2xl:w-full @2xl:max-w-48")}>
				<span
					className="block truncate text-[13px] font-medium group-hover:underline underline-offset-2"
					style={{ color: QUALITY_COLORS[item.quality ?? "COMMON"] }}
				>
					{item.name}
				</span>
				<span className="num block text-xs text-muted-foreground">
					{item.itemLevel ? `Item level ${item.itemLevel}` : SLOT_LABELS[slot]}
				</span>
			</span>
		</ItemHover>
	);
}
