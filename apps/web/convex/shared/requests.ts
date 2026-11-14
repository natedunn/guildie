// Guild requests: a member asks for an item (reagents and the like) or for a
// craft. Item requests aren't claimed: anyone sends some, and the requester's
// addon counts what arrives and closes it (or the requester marks it done).
// A craft is asked of one guildmate who knows the recipe; they accept or
// decline (an ask lapses after 7 days). Once accepted, the mats the requester
// sends them show as progress, and the crafted item (or the enchant, over
// trade) arriving closes it. The requester can always mark it done. An item can instead be asked for as ongoing ("send
// me any Silk Cloth you have"): no quantity and no claims, up for 2 weeks to
// 3 months, then it ends by itself. One active item request per item, of
// either kind. These are the rules, kept free of Convex imports
// so the site, the backend and `node --test` share them (requests.test.ts).
// The handlers are in convex/requests.ts.

export const REQUEST_LIMITS = {
	/** Open (or claimed) fixed-amount requests per player per guild. */
	open: 15,
	/** Ongoing requests per player per guild, counted apart. */
	ongoing: 20,
	quantity: 1000,
	note: 140,
} as const;

const DAY_MS = 86_400_000;
/** No activity this long: shown as stale, and the requester is asked "Still need this?". */
export const STALE_MS = 7 * DAY_MS;
/** No activity this long: closed as expired by the daily cron. */
export const EXPIRE_MS = 30 * DAY_MS;

/** How long an ongoing request stays up: 2 weeks, 1 month or 3 months (the most). */
export const ONGOING_DAYS = [14, 30, 90] as const;
export type OngoingDays = (typeof ONGOING_DAYS)[number];
export const DEFAULT_ONGOING_DAYS: OngoingDays = 30;

/** When an ongoing request asked for `days` now ends. Throws the player-facing message. */
export function ongoingUntil(days: number, now: number) {
	if (!(ONGOING_DAYS as readonly number[]).includes(days)) throw new RangeError("Pick 2 weeks, 1 month or 3 months.");
	return now + days * DAY_MS;
}

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
	/** Ongoing: "send me any you have", never claimed, ends at `until`. */
	ongoing?: boolean;
	until?: number;
	requester: string;
	/** Crafts: the guildmate asked, until they answer. */
	ask?: { userId: string };
	/** Accepted crafts (the crafter), and item claims from before claims ended. */
	claim?: { userId: string; sentAt?: number };
	lastActivityAt: number;
};

export type Action =
	| "claim"
	| "ask"
	| "accept"
	| "decline"
	| "unclaim"
	| "markSent"
	| "complete"
	| "cancel"
	| "keep"
	| "setMats";

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
	// Ongoing: nobody claims it; the requester only stops it (or changes it, canChange).
	if (req.ongoing && action !== "cancel") return no("Ongoing requests aren't claimed. Send any you have.");
	switch (action) {
		case "claim":
			// Nothing is claimed anymore. Old claims can still be released, and old item claims marked sent.
			return req.kind === "item"
				? no("Item requests aren't claimed. Send what you have; it counts when it arrives.")
				: no("Crafts are asked of one crafter, who accepts.");
		case "ask":
			if (!mine) return no("Only the requester can do that.");
			if (req.kind !== "craft") return no("Only crafts are asked of someone.");
			if (req.status !== "open") return no("A crafter already accepted this.");
			if (req.ask) return no("Wait for their answer, or cancel and ask again.");
			return yes;
		case "accept":
		case "decline":
			if (req.status !== "open" || req.ask?.userId !== actor.userId) return no("This wasn't asked of you.");
			return yes;
		case "unclaim":
			if (req.status !== "claimed") return no("Nobody has taken this on.");
			// The crafter backs out, or the requester takes it back from someone who went quiet.
			if (!claimant && !mine) return no("Only the crafter, or the requester, can do that.");
			return yes;
		case "markSent":
			// Crafts count when they arrive; only item claims from before can be marked sent.
			if (req.kind !== "item" || req.status !== "claimed" || !claimant)
				return no("Only whoever claimed it can mark it sent.");
			return yes;
		case "complete":
		case "cancel":
		case "keep":
			if (!mine) return no("Only the requester can do that.");
			return yes;
		case "setMats":
			if (!mine) return no("Only the requester can do that.");
			if (req.kind !== "craft") return no("Only craft requests have mats.");
			if (req.status !== "open") return no("The mats can only change before the crafter accepts.");
			return yes;
	}
}

