/**
 * Which characters show where, by level. Low characters (bank alts, fresh
 * rolls) crowd the roster and the sidebar, so both leave them out unless
 * someone asks.
 */

/** The roster hides characters under this level unless the Filter menu shows them. */
export const ROSTER_MIN_LEVEL = 10;

/** A player's own characters under this level stay out of their sidebar unless pinned. */
export const SIDEBAR_MIN_LEVEL = 5;

/**
 * Whether a player's character is in their sidebar: what they chose with the
 * pin (Account page), else from level 5. An unknown level counts as shown.
 */
export function inSidebar(level: number | undefined, choice: boolean | undefined) {
	if (choice !== undefined) return choice;
	return level === undefined || level >= SIDEBAR_MIN_LEVEL;
}

type Listing = { inRoster: boolean; hidden?: { at: number; inGuild: boolean } };

/**
 * The change to a character row when its player hides it from Guildie or
 * shows it again (users.setHidden); null when it's already that way. Hiding
 * keeps whether it's in the guild, so showing it again needs no roster sync.
 */
export function hiddenPatch(row: Listing, hide: boolean, now: number) {
	if (hide) return row.hidden ? null : { inRoster: false, hidden: { at: now, inGuild: row.inRoster } };
	return row.hidden ? { inRoster: row.hidden.inGuild, hidden: undefined } : null;
}

/**
 * What a roster sync writes about membership (sync.applyRoster): a hidden
 * character stays unlisted, and only its `inGuild` follows the roster.
 */
export function rosterPatch(row: Listing | undefined, inGuild: boolean) {
	if (row?.hidden) return { inRoster: false, hidden: { ...row.hidden, inGuild } };
	return { inRoster: inGuild };
}
