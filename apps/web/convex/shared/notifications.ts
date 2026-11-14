// What a notification says and where it shows, kept free of Convex imports
// so tests can run it (notifications.test.ts). The handlers are in
// convex/notifications.ts.

export type NotificationKind =
	| "craftClaimed"
	| "craftSent"
	| "requestDone"
	| "requestExpired"
	| "craftAsked"
	| "craftAccepted"
	| "craftDeclined"
	| "askLapsed"
	| "craftWithdrawn"
	| "craftBackedOut";

/** Where each kind is shown besides the site's inbox. */
export const CHANNELS: Record<NotificationKind, { desktop: boolean; game: boolean }> = {
	craftClaimed: { desktop: true, game: true },
	craftSent: { desktop: true, game: true },
	requestDone: { desktop: true, game: false },
	requestExpired: { desktop: false, game: false },
	// To the crafter:
	craftAsked: { desktop: true, game: true },
	craftWithdrawn: { desktop: false, game: false },
	// To the requester:
	craftAccepted: { desktop: true, game: true },
	craftDeclined: { desktop: true, game: true },
	askLapsed: { desktop: false, game: false },
	craftBackedOut: { desktop: true, game: false },
};

/** Only recent ones become a system notification or a chat line (the app or game may have been off for days). */
export const TOAST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const GAME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Kept this long, then the daily prune deletes them. */
export const KEEP_MS = 60 * 24 * 60 * 60 * 1000;

type Actor = { name: string };

export function notificationText(kind: NotificationKind, what: { name: string; quantity?: number }, actor?: Actor) {
	const times = what.quantity ? ` ×${what.quantity}` : "";
	const count = what.quantity ? `${what.quantity} ` : "";
	const who = actor?.name ?? "Someone";
	switch (kind) {
		case "craftClaimed":
			return `${who} will craft your ${what.name}${times}`;
		case "craftSent":
			return `${who} sent your ${what.name}${times}`;
		case "requestDone":
			return `Your request for ${count}${what.name} is complete`;
		case "requestExpired":
			return `Your request for ${count}${what.name} expired`;
		case "craftAsked":
			return `${who} asks you to craft ${what.name}${times}`;
		case "craftAccepted":
			return `${who} accepted your craft: ${what.name}${times}`;
		case "craftDeclined":
			return `${who} declined your craft: ${what.name}${times}. Ask someone else?`;
		case "askLapsed":
			return `${who} didn't answer your craft request for ${what.name} in 7 days. Ask someone else?`;
		case "craftWithdrawn":
			return `${who} cancelled their craft request for ${what.name}${times}`;
		case "craftBackedOut":
			return `${who} can't craft your ${what.name} after all. Ask someone else?`;
	}
}
