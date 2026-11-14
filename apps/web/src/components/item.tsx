import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Items as the game shows them: a square icon with a quality-colored edge,
// and a tooltip built from Blizzard's display strings (convex/items.ts).

export type TooltipLine = { left: string; right?: string; color?: string };

export type ItemLike = {
	itemId: number;
	name: string;
	quality?: string;
	icon?: string;
	tooltip?: TooltipLine[];
	/** Shown at the top right of the tooltip ("Item Level 37"). */
	itemLevel?: number;
};

export const QUALITY_COLORS: Record<string, string> = {
	POOR: "#9d9d9d",
	COMMON: "#ffffff",
	UNCOMMON: "#1eff00",
	RARE: "#0070dd",
	EPIC: "#a335ee",
	LEGENDARY: "#ff8000",
	ARTIFACT: "#e6cc80",
	HEIRLOOM: "#00ccff",
};

export const wowheadItemUrl = (itemId: number) => `https://www.wowhead.com/forever/item=${itemId}`;

/** A square item icon. Common and poor items get a neutral edge, like the game. */
/**
 * Enchants make no item, so they have no icon of their own here: they get
 * the Enchanting profession's (trade_engraving), a Blizzard render.
 */
export const ENCHANT_ICON = "https://render.worldofwarcraft.com/forever-us/icons/56/136244.jpg";
/** A craft with no item: an enchant, by profession or name. */
export const isEnchant = (craft: { profession?: string; name?: string }) =>
	craft.profession === "Enchanting" || !!craft.name?.startsWith("Enchant ");

export function ItemIcon({
	icon,
	quality,
	size = 40,
	className,
	empty,
}: {
	icon?: string;
	quality?: string;
	size?: number;
	className?: string;
	/** Render an empty slot (no item). */
	empty?: boolean;
}) {
	const edge = quality && quality !== "COMMON" && quality !== "POOR" ? QUALITY_COLORS[quality] : undefined;
	return (
		<span
			className={cn(
				"relative inline-block shrink-0 overflow-hidden rounded-[4px] border bg-black/40",
				edge ? "border-[var(--edge)]" : "border-white/10",
				className,
			)}
			style={{ width: size, height: size, "--edge": edge } as CSSProperties}
		>
			{icon && !empty ? (
				// Blizzard's icons have a dark 1px frame baked in; crop it.
				<img src={icon} alt="" loading="lazy" draggable={false} className="size-full scale-[1.08] object-cover" />
			) : null}
		</span>
	);
}

/** The tooltip body: name, then Blizzard's lines in their colors. */
export function ItemTooltipBody({ item }: { item: ItemLike }) {
	return (
		<div className="min-w-56 max-w-80 space-y-0.5 text-[13px] leading-snug text-white">
			<div className="flex items-baseline justify-between gap-4">
				<span className="font-semibold" style={{ color: QUALITY_COLORS[item.quality ?? "COMMON"] }}>
					{item.name}
				</span>
			</div>
			{item.itemLevel ? <div className="text-[#ffd100]">Item Level {item.itemLevel}</div> : null}
			{(item.tooltip ?? []).map((line, i) => (
				<div key={i} className="flex justify-between gap-4" style={line.color ? { color: line.color } : undefined}>
					<span>{line.left}</span>
					{line.right ? <span>{line.right}</span> : null}
				</div>
			))}
		</div>
	);
}

/**
 * Hover (or focus) an item to see its tooltip. Wraps `children` (an icon, a
 * name, a row) in a trigger; clicking opens the item panel (`?item=`), which
 * links on to Wowhead's Forever page.
 */
export function ItemHover({
	item,
	children,
	className,
	side = "right",
}: {
	item: ItemLike;
	children: ReactNode;
	className?: string;
	side?: "top" | "right" | "bottom" | "left";
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Link
						to="."
						search={(prev: Record<string, unknown>) => ({ ...prev, item: item.itemId })}
						className={className}
					/>
				}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent side={side} sideOffset={8} className="item-tooltip block max-w-none px-3 py-2">
				<ItemTooltipBody item={item} />
			</TooltipContent>
		</Tooltip>
	);
}
