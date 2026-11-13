// Who sees a player's addons, and a guild's addons summed up. Pure, so
// `node --test` runs it (convex/addons.test.ts); convex/addons.ts reads the rows.

export type AddonShare = "none" | "guild" | "public";

export const ADDON_SHARES: { value: AddonShare; label: string; note: string }[] = [
	{ value: "none", label: "No one", note: "Not kept on Guildie." },
	{ value: "guild", label: "Guild", note: "Members of your characters' guilds." },
	{ value: "public", label: "Public", note: "Anyone who can see your characters." },
];

/**
 * Whether a viewer sees a player's addons: the player always does; guildmates
 * (members of the guild of the character or page they're looking at) when
 * shared with the guild; anyone when public.
 */
export function canSeeAddons(share: AddonShare | undefined, viewer: { isOwner: boolean; isMember: boolean }) {
	if (viewer.isOwner) return true;
	if (share === "public") return true;
	return share === "guild" && viewer.isMember;
}

export type AddonEntry = { name: string; title?: string; version?: string; notes?: string; curseId?: number };

/** What we keep of a CurseForge project (addonCatalog in schema.ts). */
export type CatalogInfo = { name?: string; summary?: string; logo?: string; url?: string; categories?: string[] };

/** The fields of CurseForge's mod object we read. */
export type CurseMod = {
	id: number;
	gameId?: number;
	name?: string;
	summary?: string;
	links?: { websiteUrl?: string };
	logo?: { thumbnailUrl?: string; url?: string };
	categories?: { name?: string }[];
};

const WOW_GAME_ID = 1;
const clip = (text: string | undefined, max: number) => text?.trim().slice(0, max) || undefined;
const httpsUnder = (url: string | undefined, host: RegExp) => {
	try {
		const u = new URL(url ?? "");
		return u.protocol === "https:" && host.test(u.hostname) ? u.toString() : undefined;
	} catch {
		return undefined;
	}
};

/**
 * A catalog row from a CurseForge mod: only WoW projects, links only to
 * curseforge.com and logos only from its CDN.
 */
export function catalogEntry(mod: CurseMod): CatalogInfo & { curseId: number; missing?: boolean } {
	if (mod.gameId !== undefined && mod.gameId !== WOW_GAME_ID) return { curseId: mod.id, missing: true };
	const categories = [
		...new Set((mod.categories ?? []).map((c) => clip(c.name, 40)).filter((c): c is string => !!c)),
	].slice(0, 6);
	return {
		curseId: mod.id,
		name: clip(mod.name, 100),
		summary: clip(mod.summary, 300),
		logo: httpsUnder(mod.logo?.thumbnailUrl ?? mod.logo?.url, /(^|\.)forgecdn\.net$/),
		url: httpsUnder(mod.links?.websiteUrl, /(^|\.)curseforge\.com$/),
		...(categories.length ? { categories } : {}),
	};
}

/** One person running an addon: their index in `people` and the version they have. */
export type AddonUser = { person: number; version?: string };

export type AddonRow = {
	/** Stable key: the CurseForge project, else the folder name. */
	key: string;
	/** Display name: the .toc title (CurseForge's names run long), else CurseForge's, else the folder. */
	title: string;
	/** The folders it's made of (several for addons with modules). */
	folders: string[];
	summary?: string;
	logo?: string;
	url?: string;
	categories: string[];
	users: AddonUser[];
};

/**
 * Every addon the given people run, most used first. Folders of one
 * CurseForge project (DBM-Core, DBM-Raids-…) are one addon, named by
 * the .toc and described by the catalog when it has the project. Each
 * person counts once, with the version of the addon's main folder (the one
 * with the shortest name). `people` keep their order.
 */
export function summarizeAddons(people: { list: AddonEntry[] }[], catalog: Map<number, CatalogInfo> = new Map()) {
	type Group = { key: string; curseId?: number; entries: Map<string, AddonEntry>; byPerson: Map<number, AddonEntry[]> };
	// A folder's project from anyone who sent it (older addons don't).
	const projectOf = new Map<string, number>();
	for (const person of people) {
		for (const a of person.list) if (a.curseId) projectOf.set(a.name.toLowerCase(), a.curseId);
	}
	const groups = new Map<string, Group>();
	people.forEach((person, i) => {
		for (const sent of person.list) {
			const curseId = sent.curseId ?? projectOf.get(sent.name.toLowerCase());
			const addon = curseId ? { ...sent, curseId } : sent;
			const key = curseId ? `curse:${curseId}` : `name:${addon.name.toLowerCase()}`;
			let group = groups.get(key);
			if (!group) {
				group = { key, curseId: addon.curseId, entries: new Map(), byPerson: new Map() };
				groups.set(key, group);
			}
			const folder = addon.name.toLowerCase();
			const known = group.entries.get(folder);
			group.entries.set(folder, {
				...known,
				...addon,
				title: known?.title ?? addon.title,
				notes: known?.notes ?? addon.notes,
			});
			group.byPerson.set(i, [...(group.byPerson.get(i) ?? []), addon]);
		}
	});
	const rows: AddonRow[] = [];
	for (const group of groups.values()) {
		const entries = [...group.entries.values()].sort(
			(a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name),
		);
		const main = entries[0];
		const info = group.curseId ? catalog.get(group.curseId) : undefined;
		const users = [...group.byPerson.entries()]
			.map(([person, theirs]) => {
				const mine = theirs.find((e) => e.name.toLowerCase() === main.name.toLowerCase()) ?? theirs[0];
				return { person, ...(mine.version ? { version: mine.version } : {}) };
			})
			.sort((a, b) => a.person - b.person);
		rows.push({
			key: group.key,
			title: main.title ?? info?.name ?? main.name,
			folders: entries.map((e) => e.name),
			summary: info?.summary ?? entries.find((e) => e.notes)?.notes,
			logo: info?.logo,
			url: info?.url,
			categories: info?.categories ?? [],
			users,
		});
	}
	return rows.sort((a, b) => b.users.length - a.users.length || a.title.localeCompare(b.title));
}
