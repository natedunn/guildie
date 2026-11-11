// What the Guildie addon uploads (apps/addon, through the desktop app):
// parsing and strict validation, one character at a time, so one bad
// character doesn't sink the rest of an upload. Payload versions 1 (talents
// and level), 2 (plus guild, XP, gear, professions and known recipes; from
// addon 0.7.0 also weapon and armor skills), 3 (addon 0.8.0: plus bags and
// the last bank read, for guild requests) and 4 (addon 0.10.0: plus the quest
// log) are all accepted. Kept free of
// Convex and value imports so `node --test` can run it (addonPayload.test.ts).

export const PAYLOAD_VERSIONS = [1, 2, 3, 4] as const;

export const LIMITS = {
	characters: 50,
	talents: 120,
	items: 19,
	tooltipLines: 40,
	tooltipText: 400,
	skills: 20,
	combatSkills: 40,
	recipeProfessions: 15,
	recipesPerProfession: 1500,
	/** Different items in bags, or in the bank (each stack summed by the addon). */
	inventoryItems: 600,
	/** Quests in the log (the game allows 25), objectives per quest. */
	quests: 60,
	objectives: 12,
	name: 120,
} as const;

/** Inventory slot ids (INVSLOT_*) to Blizzard's slot types. */
export const SLOTS: Record<number, string> = {
	1: "HEAD",
	2: "NECK",
	3: "SHOULDER",
	4: "SHIRT",
	5: "CHEST",
	6: "WAIST",
	7: "LEGS",
	8: "FEET",
	9: "WRIST",
	10: "HANDS",
	11: "FINGER_1",
	12: "FINGER_2",
	13: "TRINKET_1",
	14: "TRINKET_2",
	15: "BACK",
	16: "MAIN_HAND",
	17: "OFF_HAND",
	18: "RANGED",
	19: "TABARD",
};

/** The game's quality index (Enum.ItemQuality) to Blizzard's quality types. */
export const QUALITIES = ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM"];

/**
 * Profession names as the (English) game shows them, to Blizzard's skill
 * line ids, the ids its profile API and recipe catalog use.
 */
export const PROFESSIONS: Record<string, { id: number; secondary: boolean }> = {
	Alchemy: { id: 171, secondary: false },
	Blacksmithing: { id: 164, secondary: false },
	Enchanting: { id: 333, secondary: false },
	Engineering: { id: 202, secondary: false },
	Herbalism: { id: 182, secondary: false },
	Leatherworking: { id: 165, secondary: false },
	Mining: { id: 186, secondary: false },
	Skinning: { id: 393, secondary: false },
	Tailoring: { id: 197, secondary: false },
	Jewelcrafting: { id: 755, secondary: false },
	Inscription: { id: 773, secondary: false },
	Cooking: { id: 185, secondary: true },
	"First Aid": { id: 129, secondary: true },
	Fishing: { id: 356, secondary: true },
};
const PROFESSION_BY_ID = new Map(Object.entries(PROFESSIONS).map(([name, p]) => [p.id, { name, ...p }]));

/** A profession by the game's name or skill line id; undefined when we don't know it. */
export function professionOf(name: string, id?: number) {
	const byId = id !== undefined ? PROFESSION_BY_ID.get(id) : undefined;
	if (byId) return byId;
	const byName = PROFESSIONS[name];
	return byName ? { name, ...byName } : undefined;
}

export type TooltipLine = { left: string; right?: string; color?: string };

export type AddonItem = {
	slot: string;
	itemId: number;
	name: string;
	quality: string;
	itemLevel?: number;
	tooltip: TooltipLine[];
	enchantId?: number;
	suffixId?: number;
};

