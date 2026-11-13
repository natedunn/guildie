import type { Doc } from "./_generated/dataModel";
import { SLOTS } from "./addonPayload.ts";
import { mergeProfile } from "./profile.ts";

// What Guildie shows for one of the player's own characters, cut down to what
// the addon compares with the live game ("3 changes not on Guildie yet").
// Sent in GuildieData.lua (`characters`, addon 0.6.0+). Kept free of Convex
// and value imports so `node --test` can run it (addonView.test.ts).

export type AddonView = {
	slug: string;
	/** Blizzard's character id: the hex number in the in-game GUID. */
	id?: number;
	level: number;
	talents: {
		total: number;
		trees: { name: string; points: number }[];
		/** "id:rank,..." sorted by id, the way the addon builds it, to spot a respec; absent when an id is unknown. */
		ranks?: string;
	};
	/** Inventory slot (1-19, as in game) -> item id. */
	gear: Record<number, number>;
	/** By the game's (English) name. `recipes`: how many Guildie has as known. */
	professions: Record<string, { skill?: number; recipes?: number }>;
	/** When Guildie's data was last current, and where it came from (the game, through the app, or Blizzard). */
	synced?: { at: number; from: "game" | "blizzard" };
	details?: {
		bags?: { id: number; count: number }[];
		bank?: { id: number; count: number }[];
		quests?: NonNullable<NonNullable<Snapshot>["quests"]>["list"];
		completedQuestIds?: number[];
		deliveryIds?: string[];
	};
};

type Character = Parameters<typeof mergeProfile>[0] & Pick<Doc<"characters">, "slug" | "blizzardId">;
type Snapshot =
	| (NonNullable<Parameters<typeof mergeProfile>[1]> & Pick<Doc<"addonSnapshots">, "deliveryIds">)
	| null
	| undefined;

const SLOT_IDS = new Map(Object.entries(SLOTS).map(([id, slot]) => [slot, Number(id)]));

export function addonView(
	character: Character,
	snapshot: Snapshot,
	inventory?: Pick<Doc<"inventories">, "bags" | "bank"> | null,
): AddonView {
	const profile = mergeProfile(character, snapshot);
	const talents = (profile.talentTrees ?? []).flatMap((t) => t.talents);
	const gear: AddonView["gear"] = {};
	for (const item of profile.equipment ?? []) {
		const slot = SLOT_IDS.get(item.slot);
		if (slot) gear[slot] = item.itemId;
	}
	const professions: AddonView["professions"] = {};
	for (const p of profile.professions) {
		// The game's own count from the last upload, or what's matched to the
		// catalog if that's more: the catalog can miss a recipe the game lists,
		// and that alone shouldn't read as "1 new recipe" forever.
		const counted = snapshot?.recipes?.find((r) => r.professionId === p.id)?.count;
		const matched = p.knownRecipes?.length;
		const recipes = counted === undefined && matched === undefined ? undefined : Math.max(counted ?? 0, matched ?? 0);
		professions[p.name] = { skill: p.skill, recipes };
	}
	return {
		slug: character.slug,
		id: character.blizzardId,
		level: profile.level,
		talents: {
			total: (profile.talentTrees ?? []).reduce((sum, t) => sum + t.points, 0),
			trees: (profile.talentTrees ?? []).map((t) => ({ name: t.name, points: t.points })),
			ranks: talents.every((t) => t.id !== undefined)
				? talents
						.map((t) => ({ id: t.id as number, rank: t.rank }))
						.sort((a, b) => a.id - b.id)
						.map((t) => `${t.id}:${t.rank}`)
						.join(",")
				: undefined,
		},
		gear,
		professions,
		details: {
			bags: inventory?.bags?.items.map(({ id, count }) => ({ id, count })),
			bank: inventory?.bank?.items.map(({ id, count }) => ({ id, count })),
			quests: snapshot?.quests?.list,
			completedQuestIds: snapshot?.completedQuestIds,
			deliveryIds: snapshot?.deliveryIds,
		},
		synced: profile.synced && { at: profile.synced.at, from: profile.synced.kind === "app" ? "game" : "blizzard" },
	};
}
