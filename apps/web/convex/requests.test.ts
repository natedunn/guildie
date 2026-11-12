import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type Action,
	canChange,
	canHelpFromInventory,
	check,
	EXPIRE_MS,
	isStale,
	matsCheck,
	matsLabel,
	matsState,
	nextStatus,
	ONGOING_DAYS,
	ongoingUntil,
	REQUEST_LIMITS,
	type RequestLike,
	rosterCharacters,
	STALE_MS,
	shouldExpire,
	sumInventory,
	validateNew,
} from "./shared/requests.ts";

const NOW = 1_794_300_000_000;
const TODD = "todd";
const MILLER = "miller";
const BRENNA = "brenna";

const req = (over: Partial<RequestLike> = {}): RequestLike => ({
	kind: "item",
	status: "open",
	requester: TODD,
	lastActivityAt: NOW,
	...over,
});

const ok = (action: Action, r: RequestLike, userId: string, knowsRecipe?: boolean) =>
	check(action, r, { userId, knowsRecipe }).ok;

test("membership: only characters in this guild's roster now count", () => {
	const rows = [
		{ name: "Lich", guildId: "g1", inRoster: true },
		{ name: "Alt", guildId: "g1", inRoster: false },
		{ name: "Other", guildId: "g2", inRoster: true },
		null,
	];
	assert.deepEqual(
		rosterCharacters(rows, "g1").map((r) => r.name),
		["Lich"],
	);
	assert.deepEqual(rosterCharacters(rows, "g3"), [], "not a member of a guild they have nobody in");
	assert.deepEqual(rosterCharacters([], "g1"), [], "no claimed characters: not a member");
});

test("claiming: anyone else for items; only knowers for crafts; never your own", () => {
	assert.ok(ok("claim", req(), MILLER));
	assert.equal(check("claim", req(), { userId: TODD }).ok, false);
	assert.deepEqual(check("claim", req(), { userId: TODD }), { ok: false, error: "That's your own request." });
	const craft = req({ kind: "craft" });
	assert.equal(ok("claim", craft, MILLER, false), false, "doesn't know the recipe");
	assert.ok(ok("claim", craft, MILLER, true));
	assert.equal(ok("claim", req({ status: "claimed", claim: { userId: BRENNA } }), MILLER), false, "already claimed");
});

test("claimed: the claimant marks it sent or releases it; the requester can take it back", () => {
	const claimed = req({ status: "claimed", claim: { userId: MILLER } });
	assert.ok(ok("markSent", claimed, MILLER));
	assert.equal(ok("markSent", claimed, TODD), false);
	assert.equal(ok("markSent", claimed, BRENNA), false);
	assert.ok(ok("unclaim", claimed, MILLER));
	assert.ok(ok("unclaim", claimed, TODD));
	assert.equal(ok("unclaim", claimed, BRENNA), false);
	assert.equal(ok("unclaim", req(), MILLER), false, "nothing to release");
});

test("only the requester completes, cancels or keeps; closed requests take nothing", () => {
	for (const action of ["complete", "cancel", "keep"] as const) {
		assert.ok(ok(action, req(), TODD), action);
		assert.ok(ok(action, req({ status: "claimed", claim: { userId: MILLER } }), TODD), `${action} when claimed`);
		assert.equal(ok(action, req(), MILLER), false, `${action} by someone else`);
	}
	for (const status of ["done", "cancelled", "expired"] as const) {
		for (const action of ["claim", "unclaim", "markSent", "complete", "cancel", "keep", "setMats"] as const) {
			assert.equal(ok(action, req({ status, claim: { userId: MILLER } }), status === "done" ? TODD : MILLER), false);
		}
	}
});

test("mats can change only on an open craft, by the requester", () => {
	assert.ok(ok("setMats", req({ kind: "craft" }), TODD));
	assert.equal(ok("setMats", req({ kind: "item" }), TODD), false);
	assert.equal(ok("setMats", req({ kind: "craft" }), MILLER), false);
	assert.equal(ok("setMats", req({ kind: "craft", status: "claimed", claim: { userId: MILLER } }), TODD), false);
});

test("lifecycle: open → claimed → (released → open) → done; cancel from anywhere active", () => {
	let status = nextStatus("claim", "open");
	assert.equal(status, "claimed");
	assert.equal(nextStatus("markSent", status), "claimed", "sent is a mark on the claim, not a status");
	assert.equal(nextStatus("unclaim", status), "open");
	assert.equal(nextStatus("complete", status), "done");
	assert.equal(nextStatus("cancel", "open"), "cancelled");
	status = nextStatus("keep", "open");
	assert.equal(status, "open");
});