export type AddonCharacter = {
	guid: string;
	name: string;
	level?: number;
	xp?: number;
	xpMax?: number;
	classToken?: string;
	raceToken?: string;
	/** ms (the addon sends game server time in seconds). */
	capturedAt: number;
	guild?: { name: string; rank?: string; rankIndex?: number };
	talents: { id: number; rank: number; name?: string }[];
	equipment?: { capturedAt: number; averageItemLevel?: number; items: AddonItem[] };
	/** Only professions we know; `dropped` counts the rest. */
	professions?: {
		capturedAt: number;
		list: { id: number; name: string; skill: number; maxSkill: number; secondary: boolean }[];
		dropped: number;
	};
	recipes: {
		professionId: number;
		profession: string;
		capturedAt: number;
		known: { name: string; itemId?: number }[];
	}[];
	/**
	 * Weapon and armor skills as the game's skill list names them (English),
	 * read at `level`; `dualWield`: CanDualWield(). Checked against the rules
	 * by `proficiencies:audit`.
	 */
	proficiencies?: { capturedAt: number; level?: number; skills: string[]; dualWield?: boolean };
	/**
	 * Bags and the bank (as of when it was last open), item id → count
	 * (payload 3, addon 0.8.0). Private: only used for the player's own craft
	 * requests (convex/requests.ts).
	 */
	inventory?: { bags?: InventoryPart; bank?: InventoryPart };
	/** The quest log (payload 4, addon 0.10.0). Public like Blizzard's quest list, to guildmates. */
	quests?: { capturedAt: number; list: QuestEntry[] };
};

export type QuestEntry = {
	id: number;
	title?: string;
	level?: number;
	/** "Dungeon", "Elite", "Raid", "Group", "PvP"... as the game tags it. */
	tag?: string;
	/** The quest log header it's under: a zone, a dungeon or a category. */
	zone?: string;
	complete?: boolean;
	failed?: boolean;
	objectives?: { text: string; done: boolean }[];
};

export type InventoryPart = {
	capturedAt: number;
	/** `name`/`quality` (0-7) from the game (addon 0.9+): only to label items Blizzard's API doesn't list. */
	items: { id: number; count: number; name?: string; quality?: number }[];
};

class Invalid extends Error {}

const fail = (path: string, what: string): never => {
	throw new Invalid(`${path}: ${what}`);
};

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function obj(x: unknown, path: string) {
	return isObject(x) ? x : fail(path, "expected an object");
}

function arr(x: unknown, path: string, max: number) {
	if (!Array.isArray(x)) return fail(path, "expected a list");
	if (x.length > max) fail(path, `more than ${max}`);
	return x as unknown[];
}

function str(x: unknown, path: string, max: number, min = 0) {
	if (typeof x !== "string") return fail(path, "expected text");
	if (x.length > max) fail(path, `longer than ${max}`);
	if (x.length < min) fail(path, "empty");
	return x;
}

/** Text from the game shown as-is: plain text only (no color codes or control characters). */
function plain(x: unknown, path: string, max: number) {
	const text = str(x, path, max, 1);
	for (const ch of text) {
		if (ch === "|" || ch.charCodeAt(0) < 32) fail(path, "not plain text");
	}
	return text;
}

/** An item's name from the game. */
const itemName = (x: unknown, path: string) => plain(x, path, 100);

function int(x: unknown, path: string, min: number, max: number) {
	if (typeof x !== "number" || !Number.isInteger(x)) return fail(path, "expected a whole number");
	if (x < min || x > max) fail(path, `out of range (${min}–${max})`);
	return x;
}

function num(x: unknown, path: string, min: number, max: number) {
	if (typeof x !== "number" || !Number.isFinite(x)) return fail(path, "expected a number");
	if (x < min || x > max) fail(path, `out of range (${min}–${max})`);
	return x;
}

/** Optional: absent and null are both "not sent" (the addon's encoder writes nil as null). */
const opt = <T>(x: unknown, parse: (x: unknown) => T) => (x === undefined || x === null ? undefined : parse(x));

/** Game server time (seconds) to ms, refusing clocks far in the future. */
function time(x: unknown, path: string, now: number) {
	const ms = num(x, path, 1_000_000_000, 10_000_000_000) * 1000;
	if (ms > now + 10 * 60_000) fail(path, "in the future");
	return Math.round(ms);
}

const ITEM_LEVEL_LINE = /^Item Level (\d+)$/;
const SELL_PRICE_LINE = /^Sell Price:/;

function tooltip(x: unknown, path: string) {
	const lines: TooltipLine[] = [];
	let itemLevel: number | undefined;
	for (const [i, raw] of arr(x, path, LIMITS.tooltipLines).entries()) {
		const p = `${path}[${i}]`;
		const line = obj(raw, p);
		const left = str(line.left, `${p}.left`, LIMITS.tooltipText);
		const right = opt(line.right, (r) => str(r, `${p}.right`, LIMITS.tooltipText));
		const color = opt(line.color, (c) => {
			const s = str(c, `${p}.color`, 7);
			return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fail(`${p}.color`, "expected #rrggbb");
		});
		// The site shows the item level itself; the game's line also tells it when the API didn't.
		const level = left.match(ITEM_LEVEL_LINE);
		if (level) {
			itemLevel = Number(level[1]);
			continue;
		}
		if (SELL_PRICE_LINE.test(left)) continue;
		lines.push({ left, ...(right ? { right } : {}), ...(color ? { color } : {}) });
	}
	return { lines, itemLevel };
}

