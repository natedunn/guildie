import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import type { vTooltipLine } from "./schema";

// Forever items we show (equipped gear, crafted items, reagents): name,
// quality, icon and an in-game style tooltip, from Blizzard's static data.
// Items are the same in every region, so this reads from US. Two requests per
// item (item + media), in staggered batches.

type Line = Infer<typeof vTooltipLine>;

type Display = { display_string?: string; color?: { r: number; g: number; b: number } };

/** The fields of Blizzard's item preview (and of an equipped item) a tooltip uses. */
export type ItemPreview = {
	binding?: { name?: string };
	unique_equipped?: string;
	inventory_type?: { type?: string; name?: string };
	item_class?: { id?: number; name?: string };
	item_subclass?: { name?: string };
	is_subclass_hidden?: boolean;
	container_slots?: { display_string?: string };
	weapon?: {
		damage?: { display_string?: string };
		attack_speed?: { display_string?: string };
		dps?: { display_string?: string };
	};
	armor?: { display?: Display };
	stats?: { display?: Display; is_negated?: boolean }[];
	enchantments?: { display_string?: string }[];
	spells?: { description?: string }[];
	set?: { display_string?: string; item_set?: { name?: string } };
	durability?: { display_string?: string };
	requirements?: {
		level?: { display_string?: string };
		playable_classes?: { display_string?: string };
		skill?: { display_string?: string };
	};
	description?: string;
};

