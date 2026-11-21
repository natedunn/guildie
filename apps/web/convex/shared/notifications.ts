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
	| "craftBackedOut"
	| "itemsMailed";

/**
 * Where each kind is shown besides the site's inbox. desktop "optIn": only
 * apps that ask for it (an experimental setting in Settings → App) show it.
 */
export const CHANNELS: Record<NotificationKind, { desktop: boolean | "optIn"; game: boolean }> = {
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
	// A guildmate's addon reported mailing you something for your request, before you've collected it.
	itemsMailed: { desktop: "optIn", game: false },
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
		case "itemsMailed":
			return `${who} mailed you ${count}${what.name}`;
	}
}

/** How a notification's event ended since, shown beside it in the inbox ("Cancelled"). */
export type NotificationSince = "cancelled" | "done" | "expired" | "accepted" | "declined" | "lapsed";

export const SINCE_LABEL: Record<NotificationSince, string> = {
	cancelled: "Cancelled",
	done: "Done",
	expired: "Expired",
	accepted: "You accepted",
	declined: "You declined",
	lapsed: "Lapsed",
};

/** Kinds that wait on something, so can be overtaken by what happened next. */
const PENDING_KINDS = new Set<NotificationKind>(["craftAsked", "craftAccepted", "craftClaimed", "craftSent"]);

/**
 * Whether the request has moved on since this notification: an ask that was
 * cancelled, answered or lapsed, a craft that's done. Read from the request
 * as it is now, so nothing about who saw what needs keeping.
 */
export function notificationSince(
	kind: NotificationKind,
	at: number,
	userId: string,
	r: {
		status: "open" | "claimed" | "done" | "cancelled" | "expired";
		ask?: { userId: string };
		claim?: { userId: string };
		lastAsk?: { outcome: "declined" | "lapsed" | "backedOut"; at: number };
	},
): NotificationSince | undefined {
	if (!PENDING_KINDS.has(kind)) return undefined;
	if (r.status === "cancelled") return "cancelled";
	if (r.status === "done") return "done";
	if (r.status === "expired") return "expired";
	if (kind !== "craftAsked" || r.ask?.userId === userId) return undefined;
	if (r.claim?.userId === userId) return "accepted";
	if (r.lastAsk && r.lastAsk.at >= at && r.lastAsk.outcome !== "backedOut") return r.lastAsk.outcome;
	return undefined;
}

/**
 * The inbox's second line, after the actor's name: "cancelled their craft
 * request". Kinds with no actor are whole sentences ("Your request is
 * complete"). `mailed`: how many (itemsMailed).
 */
export function notificationEvent(kind: NotificationKind, opts: { since?: boolean; mailed?: number } = {}) {
	switch (kind) {
		case "craftClaimed":
			return "will craft it";
		case "craftSent":
			return "sent it";
		case "requestDone":
			return "Your request is complete";
		case "requestExpired":
			return "Your request expired";
		case "craftAsked":
			return opts.since ? "asked you to craft it" : "asks you to craft it";
		case "craftAccepted":
			return "accepted your craft";
		case "craftDeclined":
			return "declined your craft. Ask someone else?";
		case "askLapsed":
			return "didn't answer in 7 days. Ask someone else?";
		case "craftWithdrawn":
			return "cancelled their craft request";
		case "craftBackedOut":
			return "can't craft it after all. Ask someone else?";
		case "itemsMailed":
			return opts.mailed ? `mailed you ${opts.mailed}` : "mailed you some";
	}
}

/** Kinds whose second line is a whole sentence, with no one's name before it. */
export const NO_ACTOR = new Set<NotificationKind>(["requestDone", "requestExpired"]);