function equipment(x: unknown, now: number) {
	const e = obj(x, "equipment");
	const capturedAt = time(e.capturedAt, "equipment.capturedAt", now);
	const averageItemLevel = opt(e.averageItemLevel, (a) => num(a, "equipment.averageItemLevel", 0, 1000));
	const slots = new Set<number>();
	const items: AddonItem[] = arr(e.items, "equipment.items", LIMITS.items).map((raw, i) => {
		const p = `equipment.items[${i}]`;
		const item = obj(raw, p);
		const slot = int(item.slot, `${p}.slot`, 1, 19);
		if (slots.has(slot)) fail(`${p}.slot`, "twice");
		slots.add(slot);
		const quality = opt(item.quality, (q) => int(q, `${p}.quality`, 0, QUALITIES.length - 1));
		const tip = opt(item.tooltip, (t) => tooltip(t, `${p}.tooltip`));
		const itemLevel = opt(item.itemLevel, (l) => num(l, `${p}.itemLevel`, 0, 1000)) ?? tip?.itemLevel;
		const enchantId = opt(item.enchant, (n) => int(n, `${p}.enchant`, 0, 10_000_000)) || undefined;
		const suffixId = opt(item.suffix, (n) => int(n, `${p}.suffix`, -100_000, 100_000)) || undefined;
		return {
			slot: SLOTS[slot],
			itemId: int(item.id, `${p}.id`, 1, 100_000_000),
			name: str(item.name, `${p}.name`, LIMITS.name, 1),
			quality: QUALITIES[quality ?? 1],
			...(itemLevel ? { itemLevel: Math.round(itemLevel) } : {}),
			tooltip: tip?.lines ?? [],
			...(enchantId ? { enchantId } : {}),
			...(suffixId ? { suffixId } : {}),
		};
	});
	return { capturedAt, ...(averageItemLevel ? { averageItemLevel } : {}), items };
}

function professions(x: unknown, now: number): AddonCharacter["professions"] {
	const e = obj(x, "professions");
	const capturedAt = time(e.capturedAt, "professions.capturedAt", now);
	const raw = arr(e.skills, "professions.skills", LIMITS.skills);
	const list: NonNullable<AddonCharacter["professions"]>["list"] = [];
	for (const [i, s] of raw.entries()) {
		const p = `professions.skills[${i}]`;
		const skill = obj(s, p);
		const name = str(skill.name, `${p}.name`, 48, 1);
		const id = opt(skill.id, (n) => int(n, `${p}.id`, 0, 100_000));
		const rank = int(skill.rank ?? 0, `${p}.rank`, 0, 1000);
		const max = int(skill.max ?? 0, `${p}.max`, 0, 1000);
		const known = professionOf(name, id);
		if (!known || list.some((l) => l.id === known.id)) continue;
		list.push({ id: known.id, name: known.name, skill: rank, maxSkill: max, secondary: known.secondary });
	}
	// None recognised (a client in another language): not worth showing over
	// Blizzard's, which has them.
	if (raw.length > 0 && list.length === 0) return undefined;
	return { capturedAt, list, dropped: raw.length - list.length };
}

function recipes(x: unknown, now: number): AddonCharacter["recipes"] {
	const out: AddonCharacter["recipes"] = [];
	for (const [i, s] of arr(x, "recipes", LIMITS.recipeProfessions).entries()) {
		const p = `recipes[${i}]`;
		const section = obj(s, p);
		const name = str(section.profession, `${p}.profession`, 48, 1);
		const capturedAt = time(section.capturedAt, `${p}.capturedAt`, now);
		const known = arr(section.known, `${p}.known`, LIMITS.recipesPerProfession).map((r, j) => {
			const recipe = obj(r, `${p}.known[${j}]`);
			const itemId = opt(recipe.item, (n) => int(n, `${p}.known[${j}].item`, 1, 100_000_000));
			return { name: str(recipe.name, `${p}.known[${j}].name`, LIMITS.name, 1), ...(itemId ? { itemId } : {}) };
		});
		const profession = professionOf(name);
		if (!profession || out.some((o) => o.professionId === profession.id)) continue;
		out.push({ professionId: profession.id, profession: profession.name, capturedAt, known });
	}
	return out;
}

