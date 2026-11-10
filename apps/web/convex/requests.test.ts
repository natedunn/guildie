import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type Action,
	check,
	EXPIRE_MS,
	isStale,
	matsCheck,
	matsLabel,
	matsState,
	nextStatus,
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
	assert.deepEqual(validateNew({ quantity: 1, note: "   ", openCount: 9 }), { quantity: 1, note: undefined });
	assert.throws(() => validateNew({ quantity: 1, openCount: 10 }), /10 open requests/);
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