const hex = (c?: { r: number; g: number; b: number }) =>
	!c || (c.r === 255 && c.g === 255 && c.b === 255)
		? undefined
		: `#${[c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

const GREEN = "#00ff00";
const YELLOW = "#ffd100";

/** Tooltip lines in the game's order, without the name line. */
export function tooltipLines(p: ItemPreview): Line[] {
	const lines: Line[] = [];
	const push = (left: string | undefined, extra: Omit<Line, "left"> = {}) => {
		if (left) lines.push({ left, ...extra });
	};
	push(p.binding?.name);
	push(p.unique_equipped);
	const equipSlot = p.inventory_type?.type && p.inventory_type.type !== "NON_EQUIP" ? p.inventory_type.name : undefined;
	if (p.container_slots?.display_string) push(p.container_slots.display_string);
	else if (equipSlot) push(equipSlot, { right: p.is_subclass_hidden ? undefined : p.item_subclass?.name });
	if (p.weapon?.damage?.display_string)
		push(p.weapon.damage.display_string, { right: p.weapon.attack_speed?.display_string });
	push(p.weapon?.dps?.display_string);
	push(p.armor?.display?.display_string, { color: hex(p.armor?.display?.color) });
	for (const s of p.stats ?? []) push(s.display?.display_string, { color: hex(s.display?.color) });
	for (const e of p.enchantments ?? []) push(e.display_string, { color: GREEN });
	push(p.durability?.display_string);
	push(p.requirements?.playable_classes?.display_string);
	push(p.requirements?.level?.display_string);
	push(p.requirements?.skill?.display_string);
	for (const s of p.spells ?? []) push(s.description, { color: GREEN });
	push(p.set?.item_set?.name, { color: YELLOW });
	if (p.description) push(`"${p.description}"`, { color: YELLOW });
	return lines;
}

/** Which of these items we don't have yet (or have stale). */
export const missing = internalQuery({
	args: { itemIds: v.array(v.number()), olderThan: v.optional(v.number()), refetchEmpty: v.optional(v.boolean()) },
	handler: async (ctx, { itemIds, olderThan, refetchEmpty }) => {
		const out: number[] = [];
		for (const itemId of new Set(itemIds)) {
			const row = await ctx.db
				.query("items")
				.withIndex("by_itemId", (q) => q.eq("itemId", itemId))
				.unique();
			// Gear saved before hints carried tooltips has none; refetch it when a
			// hint can fill it in (trade goods legitimately have no lines).
			if (!row || (refetchEmpty && row.tooltip.length === 0) || (olderThan !== undefined && row.syncedAt < olderThan))
				out.push(itemId);
		}
		return out;
	},
});

const BATCH = 20;
const BATCH_STAGGER_MS = 2_000;

/**
 * What we already know about an item from elsewhere (an equipped item's name
 * and quality). Blizzard's item endpoint 404s for many Forever items whose
 * icons exist, so these fill in the row then.
 */
const vHint = v.object({
	itemId: v.number(),
	name: v.optional(v.string()),
	quality: v.optional(v.string()),
	tooltip: v.optional(
		v.array(v.object({ left: v.string(), right: v.optional(v.string()), color: v.optional(v.string()) })),
	),
});

/** Fetch the given items we don't have yet, in staggered batches. */
export const ensure = internalAction({
	args: { itemIds: v.array(v.number()), hints: v.optional(v.array(vHint)) },
	handler: async (ctx, { itemIds, hints }): Promise<{ queued: number }> => {
		const due: number[] = await ctx.runQuery(internal.items.missing, {
			itemIds,
			refetchEmpty: hints?.some((h) => h.tooltip?.length) ?? false,
		});
		const hintOf = new Map((hints ?? []).map((h) => [h.itemId, h]));
		for (let i = 0; i < due.length; i += BATCH) {
			const ids = due.slice(i, i + BATCH);
			await ctx.scheduler.runAfter((i / BATCH) * BATCH_STAGGER_MS, internal.items.syncBatch, {
				itemIds: ids,
				hints: ids.map((id) => hintOf.get(id)).filter((h) => h !== undefined),
			});
		}
		return { queued: due.length };
	},
});

/** Every item the recipe catalog mentions (crafted and reagents). */
export const recipeItemIds = internalQuery({
	args: {},
	handler: async (ctx) => {
		const ids = new Set<number>();
		for (const r of await ctx.db.query("recipes").collect()) {
			if (r.craftedItemId) ids.add(r.craftedItemId);
			for (const x of r.reagents) ids.add(x.itemId);
		}
		return [...ids];
	},
});

/** After a recipe catalog sync: fetch the items it mentions that we don't have. */
export const syncRecipeItems = internalAction({
	args: {},
	handler: async (ctx): Promise<{ queued: number }> => {
		const itemIds = await ctx.runQuery(internal.items.recipeItemIds, {});
		return await ctx.runAction(internal.items.ensure, { itemIds });
	},
});

type Item = {
	name?: string;
	quality?: { type?: string };
	item_subclass?: { name?: string };
	preview_item?: ItemPreview & { name?: string };
};
type Media = { assets?: { key: string; value: string }[] };

export const syncBatch = internalAction({
	args: { itemIds: v.array(v.number()), hints: v.optional(v.array(vHint)) },
	handler: async (ctx, { itemIds, hints }) => {
		const hintOf = new Map((hints ?? []).map((h) => [h.itemId, h]));
		const token = await appToken(ctx, "us");
		const common = { flavor: "forever" as const, region: "us" as const, namespace: "static" as const, token };
		const fetched = await Promise.all(
			// One failed lookup (a Blizzard hiccup) shouldn't drop the rest of the batch.
			itemIds.map(async (itemId) => {
				try {
					return await fetchItem(itemId);
				} catch (e) {
					console.warn(`items: ${itemId}: ${(e as Error).message}`);
					return null;
				}
			}),
		);
		await ctx.runMutation(internal.items.save, { items: fetched.filter((x) => x !== null) });

		async function fetchItem(itemId: number) {
			const [item, media] = await Promise.all([
				blizzardGet<Item>({ ...common, path: `/data/wow/item/${itemId}` }),
				blizzardGet<Media>({ ...common, path: `/data/wow/media/item/${itemId}` }),
			]);
			if (!item.ok) {
				const hint = hintOf.get(itemId);
				const icon = media.ok ? media.data.assets?.find((a) => a.key === "icon")?.value : undefined;
				if (!hint?.name || !icon) return null;
				return { itemId, name: hint.name, quality: hint.quality ?? "COMMON", icon, tooltip: hint.tooltip ?? [] };
			}
			return {
				itemId,
				name: item.data.name ?? item.data.preview_item?.name ?? `Item ${itemId}`,
				quality: item.data.quality?.type ?? "COMMON",
				icon: media.ok ? media.data.assets?.find((a) => a.key === "icon")?.value : undefined,
				kind: item.data.item_subclass?.name,
				tooltip: tooltipLines(item.data.preview_item ?? {}),
			};
		}
	},
});

/** Every item id in players' bags and banks and on characters' gear (for the daily backfill). */
export const referencedItemIds = internalQuery({
	args: {},
	handler: async (ctx) => {
		const ids = new Set<number>();
		for await (const row of ctx.db.query("inventories")) {
			for (const i of [...(row.bags?.items ?? []), ...(row.bank?.items ?? [])]) ids.add(i.id);
		}
		for await (const c of ctx.db.query("characters")) {
			for (const e of c.equipment ?? []) ids.add(e.itemId);
		}
		return [...ids];
	},
});

/**
 * Daily: look up any item in bags, banks or gear we still have no row for (an
 * upload that came before a lookup existed, or a lookup that failed).
 */
export const backfill = internalAction({
	args: {},
	handler: async (ctx): Promise<{ queued: number }> => {
		const itemIds: number[] = await ctx.runQuery(internal.items.referencedItemIds, {});
		return await ctx.runAction(internal.items.ensure, { itemIds });
	},
});

export const save = internalMutation({
	args: {
		items: v.array(
			v.object({
				itemId: v.number(),
				name: v.string(),
				quality: v.string(),
				icon: v.optional(v.string()),
				kind: v.optional(v.string()),
				tooltip: v.array(v.object({ left: v.string(), right: v.optional(v.string()), color: v.optional(v.string()) })),
			}),
		),
	},
	handler: async (ctx, { items }) => {
		const now = Date.now();
		for (const item of items) {
			const existing = await ctx.db
				.query("items")
				.withIndex("by_itemId", (q) => q.eq("itemId", item.itemId))
				.unique();
			if (existing) await ctx.db.replace(existing._id, { ...item, syncedAt: now });
			else await ctx.db.insert("items", { ...item, syncedAt: now });
		}
	},
});