function proficiencies(x: unknown, now: number): AddonCharacter["proficiencies"] {
	const e = obj(x, "proficiencies");
	const capturedAt = time(e.capturedAt, "proficiencies.capturedAt", now);
	const level = opt(e.level, (l) => int(l, "proficiencies.level", 1, 100));
	const skills = [
		...new Set(
			arr(e.skills, "proficiencies.skills", LIMITS.combatSkills).map((s, i) =>
				str(s, `proficiencies.skills[${i}]`, 48, 1),
			),
		),
	].sort();
	const dualWield = opt(e.dualWield, (d) =>
		typeof d === "boolean" ? d : fail("proficiencies.dualWield", "expected true or false"),
	);
	return { capturedAt, ...(level ? { level } : {}), skills, ...(dualWield !== undefined ? { dualWield } : {}) };
}

function inventoryPart(x: unknown, path: string, now: number): InventoryPart {
	const e = obj(x, path);
	const capturedAt = time(e.capturedAt, `${path}.capturedAt`, now);
	const counts = new Map<number, number>();
	const labels = new Map<number, { name?: string; quality?: number }>();
	for (const [i, raw] of arr(e.items, `${path}.items`, LIMITS.inventoryItems).entries()) {
		const p = `${path}.items[${i}]`;
		const item = obj(raw, p);
		const id = int(item.id, `${p}.id`, 1, 100_000_000);
		const count = int(item.count, `${p}.count`, 1, 1_000_000);
		counts.set(id, (counts.get(id) ?? 0) + count);
		const name = opt(item.name, (n) => itemName(n, `${p}.name`));
		const quality = opt(item.quality, (q) => int(q, `${p}.quality`, 0, 7));
		if (name !== undefined || quality !== undefined) labels.set(id, { name, quality });
	}
	return {
		capturedAt,
		items: [...counts].map(([id, count]) => {
			const label = labels.get(id);
			return {
				id,
				count,
				...(label?.name !== undefined ? { name: label.name } : {}),
				...(label?.quality !== undefined ? { quality: label.quality } : {}),
			};
		}),
	};
}

function inventory(x: unknown, now: number): AddonCharacter["inventory"] {
	const e = obj(x, "inventory");
	const bags = opt(e.bags, (b) => inventoryPart(b, "inventory.bags", now));
	const bank = opt(e.bank, (b) => inventoryPart(b, "inventory.bank", now));
	return bags || bank ? { ...(bags ? { bags } : {}), ...(bank ? { bank } : {}) } : undefined;
}

function bool(x: unknown, path: string) {
	return typeof x === "boolean" ? x : fail(path, "expected true or false");
}

function quests(x: unknown, now: number): AddonCharacter["quests"] {
	const e = obj(x, "quests");
	const capturedAt = time(e.capturedAt, "quests.capturedAt", now);
	const list: QuestEntry[] = [];
	for (const [i, raw] of arr(e.list, "quests.list", LIMITS.quests).entries()) {
		const p = `quests.list[${i}]`;
		const q = obj(raw, p);
		const id = int(q.id, `${p}.id`, 1, 10_000_000);
		if (list.some((l) => l.id === id)) continue;
		const title = opt(q.title, (t) => plain(t, `${p}.title`, LIMITS.name));
		const level = opt(q.level, (l) => int(l, `${p}.level`, -1, 100));
		const tag = opt(q.tag, (t) => plain(t, `${p}.tag`, 32));
		const zone = opt(q.zone, (z) => plain(z, `${p}.zone`, 64));
		const complete = opt(q.complete, (c) => bool(c, `${p}.complete`));
		const failed = opt(q.failed, (f) => bool(f, `${p}.failed`));
		const objectives = opt(q.objectives, (o) =>
			arr(o, `${p}.objectives`, LIMITS.objectives).map((raw, j) => {
				const op = `${p}.objectives[${j}]`;
				const ob = obj(raw, op);
				return { text: plain(ob.text, `${op}.text`, 200), done: bool(ob.done ?? false, `${op}.done`) };
			}),
		);
		list.push({
			id,
			...(title !== undefined ? { title } : {}),
			// Level 0 or -1: scaling quests, which the game shows without a level.
			...(level !== undefined && level > 0 ? { level } : {}),
			...(tag !== undefined ? { tag } : {}),
			...(zone !== undefined ? { zone } : {}),
			...(complete ? { complete } : {}),
			...(failed ? { failed } : {}),
			...(objectives?.length ? { objectives } : {}),
		});
	}
	return { capturedAt, list };
}

