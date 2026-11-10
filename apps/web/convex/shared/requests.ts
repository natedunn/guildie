// Guild requests: a member asks for an item (reagents and the like) or for a
// craft; a guildmate claims it, makes the trade or mail happen, and the
// requester marks it done. These are the rules, kept free of Convex imports
// so the site, the backend and `node --test` share them (requests.test.ts).
// The handlers are in convex/requests.ts.

export const REQUEST_LIMITS = {
	/** Open (or claimed) requests per player per guild. */
	open: 10,
	quantity: 1000,
	note: 140,
} as const;

const DAY_MS = 86_400_000;
/** No activity this long: shown as stale, and the requester is asked "Still need this?". */
export const STALE_MS = 7 * DAY_MS;
/** No activity this long: closed as expired by the daily cron. */
export const EXPIRE_MS = 30 * DAY_MS;

export type RequestKind = "item" | "craft";
export type RequestStatus = "open" | "claimed" | "done" | "cancelled" | "expired";
/**
 * How we know a craft's requester has the reagents: the Guildie app's bag and
 * bank scan covers them (`inventory`), they said so (`declared`), or neither
 * (`missing`; still allowed, shown as it is).
 */
export type MatsState = "inventory" | "declared" | "missing";

export const ACTIVE: RequestStatus[] = ["open", "claimed"];
export const isActive = (status: RequestStatus) => status === "open" || status === "claimed";

/** The parts of a request the rules look at. Ids are whatever the caller uses (user ids). */
export type RequestLike = {
	kind: RequestKind;
	status: RequestStatus;
	requester: string;
	claim?: { userId: string; sentAt?: number };
	lastActivityAt: number;
};

export type Action = "claim" | "unclaim" | "markSent" | "complete" | "cancel" | "keep" | "setMats";

/**
 * Membership: of the roster rows for a player's claimed characters, those in
 * this guild's roster now. None means not a member: they can't see, create,
 * claim or close anything there, even in a public guild.
 */
export function rosterCharacters<T extends { inRoster: boolean; guildId: string }>(
	rows: (T | null | undefined)[],
	guildId: string,
): T[] {
	return rows.filter((r): r is T => !!r && r.inRoster && r.guildId === guildId);
}

/** Who's acting: a guild member, and for crafts whether one of their characters knows the recipe. */
export type Actor = { userId: string; knowsRecipe?: boolean };

export type Verdict = { ok: true } | { ok: false; error: string };

const no = (error: string): Verdict => ({ ok: false, error });
const yes: Verdict = { ok: true };

/** May `actor` do `action` to `req` now? Errors are written for the player. */
export function check(action: Action, req: RequestLike, actor: Actor): Verdict {
	const mine = req.requester === actor.userId;
	const claimant = req.claim?.userId === actor.userId;
	if (!isActive(req.status)) return no("This request is closed.");
	switch (action) {
		case "claim":
			if (mine) return no("That's your own request.");
			if (req.status !== "open") return no("Someone already claimed this.");
			if (req.kind === "craft" && !actor.knowsRecipe) return no("None of your characters knows this recipe.");
			return yes;
		case "unclaim":
			if (req.status !== "claimed") return no("Nobody has claimed this.");
			// The claimant lets it go, or the requester takes it back from someone who went quiet.
			if (!claimant && !mine) return no("Only whoever claimed it, or the requester, can release it.");
			return yes;
		case "markSent":
			if (req.status !== "claimed" || !claimant) return no("Only whoever claimed it can mark it sent.");
			return yes;
		case "complete":
		case "cancel":
		case "keep":
			if (!mine) return no("Only the requester can do that.");
			return yes;
		case "setMats":
			if (!mine) return no("Only the requester can do that.");
			if (req.kind !== "craft") return no("Only craft requests have mats.");
			if (req.status !== "open") return no("The mats can only change before someone claims it.");
			return yes;
	}
}

/** The status after `action` (the caller also stamps lastActivityAt and the claim). */
export function nextStatus(action: Action, status: RequestStatus): RequestStatus {
	switch (action) {
		case "claim":
			return "claimed";
		case "unclaim":
			return "open";
		case "complete":
			return "done";
		case "cancel":
			return "cancelled";
		default:
			return status;
	}
}