/** The status after `action` (the caller also stamps lastActivityAt and the claim). */
export function nextStatus(action: Action, status: RequestStatus): RequestStatus {
	switch (action) {
		case "claim":
		case "accept":
			return "claimed";
		case "unclaim":
		case "decline":
			return "open";
		case "complete":
			return "done";
		case "cancel":
			return "cancelled";
		default:
			return status;
	}
}

type Timed = Pick<RequestLike, "status" | "lastActivityAt" | "ongoing" | "until">;

/** An unanswered ask to a crafter lapses after this (the requester can ask someone else). */
export const ASK_MS = 7 * DAY_MS;

/** Fixed-amount requests go quiet; ongoing ones have an end date instead. */
export const isStale = (req: Timed, now: number) =>
	isActive(req.status) && !req.ongoing && now - req.lastActivityAt >= STALE_MS;

export const shouldExpire = (req: Timed, now: number) =>
	isActive(req.status) &&
	(req.ongoing ? req.until !== undefined && now >= req.until : now - req.lastActivityAt >= EXPIRE_MS);

/**
 * A new (or changed) request's quantity and note, checked and tidied.
 * `openCount`: the player's other active requests of the same kind in this
 * guild. Ongoing requests have no quantity (stored as 0). Throws the
 * player-facing message.
 */
export function validateNew(input: { ongoing?: boolean; quantity: number; note?: string; openCount: number }) {
	if (input.ongoing) {
		if (input.openCount >= REQUEST_LIMITS.ongoing)
			throw new RangeError(`You have ${REQUEST_LIMITS.ongoing} ongoing requests in this guild. Stop one first.`);
	} else {
		if (input.openCount >= REQUEST_LIMITS.open)
			throw new RangeError(
				`You have ${REQUEST_LIMITS.open} open requests in this guild. Close one (or mark it done) first.`,
			);
		if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > REQUEST_LIMITS.quantity)
			throw new RangeError(`Quantity is 1 to ${REQUEST_LIMITS.quantity}.`);
	}
	const note = input.note?.replace(/\s+/g, " ").trim() || undefined;
	if (note && note.length > REQUEST_LIMITS.note)
		throw new RangeError(`Keep the note under ${REQUEST_LIMITS.note} characters.`);
	return { quantity: input.ongoing ? 0 : input.quantity, note };
}

/**
 * May `userId` change this request (switch between fixed amount and ongoing,
 * the quantity, how long, the note)? Their own item requests, until someone
 * claims one: nobody's claim gets pulled out from under them.
 */
