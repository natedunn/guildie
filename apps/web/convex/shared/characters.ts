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