export const isStale = (req: Pick<RequestLike, "status" | "lastActivityAt">, now: number) =>
	isActive(req.status) && now - req.lastActivityAt >= STALE_MS;

export const shouldExpire = (req: Pick<RequestLike, "status" | "lastActivityAt">, now: number) =>
	isActive(req.status) && now - req.lastActivityAt >= EXPIRE_MS;

/** A new request's quantity and note, checked and tidied. Throws the player-facing message. */
export function validateNew(input: { quantity: number; note?: string; openCount: number }) {
	if (input.openCount >= REQUEST_LIMITS.open)
		throw new RangeError(
			`You have ${REQUEST_LIMITS.open} open requests in this guild. Close one (or mark it done) first.`,
		);
	if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > REQUEST_LIMITS.quantity)
		throw new RangeError(`Quantity is 1 to ${REQUEST_LIMITS.quantity}.`);
	const note = input.note?.replace(/\s+/g, " ").trim() || undefined;
	if (note && note.length > REQUEST_LIMITS.note)
		throw new RangeError(`Keep the note under ${REQUEST_LIMITS.note} characters.`);
	return { quantity: input.quantity, note };
}

// ---- Mats from the Guildie app's inventory scan --------------------------------

/** One character's scan: bags, and the last time the bank was open. Counts by item id. */
export type InventoryScan = {
	bags?: { capturedAt: number; items: { id: number; count: number }[] };
	bank?: { capturedAt: number; items: { id: number; count: number }[] };
};

/**
 * Everything across a player's characters (bags + last bank read). The addon
 * reads them in game, but Guildie only gets them when the app uploads the
 * save file (after a /reload or logout), so this is as of then, not live.
 * `bagsAt`/`bankAt`: the newest bag read and the newest bank read.
 */
export function sumInventory(scans: InventoryScan[]) {
	const counts = new Map<number, number>();
	let bagsAt: number | undefined;
	let bankAt: number | undefined;
	for (const scan of scans) {
		if (scan.bags) bagsAt = Math.max(bagsAt ?? 0, scan.bags.capturedAt);
		if (scan.bank) bankAt = Math.max(bankAt ?? 0, scan.bank.capturedAt);
		for (const part of [scan.bags, scan.bank]) {
			for (const { id, count } of part?.items ?? []) counts.set(id, (counts.get(id) ?? 0) + count);
		}
	}
	return { counts, scanned: bagsAt !== undefined || bankAt !== undefined, bagsAt, bankAt };
}

export type ReagentCheck = { itemId: number; name: string; need: number; have: number };

/**
 * Have/need per reagent for `quantity` crafts. `covered` when every reagent
 * is there. Recipes that make several at once aren't known here, so one
 * craft per item asked for (an overestimate at worst).
 */
export function matsCheck(
	reagents: { itemId: number; name: string; quantity: number }[],
	quantity: number,
	scans: InventoryScan[],
) {
	const { counts, scanned, bagsAt, bankAt } = sumInventory(scans);
	const list: ReagentCheck[] = reagents.map((r) => ({
		itemId: r.itemId,
		name: r.name,
		need: r.quantity * quantity,
		have: counts.get(r.itemId) ?? 0,
	}));
	return {
		reagents: list,
		scanned,
		bagsAt,
		bankAt,
		/** The newest read the check used (stored on the request). */
		checkedAt: scanned ? Math.max(bagsAt ?? 0, bankAt ?? 0) : undefined,
		covered: scanned && reagents.length > 0 && list.every((r) => r.have >= r.need),
	};
}

/**
 * The stored mats state: the scan when it covers the reagents, else what the
 * requester said ("I have the mats"), else missing.
 */
export function matsState(covered: boolean, declared: boolean): MatsState {
	if (covered) return "inventory";
	return declared ? "declared" : "missing";
}

/** What guildmates see (never the counts). */
export function matsLabel(state: MatsState | undefined) {
	if (state === "inventory") return "Has the mats";
	if (state === "declared") return "Has the mats (says so)";
	return "Mats not confirmed";
}
