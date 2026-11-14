// What a notification says and where it shows, kept free of Convex imports
// so tests can run it (notifications.test.ts). The handlers are in
// convex/notifications.ts.

export type NotificationKind = "craftClaimed" | "craftSent" | "requestDone" | "requestExpired";

/** Where each kind is shown besides the site's inbox. */
export const CHANNELS: Record<NotificationKind, { desktop: boolean; game: boolean }> = {
	craftClaimed: { desktop: true, game: true },
	craftSent: { desktop: true, game: true },
	requestDone: { desktop: true, game: false },
	requestExpired: { desktop: false, game: false },
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
	}
}
