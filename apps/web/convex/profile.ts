import type { Doc } from "./_generated/dataModel";

// A character as we show it: Blizzard's profile merged with the latest
// in-game snapshot from the Guildie addon, newest wins per field. Kept free of
// Convex and value imports so `node --test` can run it (profile.test.ts).
//
// Blizzard's profile only changes when the character logs out, and then
// describes them as of that session, so its time is `lastLoginAt`. The addon's
// sections each carry the game time they were read. For each field:
//
// - level: the higher of the two (levels never drop). `lastLoginAt` is when
//   the session started, so a level gained later in that session can be
//   Blizzard's while an addon read from earlier in it still looks newer;
// - gear and item level, the profession list with skill, and each
//   profession's known recipes: the addon's section when it's newer. Newer
//   addon recipes add to Blizzard's (recipes are only lost with the
//   profession), so a recipe the catalog couldn't match isn't lost;
// - talents: as before, the addon's while newer than the last change seen
//   from Blizzard (`talentsChangedAt`), except an empty list when Blizzard
//   has points spent: more likely a read that failed in game than a reset;
// - quests in progress: the addon's quest log when it's newer (with the
//   game's titles, levels, objectives and complete state), else Blizzard's
//   list (ids only; titles come from the quests catalog).
//
// Anything the addon never captured stays Blizzard's.

export type Source = { kind: "addon" | "blizzard"; at?: number };

type Character = Pick<
	Doc<"characters">,
	| "level"
	| "lastLoginAt"
	| "profileSyncedAt"
	| "talentsChangedAt"
	| "averageItemLevel"
	| "equipment"
	| "professions"
	| "talentTrees"
	| "quests"
>;
type Snapshot = Pick<
	Doc<"addonSnapshots">,
	"capturedAt" | "level" | "talentTrees" | "equipment" | "professions" | "recipes" | "quests"
>;
type Item = NonNullable<Character["equipment"]>[number];

export type Profession = NonNullable<Character["professions"]>[number] & { recipesSource?: Source };

/** A quest in progress: just the id from Blizzard; from the game, what its quest log showed. */
export type QuestProgress = NonNullable<Doc<"addonSnapshots">["quests"]>["list"][number];

/**
 * Blizzard's way (as far as Classic profiles show): the 17 gear slots, shirt
 * and tabard left out, a two-hander counted twice when the off hand is empty;
 * rounded down.
 */
export function averageItemLevel(items: Item[]) {
	const counted = items.filter((i) => i.slot !== "SHIRT" && i.slot !== "TABARD");
	if (!counted.length) return undefined;
	let total = counted.reduce((sum, i) => sum + (i.itemLevel ?? 0), 0);
	const main = items.find((i) => i.slot === "MAIN_HAND");
	const twoHand = main?.tooltip?.some((l) => l.left === "Two-Hand");
	if (main && twoHand && !items.some((i) => i.slot === "OFF_HAND")) total += main.itemLevel ?? 0;
	return Math.floor(total / 17);
}

export function mergeProfile(c: Character, snap: Snapshot | null | undefined) {
	const blizzardAt = c.lastLoginAt ?? 0;
	const blizzard: Source = { kind: "blizzard", at: c.lastLoginAt };
	const fromAddon: number[] = [];
	const addon = (at: number): Source => {
		fromAddon.push(at);
		return { kind: "addon", at };
	};

	let level = c.level;
	let levelSource = blizzard;
	if (snap?.level !== undefined && (snap.level > c.level || (snap.level === c.level && snap.capturedAt > blizzardAt))) {
		level = snap.level;
		levelSource = addon(snap.capturedAt);
	}

	let equipment = c.equipment;
	let itemLevel = c.averageItemLevel;
	let gearSource = blizzard;
	if (snap?.equipment && snap.equipment.capturedAt > blizzardAt) {
		equipment = snap.equipment.items;
		itemLevel =
			snap.equipment.averageItemLevel !== undefined
				? Math.floor(snap.equipment.averageItemLevel)
				: averageItemLevel(snap.equipment.items);
		gearSource = addon(snap.equipment.capturedAt);
	}

	const fromBlizzard = new Map((c.professions ?? []).map((p) => [p.id, p]));
	let professions: Profession[] = (c.professions ?? []).map((p) => ({ ...p }));
	let professionsSource = blizzard;
	if (snap?.professions && snap.professions.capturedAt > blizzardAt) {
		professions = snap.professions.list.map((p) => ({ ...p, knownRecipes: fromBlizzard.get(p.id)?.knownRecipes }));
		professionsSource = addon(snap.professions.capturedAt);
	}
	for (const r of snap?.recipes ?? []) {
		if (r.capturedAt <= blizzardAt) continue;
		// A profession no longer known takes its recipes with it.
		const p = professions.find((x) => x.id === r.professionId);
		if (!p) continue;
		p.knownRecipes = [...new Set([...(p.knownRecipes ?? []), ...r.recipeIds])];
		p.recipesSource = addon(r.capturedAt);
	}

	let talentTrees = c.talentTrees;
	let talentSource: Source = { kind: "blizzard", at: c.profileSyncedAt };
	const blizzardHasTalents = (c.talentTrees ?? []).some((t) => t.points > 0);
	if (
		snap &&
		snap.capturedAt > (c.talentsChangedAt ?? c.profileSyncedAt ?? 0) &&
		(snap.talentTrees.length > 0 || !blizzardHasTalents)
	) {
		talentTrees = snap.talentTrees;
		talentSource = addon(snap.capturedAt);
	}

	let quests: QuestProgress[] | undefined = c.quests?.ids.map((id) => ({ id }));
	let questsSource: Source | undefined = c.quests ? blizzard : undefined;
	if (snap?.quests && snap.quests.capturedAt > blizzardAt) {
		quests = snap.quests.list;
		questsSource = addon(snap.quests.capturedAt);
	}

	// When this character's data was last current, and from where: in game
	// (the player's Guildie app uploaded it) when any of it is the addon's,
	// else Blizzard's as of their last logout (checked at profileSyncedAt).
	const synced = fromAddon.length
		? { kind: "app" as const, at: Math.max(...fromAddon) }
		: c.lastLoginAt
			? { kind: "blizzard" as const, at: c.lastLoginAt, checkedAt: c.profileSyncedAt }
			: undefined;

	return {
		level,
		averageItemLevel: itemLevel,
		equipment,
		professions,
		talentTrees,
		quests,
		sources: {
			level: levelSource,
			gear: gearSource,
			professions: professionsSource,
			talents: talentSource,
			quests: questsSource,
		},
		synced,
	};
}

export type Profile = ReturnType<typeof mergeProfile>;