test("stale after 7 days without activity, expired after 30; closed ones never", () => {
	assert.equal(isStale(req({ lastActivityAt: NOW - STALE_MS + 1 }), NOW), false);
	assert.equal(isStale(req({ lastActivityAt: NOW - STALE_MS }), NOW), true);
	assert.equal(isStale(req({ status: "claimed", lastActivityAt: NOW - STALE_MS }), NOW), true);
	assert.equal(isStale(req({ status: "done", lastActivityAt: 0 }), NOW), false);
	assert.equal(shouldExpire(req({ lastActivityAt: NOW - EXPIRE_MS + 1 }), NOW), false);
	assert.equal(shouldExpire(req({ lastActivityAt: NOW - EXPIRE_MS }), NOW), true);
	assert.equal(shouldExpire(req({ status: "cancelled", lastActivityAt: 0 }), NOW), false);
});

test("new requests: limits on count, quantity and note", () => {
	assert.deepEqual(validateNew({ quantity: 20, note: "  for  my alt ", openCount: 0 }), {
		quantity: 20,
		note: "for my alt",
	});
	assert.deepEqual(validateNew({ quantity: 1, note: "   ", openCount: 14 }), { quantity: 1, note: undefined });
	assert.throws(() => validateNew({ quantity: 1, openCount: 15 }), /15 open requests/);
	for (const quantity of [0, 1001, 2.5, Number.NaN]) {
		assert.throws(() => validateNew({ quantity, openCount: 0 }), /Quantity is 1 to 1000/, String(quantity));
	}
	assert.throws(() => validateNew({ quantity: 1, note: "x".repeat(141), openCount: 0 }), /140/);
});

const BOLT = { itemId: 2996, name: "Bolt of Linen Cloth", quantity: 2 };
const THREAD = { itemId: 2320, name: "Coarse Thread", quantity: 1 };

test("mats: bags and bank across characters cover the reagents", () => {
	const scans = [
		{ bags: { capturedAt: NOW - 600_000, items: [{ id: 2996, count: 3 }] } },
		{
			bags: { capturedAt: NOW - 60_000, items: [{ id: 2320, count: 5 }] },
			bank: { capturedAt: NOW - 2 * 86_400_000, items: [{ id: 2996, count: 1 }] },
		},
	];
	const sum = sumInventory(scans);
	assert.equal(sum.counts.get(2996), 4);
	assert.equal(sum.bagsAt, NOW - 60_000, "newest bag read");
	assert.equal(sum.bankAt, NOW - 2 * 86_400_000, "bank only as of when it was last open");
	const two = matsCheck([BOLT, THREAD], 2, scans);
	assert.equal(two.covered, true);
	assert.deepEqual(
		two.reagents.map((r) => [r.itemId, r.have, r.need]),
		[
			[2996, 4, 4],
			[2320, 5, 2],
		],
	);
	assert.equal(two.checkedAt, NOW - 60_000);
	const three = matsCheck([BOLT, THREAD], 3, scans);
	assert.equal(three.covered, false, "6 bolts needed, 4 there");
	assert.equal(matsState(three.covered, false), "missing");
	assert.equal(matsState(three.covered, true), "declared");
	assert.equal(matsState(two.covered, false), "inventory");
	assert.equal(matsState(two.covered, true), "inventory", "the scan wins over the tick");
});

test("mats: no scan is never covered; guildmates see a label, not counts", () => {
	const none = matsCheck([BOLT], 1, []);
	assert.equal(none.scanned, false);
	assert.equal(none.covered, false);
	assert.equal(none.checkedAt, undefined);
	assert.equal(matsCheck([], 1, [{ bags: { capturedAt: NOW, items: [] } }]).covered, false, "no reagents known");
	assert.equal(matsLabel("inventory"), "Has the mats");
	assert.equal(matsLabel("declared"), "Has the mats (says so)");
	assert.equal(matsLabel("missing"), "Mats not confirmed");
});

