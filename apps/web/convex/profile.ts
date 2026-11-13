import type { Doc } from "./_generated/dataModel";

// A character as we show it: Blizzard's profile merged with the latest
// in-game snapshot from the Guildie addon. Kept free of Convex and value
// imports so `node --test` can run it (profile.test.ts). The rules, one per
// section, all through `decide` (docs/addon.md, "Which data wins"):
//
// - Gear (and item level), talents, the profession list with skill, the
//   quest log: when only one source has the section, that one. When both do,
//   the newer: the addon's read time against Blizzard's `lastLoginAt` (its
//   profile describes the character as of that session, so a session played
//   without the app makes Blizzard's newer).
// - An empty section (no gear, no talent points, no professions, an empty
//   quest log) is shown only when both sources say empty. Either source can
//   come back empty by mistake (Forever's GetProfessions returns nothing right
//   after login; Blizzard has empty responses), so one empty never hides the
//   other's data. A real removal shows once both agree, after the player logs
//   out and Blizzard's profile catches up.
// - Characters Blizzard has no profile for (under level 10): the addon's.
// - Known recipes: Blizzard's and the addon's together (recipes are only lost
//   with their profession), for each profession in the list shown.
// - Level: the higher of the two (levels never drop).

export type Source = { kind: "addon" | "blizzard"; at?: number };

type Character = Pick<
	Doc<"characters">,
	| "level"
	| "lastLoginAt"
	| "blizzardAt"
	| "profileSyncedAt"
	| "averageItemLevel"
	| "equipment"
	| "professions"
	| "talentTrees"
	| "quests"
>;
type Snapshot = Pick<
	Doc<"addonSnapshots">,
	| "capturedAt"
	| "talentsCapturedAt"
	| "level"
	| "talentTrees"
	| "equipment"
	| "professions"
	| "recipes"
	| "quests"
	| "completedQuestIds"
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

/** Which source a section shows, and why (for the maintainer debug panel and the audit). */
export type Decision = {
	shown: "addon" | "blizzard" | "none";
	reason: "none" | "only" | "newer" | "other-empty" | "both-empty";
	addon?: { at: number; count: number };
	blizzard?: { at?: number; count: number };
};

type Side = { at: number; count: number } | undefined;

/**
 * The one rule every section goes through: only one source, that one; both,
 * the newer (ties go to Blizzard), unless the newer is empty and the other
 * isn't. Blizzard's time is the part's own (`blizzardAt`, else `lastLoginAt`; 0 when unknown).
 */
export function decide(addon: Side, blizzard: Side, blizzardAt: number | undefined): Decision {
	const sides = {
		...(addon ? { addon } : {}),
		...(blizzard ? { blizzard: { at: blizzardAt, count: blizzard.count } } : {}),
	};
	if (!addon && !blizzard) return { shown: "none", reason: "none", ...sides };
	if (!blizzard) return { shown: "addon", reason: "only", ...sides };
	if (!addon) return { shown: "blizzard", reason: "only", ...sides };
	const newer = addon.at > (blizzardAt ?? 0) ? "addon" : "blizzard";
	const other = newer === "addon" ? "blizzard" : "addon";
	const count = { addon: addon.count, blizzard: blizzard.count };
	if (count[newer] > 0) return { shown: newer, reason: "newer", ...sides };
	if (count[other] > 0) return { shown: other, reason: "other-empty", ...sides };
	return { shown: newer, reason: "both-empty", ...sides };
}

// ---- Writers' merges -------------------------------------------------------
// What the upload (helper.ts) and Blizzard's sync (sync.ts) store, pure so the
// tests can run reads through them in order.

/** Recipe ids known so far plus a new read's: recipes only grow, so no read takes any away. */
export function addRecipes(before: number[] | undefined, read: number[] | undefined) {
	return [...new Set([...(before ?? []), ...(read ?? [])])];
}

/** Blizzard's new profession list, each keeping the recipes Blizzard listed for it before. */
export function addBlizzardRecipes<P extends { id: number; knownRecipes?: number[] }>(
	before: P[] | undefined,
	fetched: P[],
): P[] {
	const known = new Map((before ?? []).map((p) => [p.id, p.knownRecipes]));
	return fetched.map((p) => ({ ...p, knownRecipes: addRecipes(known.get(p.id), p.knownRecipes) }));
}

/** Each Blizzard part's time after a sync: the parts it fetched get `at`, the rest keep theirs. */
export function blizzardPartTimes(
	before: Character["blizzardAt"],
	at: number,
	fetched: { equipment: boolean; professions: boolean; talentTrees: boolean; quests: boolean },
): NonNullable<Character["blizzardAt"]> {
	const next = { ...before };
	for (const part of ["equipment", "professions", "talentTrees", "quests"] as const) if (fetched[part]) next[part] = at;
	return next;
}

const points = (trees: { points: number }[]) => trees.reduce((sum, t) => sum + t.points, 0);