export type Parsed = { ok: true; character: AddonCharacter } | { ok: false; name: string; error: string };

/** One uploaded character, checked field by field. `now`: the server's clock (ms). */
export function parseCharacter(raw: unknown, now: number): Parsed {
	const name = isObject(raw) && typeof raw.name === "string" ? raw.name.slice(0, 48) : "?";
	try {
		const c = obj(raw, "character");
		const guild = opt(c.guild, (g) => {
			const o = obj(g, "guild");
			return {
				name: str(o.name, "guild.name", 48, 1),
				...(o.rank != null ? { rank: str(o.rank, "guild.rank", 48) } : {}),
				...(o.rankIndex != null ? { rankIndex: int(o.rankIndex, "guild.rankIndex", 0, 20) } : {}),
			};
		});
		const character: AddonCharacter = {
			guid: str(c.guid, "guid", 64, 1),
			name: str(c.name, "name", 48, 1),
			level: opt(c.level, (l) => int(l, "level", 1, 100)),
			xp: opt(c.xp, (n) => int(n, "xp", 0, 1_000_000_000)),
			xpMax: opt(c.xpMax, (n) => int(n, "xpMax", 0, 1_000_000_000)),
			classToken: opt(c.classToken, (s) => str(s, "classToken", 24)),
			raceToken: opt(c.raceToken, (s) => str(s, "raceToken", 32)),
			capturedAt: time(c.capturedAt, "capturedAt", now),
			guild,
			talents: arr(c.talents ?? [], "talents", LIMITS.talents).map((t, i) => {
				const o = obj(t, `talents[${i}]`);
				return {
					id: int(o.id, `talents[${i}].id`, 1, 100_000_000),
					rank: int(o.rank, `talents[${i}].rank`, 0, 10),
					...(o.name != null ? { name: str(o.name, `talents[${i}].name`, LIMITS.name) } : {}),
				};
			}),
			equipment: opt(c.equipment, (e) => equipment(e, now)),
			professions: opt(c.professions, (p) => professions(p, now)),
			recipes: opt(c.recipes, (r) => recipes(r, now)) ?? [],
			proficiencies: opt(c.proficiencies, (p) => proficiencies(p, now)),
			inventory: opt(c.inventory, (i) => inventory(i, now)),
			quests: opt(c.quests, (q) => quests(q, now)),
		};
		return { ok: true, character };
	} catch (error) {
		if (error instanceof Invalid) return { ok: false, name, error: error.message };
		throw error;
	}
}

/**
 * Match recipes the game named to the catalog's recipe ids, within one
 * profession: by the item it makes, then by name. Several catalog rows can
 * share an item or name; the one the character already knows per Blizzard
 * wins, else the first. Returns the ids and how many found no match.
 */
export function matchRecipes(
	known: { name: string; itemId?: number }[],
	catalog: { recipeId: number; name: string; craftedItemId?: number }[],
	alreadyKnown: Set<number> = new Set(),
) {
	const byItem = new Map<number, number[]>();
	const byName = new Map<string, number[]>();
	for (const r of catalog) {
		if (r.craftedItemId) byItem.set(r.craftedItemId, [...(byItem.get(r.craftedItemId) ?? []), r.recipeId]);
		const key = r.name.toLowerCase();
		byName.set(key, [...(byName.get(key) ?? []), r.recipeId]);
	}
	const pick = (ids: number[] | undefined) => (ids ? (ids.find((id) => alreadyKnown.has(id)) ?? ids[0]) : undefined);
	const ids = new Set<number>();
	let unmatched = 0;
	for (const k of known) {
		const id =
			(k.itemId !== undefined ? pick(byItem.get(k.itemId)) : undefined) ?? pick(byName.get(k.name.toLowerCase()));
		if (id === undefined) unmatched++;
		else ids.add(id);
	}
	return { recipeIds: [...ids], unmatched };
}