test("help requires full inventory coverage and a known craft, never just eligibility", () => {
	const scans = [
		{
			bags: { capturedAt: NOW, items: [{ id: 1, count: 3 }] },
			bank: { capturedAt: NOW, items: [{ id: 1, count: 2 }] },
		},
	];
	const item = { kind: "item" as const, status: "open", quantity: 5, itemId: 1 };
	const known = new Set([10]);
	assert.equal(canHelpFromInventory(item, false, known, scans), true);
	assert.equal(canHelpFromInventory({ ...item, quantity: 6 }, false, known, scans), false);
	assert.equal(canHelpFromInventory(item, false, known, []), false);
	assert.equal(canHelpFromInventory(item, true, known, scans), false);
	assert.equal(canHelpFromInventory({ ...item, status: "claimed" }, false, known, scans), false);
	const craft = { kind: "craft" as const, status: "open", quantity: 2, recipeId: 10 };
	const reagents = [{ itemId: 1, name: "Cloth", quantity: 2 }];
	assert.equal(canHelpFromInventory(craft, false, known, scans, reagents), true);
	assert.equal(canHelpFromInventory({ ...craft, quantity: 3 }, false, known, scans, reagents), false);
	assert.equal(canHelpFromInventory(craft, false, new Set(), scans, reagents), false);
	assert.equal(canHelpFromInventory(craft, false, known, scans, []), false);
	assert.equal(canHelpFromInventory(craft, false, known, scans), false);
});

// ---- Ongoing requests ------------------------------------------------------------

const DAY = 86_400_000;
const ongoing = (over: Partial<RequestLike> = {}) => req({ ongoing: true, until: NOW + 30 * DAY, ...over });

test("ongoing: 2 weeks, 1 month or 3 months, nothing longer", () => {
	assert.deepEqual([...ONGOING_DAYS], [14, 30, 90]);
	assert.equal(ongoingUntil(30, NOW), NOW + 30 * DAY);
	for (const days of [0, 7, 91, 365, Number.NaN]) assert.throws(() => ongoingUntil(days, NOW), /2 weeks/, String(days));
});

test("ongoing: no quantity, their own cap of 20 apart from the 15 fixed", () => {
	assert.equal(REQUEST_LIMITS.ongoing, 20);
	assert.deepEqual(validateNew({ ongoing: true, quantity: 0, openCount: 19 }), { quantity: 0, note: undefined });
	assert.deepEqual(validateNew({ ongoing: true, quantity: 5000, openCount: 0 }), { quantity: 0, note: undefined });
	assert.throws(() => validateNew({ ongoing: true, quantity: 0, openCount: 20 }), /20 ongoing requests/);
	assert.throws(() => validateNew({ ongoing: true, quantity: 0, note: "x".repeat(141), openCount: 0 }), /140/);
});

test("ongoing: nobody claims it; the requester only stops it", () => {
	for (const action of ["claim", "unclaim", "markSent", "complete", "keep", "setMats"] as Action[]) {
		assert.equal(ok(action, ongoing(), MILLER, true), false, `${action} by a guildmate`);
		assert.equal(ok(action, ongoing(), TODD), false, `${action} by the requester`);
	}
	assert.equal(ok("cancel", ongoing(), TODD), true);
	assert.equal(ok("cancel", ongoing(), MILLER), false);
});

test("ongoing: ends at its date, never goes stale", () => {
	const r = ongoing({ lastActivityAt: NOW - 60 * DAY, until: NOW + DAY });
	assert.equal(isStale(r, NOW), false);
	assert.equal(shouldExpire(r, NOW), false, "quiet for 60 days but not ended");
	assert.equal(shouldExpire(r, NOW + DAY), true);
	assert.equal(shouldExpire({ ...r, status: "cancelled" }, NOW + DAY), false);
});

test("changing a request: your own open item request only", () => {
	assert.equal(canChange(req(), TODD).ok, true);
	assert.equal(canChange(ongoing(), TODD).ok, true);
	assert.equal(canChange(req(), MILLER).ok, false);
	assert.equal(canChange(req({ kind: "craft" }), TODD).ok, false);
	assert.equal(canChange(req({ status: "claimed", claim: { userId: MILLER } }), TODD).ok, false);
	assert.equal(canChange(req({ status: "done" }), TODD).ok, false);
});

test("ongoing: you can help with any amount you have", () => {
	const scans = [{ bags: { capturedAt: NOW, items: [{ id: 1, count: 1 }] } }];
	const want = { kind: "item" as const, status: "open", quantity: 0, itemId: 1, ongoing: true };
	assert.equal(canHelpFromInventory(want, false, new Set(), scans), true);
	assert.equal(canHelpFromInventory({ ...want, itemId: 2 }, false, new Set(), scans), false);
	assert.equal(canHelpFromInventory(want, true, new Set(), scans), false, "your own");
	assert.equal(canHelpFromInventory(want, false, new Set(), []), false, "no scan");
});