export function mergeProfile(c: Character, snap: Snapshot | null | undefined) {
	const blizzardAt = c.lastLoginAt;
	const blizzard: Source = { kind: "blizzard", at: c.lastLoginAt };
	// Each Blizzard part's own time: a part whose last fetch failed keeps the
	// time of the sync that got it (older rows: lastLoginAt).
	const partAt = (part: keyof NonNullable<Character["blizzardAt"]>) => c.blizzardAt?.[part] ?? c.lastLoginAt;
	const fromBlizzardAt = (at: number | undefined): Source => ({ kind: "blizzard", at });
	const fromAddon: number[] = [];
	const addon = (at: number): Source => {
		fromAddon.push(at);
		return { kind: "addon", at };
	};

	let level = c.level;
	let levelSource = blizzard;
	if (
		snap?.level !== undefined &&
		(snap.level > c.level || (snap.level === c.level && snap.capturedAt > (blizzardAt ?? 0)))
	) {
		level = snap.level;
		levelSource = addon(snap.capturedAt);
	}

	const gearAt = partAt("equipment");
	const gearDecision = decide(
		snap?.equipment && { at: snap.equipment.capturedAt, count: snap.equipment.items.length },
		c.equipment && { at: gearAt ?? 0, count: c.equipment.length },
		gearAt,
	);
	let equipment = c.equipment;
	let itemLevel = c.averageItemLevel;
	let gearSource = fromBlizzardAt(gearAt);
	if (gearDecision.shown === "addon" && snap?.equipment) {
		equipment = snap.equipment.items;
		itemLevel =
			snap.equipment.averageItemLevel !== undefined
				? Math.floor(snap.equipment.averageItemLevel)
				: averageItemLevel(snap.equipment.items);
		gearSource = addon(snap.equipment.capturedAt);
	}

	const professionsAt = partAt("professions");
	const professionDecision = decide(
		snap?.professions && { at: snap.professions.capturedAt, count: snap.professions.list.length },
		c.professions && { at: professionsAt ?? 0, count: c.professions.length },
		professionsAt,
	);
	const fromBlizzard = new Map((c.professions ?? []).map((p) => [p.id, p]));
	let professions: Profession[] = (c.professions ?? []).map((p) => ({ ...p }));
	let professionsSource = fromBlizzardAt(professionsAt);
	if (professionDecision.shown === "addon" && snap?.professions) {
		professions = snap.professions.list.map((p) => ({ ...p, knownRecipes: fromBlizzard.get(p.id)?.knownRecipes }));
		professionsSource = addon(snap.professions.capturedAt);
	}
	// Recipes: Blizzard's and the game's together, whichever list is shown.
	// A profession not in that list takes its recipes with it.
	for (const r of snap?.recipes ?? []) {
		const p = professions.find((x) => x.id === r.professionId);
		if (!p) continue;
		p.knownRecipes = [...new Set([...(p.knownRecipes ?? []), ...r.recipeIds])];
		p.recipesSource = addon(r.capturedAt);
	}

	// The talents' own read time: a failed read in game keeps the last talents
	// and their time (addon 0.19+; older addons: the snapshot's).
	const talentsReadAt = snap ? (snap.talentsCapturedAt ?? snap.capturedAt) : undefined;
	const talentsAt = partAt("talentTrees");
	const talentDecision = decide(
		talentsReadAt !== undefined && snap ? { at: talentsReadAt, count: points(snap.talentTrees) } : undefined,
		c.talentTrees && { at: talentsAt ?? 0, count: points(c.talentTrees) },
		talentsAt,
	);
	let talentTrees = c.talentTrees;
	let talentSource: Source = fromBlizzardAt(talentsAt);
	if (talentDecision.shown === "addon" && snap && talentsReadAt !== undefined) {
		talentTrees = snap.talentTrees;
		talentSource = addon(talentsReadAt);
	}

	const questsAt = partAt("quests");
	const questDecision = decide(
		snap?.quests && { at: snap.quests.capturedAt, count: snap.quests.list.length },
		c.quests && { at: questsAt ?? 0, count: c.quests.ids.length },
		questsAt,
	);
	let quests: QuestProgress[] | undefined = c.quests?.ids.map((id) => ({ id }));
	let questsSource: Source | undefined = c.quests ? fromBlizzardAt(questsAt) : undefined;
	if (questDecision.shown === "addon" && snap?.quests) {
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
		completedQuestIds: snap?.completedQuestIds,
		sources: {
			level: levelSource,
			gear: gearSource,
			professions: professionsSource,
			talents: talentSource,
			quests: questsSource,
		},
		/** Per section, what each source had and which one is shown (debug panel, audit). */
		decisions: {
			gear: gearDecision,
			professions: professionDecision,
			talents: talentDecision,
			quests: questDecision,
		},
		synced,
	};
}

export type Finding = { slug: string; section: string; problem: string; decision?: Decision };

/** Problems with what one character shows. Exported for tests. */
export function auditCharacter(
	character: Parameters<typeof mergeProfile>[0] & { slug: string },
	snapshot: Parameters<typeof mergeProfile>[1],
): Finding[] {
	const findings: Finding[] = [];
	const profile = mergeProfile(character, snapshot);
	for (const [section, d] of Object.entries(profile.decisions)) {
		const has = { addon: d.addon?.count ?? 0, blizzard: d.blizzard?.count ?? 0 };
		const shownCount = d.shown === "none" ? 0 : has[d.shown];
		// The rule's guarantee: never empty while a source has data.
		if (shownCount === 0 && (has.addon > 0 || has.blizzard > 0)) {
			findings.push({ slug: character.slug, section, problem: "shows empty while a source has data", decision: d });
		} else if (d.addon && d.blizzard && (has.addon === 0) !== (has.blizzard === 0)) {
			// Worth a look: one source empty, the other not (a failed read somewhere).
			findings.push({
				slug: character.slug,
				section,
				problem: `${has.addon === 0 ? "addon" : "Blizzard"} empty, the other has ${Math.max(has.addon, has.blizzard)}`,
				decision: d,
			});
		}
	}
	// Recipes read in game for a profession the shown list has: they must show.
	for (const r of snapshot?.recipes ?? []) {
		const p = profile.professions.find((x) => x.id === r.professionId);
		if (p && r.recipeIds.some((id) => !p.knownRecipes?.includes(id))) {
			findings.push({ slug: character.slug, section: "recipes", problem: `${r.profession}: game recipes not shown` });
		}
	}
	return findings;
}

export type Profile = ReturnType<typeof mergeProfile>;
