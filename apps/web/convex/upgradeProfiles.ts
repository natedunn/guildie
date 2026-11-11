import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { Profile } from "./profile";
import { type ItemInfo, itemInfoFromTooltip } from "./shared/itemInfo";
import { type Rules, type StatChoice, type UpgradeMember, upgradeMember, type WornItem } from "./shared/upgrades";

// Guild members as gear-upgrade suggestions see them (shared/upgrades.ts):
// what they wear, read from each item's tooltip, and the stat priority and
// armor and weapon types their player chose (specsFor, gearPrefs), for the addon's guild data (helper.ts) and the
// site's item panel and crafting views (crafting.ts).

/** An item's info from our items table (English, from Blizzard), cached per call. */
export async function itemInfoById(ctx: QueryCtx, itemId: number, cache: Map<number, ItemInfo | undefined>) {
	if (!cache.has(itemId)) {
		const row = await ctx.db
			.query("items")
			.withIndex("by_itemId", (q) => q.eq("itemId", itemId))
			.unique();
		cache.set(itemId, row ? itemInfoFromTooltip(row.tooltip) : undefined);
	}
	return cache.get(itemId);
}

/**
 * Worn items with their info: from the tooltip as worn (random suffixes and
 * enchants included), else from the items table (the addon's tooltip in a
 * language we don't read), else none (shared/upgrades.ts estimates it).
 */
async function wornItems(
	ctx: QueryCtx,
	equipment: NonNullable<Profile["equipment"]>,
	cache: Map<number, ItemInfo | undefined>,
) {
	const out: WornItem[] = [];
	for (const item of equipment) {
		const info =
			(item.tooltip?.length ? itemInfoFromTooltip(item.tooltip) : undefined) ??
			(await itemInfoById(ctx, item.itemId, cache));
		out.push({
			slot: item.slot,
			itemId: item.itemId,
			name: item.name,
			quality: item.quality,
			itemLevel: item.itemLevel,
			info,
		});
	}
	return out;
}

/** A member's upgrade profile and worn items, or undefined when nothing's known about their gear. */
export async function memberForUpgrades(
	ctx: QueryCtx,
	character: Doc<"characters">,
	profile: Profile,
	rules: Rules,
	cache: Map<number, ItemInfo | undefined>,
): Promise<{ member: UpgradeMember; worn: WornItem[]; choice?: StatChoice } | undefined> {
	if (!profile.equipment) return undefined;
	const worn = await wornItems(ctx, profile.equipment, cache);
	// The stat priority the player who claimed it chose, as the roster shows it (guilds.ts).
	const claim = await ctx.db
		.query("ownedCharacters")
		.withIndex("by_slug", (q) =>
			q.eq("flavor", character.flavor).eq("region", character.region).eq("slug", character.slug),
		)
		.first();
	const member = upgradeMember(
		{
			name: character.name,
			classId: character.classId,
			level: profile.level,
			// Last logout, or the addon's newest read.
			seenMs: Math.max(character.lastLoginAt ?? 0, profile.synced?.at ?? 0),
			talentTrees: profile.talentTrees,
			equipment: worn,
			statPriority: claim?.statPriority,
			gearPreference: claim?.gearPreference,
		},
		rules,
	);
	return member && { member, worn, choice: claim?.statPriority };
}