export function canChange(req: RequestLike, userId: string): Verdict {
	if (req.requester !== userId) return no("Only the requester can do that.");
	if (!isActive(req.status)) return no("This request is closed.");
	if (req.kind !== "item") return no("Craft requests can't be changed. Cancel it and ask again.");
	if (req.status !== "open") return no("Someone already claimed it. Mark it done, or release the claim, first.");
	return yes;
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

/** Fixed requests (items, and crafted items) count down as receipts arrive; the stored quantity stays the target. */
export function remainingQuantity(request: {
	kind: string;
	quantity: number;
	receivedQuantity?: number;
	ongoing?: boolean;
}) {
	return request.ongoing ? request.quantity : Math.max(0, request.quantity - (request.receivedQuantity ?? 0));
}

/**
 * Full requests the viewer can fill using their own latest inventory scans.
 * Ongoing ones: any at all (they want whatever you have).
 */
export function canHelpFromInventory(
	request: {
		kind: "item" | "craft";
		status: string;
		quantity: number;
		receivedQuantity?: number;
		itemId?: number;
		recipeId?: number;
		ongoing?: boolean;
	},
	mine: boolean,
	known: Set<number>,
	scans: InventoryScan[],
	reagents?: { itemId: number; name: string; quantity: number }[],
) {
	if (mine || request.status !== "open") return false;
	if (request.ongoing) return request.itemId !== undefined && (sumInventory(scans).counts.get(request.itemId) ?? 0) > 0;
	if (request.kind === "item") {
		return (
			request.itemId !== undefined &&
			(sumInventory(scans).counts.get(request.itemId) ?? 0) >= remainingQuantity(request)
		);
	}
	// Crafts are asked of one crafter: "I can help" is an ask to you (the caller knows).
	return false;
}

export const deliveryName = (name: string) => name.trim().toLowerCase().replace(/ /g, "-");
/**
 * Whether a name the game showed is this character. Blizzard's `name` for a
 * Forever character is the first name only and its slug is
 * `{name}-{surname}`; the game may show either ("Bung", "Bung Dingus"). The
 * reporter is pinned by its GUID, so this only checks the other side. The
 * addon has the same rule (Deliveries.lua, `sameCharacter`).
 */
export function sameCharacter(observed: string, c: { name: string; slug?: string }) {
	const key = deliveryName(observed);
	return key !== "" && (key === deliveryName(c.name) || key === c.slug);
}
type DeliveryReport = { kind: string; other: string; itemId: number; quantity: number; at: number };
type DeliveryRequest = {
	kind: string;
	itemId?: number;
	status: string;
	quantity: number;
	ongoing?: boolean;
	until?: number;
	userId: string;
	guildId: string;
	character: { slug: string; name: string };
	createdAt: number;
	claim?: { userId: string; character: { name: string; slug: string }; claimedAt: number };
	receivedQuantity?: number;
	sentQuantity?: number;
};
/** Why a delivery report didn't count, kept on its ledger row for debugging. */
export type DeliveryRejection =
	| "not an item request"
	| "different item"
	| "request closed"
	| "other guild"
	| "before the request"
	| "in the future"
	| "older than 30 days"
	| "ongoing request ended"
	| "not the requester"
	| "before the claim"
	| "not from the claimant"
	| "request not claimed"
	| "not the claimant"
	| "not to the requester"
	| "craft not accepted"
	| "not an enchant"
	| "not between requester and crafter";

/**
 * What a report counts toward: the requester receiving what they asked for
 * (`receipt`), the claimant's own report of sending it (`sent`, never
 * progress), or a craft's mats going from the requester to the crafter, as
 * either of them saw it (`matsSent`, `matsReceived`; progress is the larger).
 */
export type DeliveryUse = "receipt" | "sent" | "matsSent" | "matsReceived";

type Reporter = { userId: string; slug: string; name: string; guildId: string };

export function deliveryOutcome(
	r: DeliveryRequest,
	e: DeliveryReport,
	reporter: Reporter,
	now: number,
	/** Crafts: the recipe's reagent item ids. */
	reagents: number[] = [],
): { use: DeliveryUse } | { rejected: DeliveryRejection } {
	const no = (rejected: DeliveryRejection) => ({ rejected });
	if (!["open", "claimed"].includes(r.status)) return no("request closed");
	if (r.guildId !== reporter.guildId) return no("other guild");
	if (e.at < r.createdAt) return no("before the request");
	if (e.at > now + 600000) return no("in the future");
	if (now - e.at > 30 * DAY_MS) return no("older than 30 days");
	if (r.ongoing && r.until !== undefined && (r.until <= now || e.at >= r.until)) return no("ongoing request ended");
	const received = e.kind.endsWith("Received");
	const isRequester = r.userId === reporter.userId && r.character.slug === reporter.slug;
	const isClaimant = !!r.claim && r.claim.userId === reporter.userId && r.claim.character.slug === reporter.slug;

	if (r.kind === "item") {
		if (e.kind === "enchantReceived") return no("not an enchant");
		if (r.itemId !== e.itemId) return no("different item");
		if (received) {
			if (!isRequester) return no("not the requester");
			if (r.claim && e.at < r.claim.claimedAt) return no("before the claim");
			if (r.claim && !sameCharacter(e.other, r.claim.character)) return no("not from the claimant");
			return { use: "receipt" };
		}
		if (!r.claim) return no("request not claimed");
		if (!isClaimant) return no("not the claimant");
		if (e.at < r.claim.claimedAt) return no("before the claim");
		if (!sameCharacter(e.other, r.character)) return no("not to the requester");
		return { use: "sent" };
	}

	// Crafts: only between the requester and the crafter who accepted.
	const claim = r.claim;
	if (r.status !== "claimed" || !claim) return no("craft not accepted");
	const fromCrafter = sameCharacter(e.other, claim.character);
	const toRequester = sameCharacter(e.other, r.character);
	if (e.kind === "enchantReceived") {
		if (r.itemId !== undefined) return no("not an enchant");
		if (!isRequester) return no("not the requester");
		if (e.at < claim.claimedAt) return no("before the claim");
		if (!fromCrafter) return no("not from the claimant");
		return { use: "receipt" };
	}
	if (r.itemId !== undefined && e.itemId === r.itemId) {
		if (e.at < claim.claimedAt) return no("before the claim");
		if (received) {
			if (!isRequester) return no("not the requester");
			if (!fromCrafter) return no("not from the claimant");
			return { use: "receipt" };
		}
		if (!isClaimant) return no("not the claimant");
		if (!toRequester) return no("not to the requester");
		return { use: "sent" };
	}
	// Mats may go over before the crafter answers; any time since the request counts.
	if (reagents.includes(e.itemId)) {
		if (received && isClaimant && toRequester) return { use: "matsReceived" };
		if (!received && isRequester && fromCrafter) return { use: "matsSent" };
		return no("not between requester and crafter");
	}
	return no("different item");
}

export function deliveryRejection(
	r: DeliveryRequest,
	e: DeliveryReport,
	reporter: Reporter,
	now: number,
	reagents: number[] = [],
): DeliveryRejection | undefined {
	const outcome = deliveryOutcome(r, e, reporter, now, reagents);
	return "rejected" in outcome ? outcome.rejected : undefined;
}

/** Mats delivered so far per reagent, from one side's reports. */
export type MatsCount = { itemId: number; quantity: number }[];
export const matsAdd = (list: MatsCount | undefined, itemId: number, quantity: number): MatsCount => {
	const out = (list ?? []).map((m) => ({ ...m }));
	const row = out.find((m) => m.itemId === itemId);
	if (row) row.quantity += quantity;
	else out.push({ itemId, quantity });
	return out;
};
/**
 * Mats progress per reagent: the larger of what the requester's addon saw
 * sent and what the crafter's saw arrive, so one mail seen from both sides
 * counts once, whichever of them runs the app.
 */
export function matsProgress(
	reagents: { itemId: number; name: string; quantity: number }[],
	quantity: number,
	sent: MatsCount | undefined,
	received: MatsCount | undefined,
) {
	const count = (list: MatsCount | undefined, id: number) => list?.find((m) => m.itemId === id)?.quantity ?? 0;
	return reagents.map((x) => ({
		itemId: x.itemId,
		name: x.name,
		need: x.quantity * quantity,
		got: Math.max(count(sent, x.itemId), count(received, x.itemId)),
	}));
}

export const deliveryMatches = (...args: Parameters<typeof deliveryRejection>) => !deliveryRejection(...args);
export function deliveryProgress(
	r: Pick<DeliveryRequest, "status" | "quantity" | "ongoing" | "receivedQuantity" | "sentQuantity">,
	e: Pick<DeliveryReport, "kind" | "quantity">,
) {
	const receivedQuantity = (r.receivedQuantity ?? 0) + (e.kind.endsWith("Received") ? e.quantity : 0);
	const sentQuantity = (r.sentQuantity ?? 0) + (e.kind.endsWith("Sent") ? e.quantity : 0);
	return {
		receivedQuantity,
		sentQuantity,
		status: !r.ongoing && receivedQuantity >= r.quantity ? ("done" as const) : (r.status as RequestStatus),
	};
}

/** Keep the observed names even when there is no exact known character match. */
export function deliveryParticipants<T extends { name: string; slug?: string }>(
	event: Pick<DeliveryReport, "kind" | "other">,
	reporter: T,
	knownOther?: T,
) {
	const other =
		knownOther && sameCharacter(event.other, knownOther) ? { ...knownOther, name: event.other } : { name: event.other };
	const received = event.kind.endsWith("Received");
	return {
		sender: received ? other : reporter,
		recipient: received ? reporter : other,
		method: event.kind.startsWith("mail") ? ("mail" as const) : ("trade" as const),
		received,
	};
}
