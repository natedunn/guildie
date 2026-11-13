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

export type AddonEntry = { name: string; title?: string; version?: string };

/**
 * Every addon the given people run, most used first: who runs it (indexes
 * into `people`) and the versions seen. `people` keep their order.
 */
export function summarizeAddons(people: { list: AddonEntry[] }[]) {
	const byName = new Map<string, { name: string; title?: string; people: number[]; versions: Set<string> }>();
	people.forEach((person, i) => {
		for (const addon of person.list) {
			const key = addon.name.toLowerCase();
			let row = byName.get(key);
			if (!row) {
				row = { name: addon.name, title: addon.title, people: [], versions: new Set() };
				byName.set(key, row);
			}
			if (!row.title && addon.title) row.title = addon.title;
			if (!row.people.includes(i)) row.people.push(i);
			if (addon.version) row.versions.add(addon.version);
		}
	});
	return [...byName.values()]
		.map(({ versions, ...row }) => ({ ...row, versions: [...versions].sort() }))
		.sort((a, b) => b.people.length - a.people.length || (a.title ?? a.name).localeCompare(b.title ?? b.name));
}
