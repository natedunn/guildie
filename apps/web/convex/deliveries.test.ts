import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCharacter } from "./addonPayload.ts";
import {
	deliveryMatches,
	deliveryOutcome,
	deliveryParticipants,
	deliveryProgress,
	deliveryRejection,
	matsAdd,
	matsProgress,
	remainingQuantity,
	sameCharacter,
} from "./shared/requests.ts";

const now = 1794300000000;
const request = {
	kind: "item",
	itemId: 4306,
	quantity: 20,
	status: "claimed",
	userId: "receiver",
	guildId: "guild",
	character: { slug: "receiver-last", name: "Receiver-Last" },
	createdAt: now - 10000,
	claim: { userId: "sender", character: { slug: "sender-last", name: "Sender-Last" }, claimedAt: now - 5000 },
};
const receiver = { userId: "receiver", slug: "receiver-last", name: "Receiver-Last", guildId: "guild" };
const sender = { userId: "sender", slug: "sender-last", name: "Sender-Last", guildId: "guild" };
const event = {
	id: "event1",
	requestId: "request1",
	kind: "mailReceived",
	other: "Sender-Last",
	itemId: 4306,
	quantity: 7,
	at: now,
};
test("only exact, authorized, contemporaneous item deliveries match", () => {
	assert(deliveryMatches(request, event, receiver, now));
	assert(!deliveryMatches(request, event, sender, now));
	for (const patch of [
		{ itemId: 1 },
		{ other: "Sender" },
		{ other: "Other-Last" },
		{ at: now - 6000 },
		{ at: now + 700000 },
	])
		assert(!deliveryMatches(request, { ...event, ...patch }, receiver, now));
	for (const patch of [
		{ status: "done" },
		{ status: "cancelled" },
		{ guildId: "elsewhere" },
		{ createdAt: now + 1 },
		{ ongoing: true, until: now - 1 },
	])
		assert(!deliveryMatches({ ...request, ...patch }, event, receiver, now));
	assert(!deliveryMatches(request, event, { ...receiver, slug: "other-alt" }, now));
	assert(!deliveryMatches(request, event, receiver, now + 31 * 86400000));
	assert(deliveryMatches(request, { ...event, kind: "mailSent", other: "Receiver-Last" }, sender, now));
	assert(!deliveryMatches(request, { ...event, kind: "mailSent", other: "Receiver-Last" }, receiver, now));
});
test("a delivery seen from both sides counts once; partial and ongoing contributions", () => {
	const todd = { name: "Todd", slug: "todd-bonzalezz" };
	let state = { ...request, ...deliveryProgress(request, { kind: "mailSent", quantity: 7 }, todd) };
	assert.equal(state.deliveredQuantity, 7, "the sender's report counts");
	assert.equal(remainingQuantity(state), 13);
	// The requester collects the same 7 (the game shows the first name): still 7.
	state = { ...state, ...deliveryProgress(state, { kind: "mailReceived", quantity: 7 }, { name: "Todd" }) };
	assert.equal(state.deliveredQuantity, 7);
	assert.equal(state.receivedQuantity, 7);
	assert.equal(state.senders.length, 1);
	// Someone else trades 13 the requester reports; that finishes it.
	state = { ...state, ...deliveryProgress(state, { kind: "tradeReceived", quantity: 13 }, { name: "Bung" }) };
	assert.equal(state.deliveredQuantity, 20);
	assert.equal(state.status, "done");
	assert.equal(deliveryProgress({ ...request, ongoing: true, quantity: 0 }, event).status, "claimed");
});
test("reports from the two sides in either order, and receipts from before tallies", () => {
	const todd = { name: "Todd", slug: "todd-bonzalezz" };
	let state = { ...request, ...deliveryProgress(request, { kind: "mailReceived", quantity: 4 }, { name: "Todd" }) };
	state = { ...state, ...deliveryProgress(state, { kind: "mailSent", quantity: 4 }, todd) };
	assert.equal(state.deliveredQuantity, 4);
	state = { ...state, ...deliveryProgress(state, { kind: "mailSent", quantity: 6 }, todd) };
	assert.equal(state.deliveredQuantity, 10, "sent more than has arrived");
	const old = { ...request, receivedQuantity: 5 };
	assert.equal(remainingQuantity(old), 15);
	assert.equal(deliveryProgress(old, { kind: "mailSent", quantity: 3 }, todd).deliveredQuantity, 8);
	// Crafts count what arrives only.
	const craft = { ...request, kind: "craft" };
	assert.equal(deliveryProgress(craft, { kind: "mailSent", quantity: 20 }, todd).deliveredQuantity, 0);
});
test("delivery payload bounds, old payloads, and timestamps", () => {
	const c = { guid: "Player-1", name: "Receiver-Last", talents: [], capturedAt: now / 1000 };
	const raw = { ...event, at: now / 1000 };
	assert(parseCharacter(c, now).ok);
	const parsed = parseCharacter({ ...c, deliveries: [raw] }, now);
	assert(parsed.ok);
	assert.equal(parsed.character.deliveries?.[0].at, now);
	for (const patch of [
		{ quantity: -1 },
		{ quantity: 0 },
		{ quantity: 1.5 },
		{ quantity: 100001 },
		{ kind: "fake" },
		{ other: "" },
		{ id: "" },
		{ requestId: "" },
		{ at: (now + 700000) / 1000 },
	])
		assert(!parseCharacter({ ...c, deliveries: [{ ...raw, ...patch }] }, now).ok);
	assert(!parseCharacter({ ...c, deliveries: Array(201).fill(raw) }, now).ok);
});

test("participant names and direction survive both mail and trade reports", () => {
	const reporter = { name: "Nate-Last", slug: "nate-last", characterId: "reporter", classId: 1 };
	const known = { name: "Jane-Last", slug: "jane-last", characterId: "other", classId: 2 };
	for (const method of ["mail", "trade"]) {
		const sent = deliveryParticipants({ kind: `${method}Sent`, other: "Jane-Last" }, reporter, known);
		assert.deepEqual(sent.sender, reporter);
		assert.deepEqual(sent.recipient, known);
		assert.equal(sent.received, false);
		assert.equal(sent.method, method);
		const received = deliveryParticipants({ kind: `${method}Received`, other: "Jane-Last" }, reporter, known);
		assert.deepEqual(received.sender, known);
		assert.deepEqual(received.recipient, reporter);
		assert.equal(received.received, true);
	}
	const unknown = deliveryParticipants({ kind: "mailReceived", other: "Unknown-Surname" }, reporter);
	assert.deepEqual(unknown.sender, { name: "Unknown-Surname" });
	const wrongMatch = deliveryParticipants({ kind: "tradeReceived", other: "Jane" }, reporter, known);
	assert.deepEqual(wrongMatch.sender, { name: "Jane" }, "no guessed surname, slug or character link");
	const exact = deliveryParticipants({ kind: "tradeReceived", other: "jane-last" }, reporter, known);
	assert.equal(exact.sender.name, "jane-last", "retain observed spelling");
});

test("reporter's observed name is optional for older payloads and validated when supplied", () => {
	const c = { guid: "Player-1", name: "Receiver-Last", talents: [], capturedAt: now / 1000 };
	const raw = { ...event, at: now / 1000, reporterName: "Original-Name" };
	const parsed = parseCharacter({ ...c, deliveries: [raw] }, now);
	assert(parsed.ok);
	assert.equal(parsed.character.deliveries?.[0].reporterName, "Original-Name");
	for (const reporterName of ["", "|cffbad", "a".repeat(121)])
		assert(!parseCharacter({ ...c, deliveries: [{ ...raw, reporterName }] }, now).ok);
});

test("the remainder keeps the target and clamps overdelivery", () => {
	for (const method of ["mail", "trade"]) {
		let state = { ...request, ...deliveryProgress(request, { kind: `${method}Received`, quantity: 7 }) };
		assert.equal(remainingQuantity(state), 13);
		state = { ...state, ...deliveryProgress(state, { kind: `${method}Received`, quantity: 15 }) };
		assert.equal(remainingQuantity(state), 0);
		assert.equal(state.quantity, 20);
		assert.equal(state.receivedQuantity, 22);
		assert.equal(state.status, "done");
	}
});

test("Forever names: first name or full name match, nothing else does", () => {
	const bung = { name: "Bung", slug: "bung-dingus" };
	for (const shown of ["Bung", "bung", " Bung ", "Bung Dingus", "Bung-Dingus"])
		assert(sameCharacter(shown, bung), shown);
	for (const shown of ["", "Bungo", "Bung Other", "Dingus", "bung-dingus-x"])
		assert(!sameCharacter(shown, bung), shown);
	assert(!sameCharacter("Bung", { name: "Bung Other" }), "no slug: the name alone");

	// As stored in production: first names, with the surname only in the slug.
	const forever = {
		...request,
		character: { slug: "bung-dingus", name: "Bung" },
		claim: { ...request.claim, character: { slug: "todd-bonzalezz", name: "Todd" } },
	};
	const bungReporter = { ...receiver, slug: "bung-dingus", name: "Bung" };
	const toddReporter = { ...sender, slug: "todd-bonzalezz", name: "Todd" };
	for (const other of ["Todd", "Todd Bonzalezz"])
		assert(deliveryMatches(forever, { ...event, other }, bungReporter, now));
	for (const other of ["Bung", "Bung Dingus"])
		assert(deliveryMatches(forever, { ...event, kind: "tradeSent", other }, toddReporter, now));
	const known = { name: "Todd", slug: "todd-bonzalezz" };
	assert.deepEqual(deliveryParticipants({ kind: "mailReceived", other: "Todd" }, bungReporter, known).sender, known);
});

test("rejected reports say why", () => {
	const cases: [Parameters<typeof deliveryRejection>, string | undefined][] = [
		[[request, event, receiver, now], undefined],
		[[{ ...request, kind: "craft", status: "open" }, event, receiver, now], "craft not accepted"],
		[[request, { ...event, itemId: 1 }, receiver, now], "different item"],
		[[{ ...request, status: "done" }, event, receiver, now], "request closed"],
		[[request, event, { ...receiver, guildId: "x" }, now], "other guild"],
		[[request, { ...event, at: now - 20000 }, receiver, now], "before the request"],
		[[request, { ...event, at: now - 6000 }, receiver, now], "before the claim"],
		[[request, event, receiver, now + 31 * 86400000], "older than 30 days"],
		[[request, event, { ...receiver, slug: "alt" }, now], "not the requester"],
		[[request, { ...event, other: "Someone" }, receiver, now], "not from the claimant"],
		[
			[{ ...request, claim: undefined }, { ...event, kind: "mailSent", other: "Receiver-Last" }, sender, now],
			undefined,
		],
		[
			[{ ...request, claim: undefined }, { ...event, kind: "mailSent", other: "Someone" }, sender, now],
			"not to the requester",
		],
		[[request, { ...event, kind: "mailSent", other: "Receiver-Last" }, receiver, now], "not the claimant"],
		[[request, { ...event, kind: "mailSent", other: "Someone" }, sender, now], "not to the requester"],
	];
	for (const [args, why] of cases) assert.equal(deliveryRejection(...args), why);
});

test("crafts: mats from the requester to the crafter, the crafted item back, an enchant over trade", () => {
	// Todd asked Miller for 2 Silk Bandages (2 Silk Cloth each); Miller accepted.
	const craft = {
		...request,
		kind: "craft",
		itemId: 6450,
		quantity: 2,
		status: "claimed",
		character: { slug: "todd-bonzalezz", name: "Todd" },
		userId: "todd",
		claim: { userId: "miller", character: { slug: "miller-litesworth", name: "Miller" }, claimedAt: now - 5000 },
	};
	const todd = { userId: "todd", slug: "todd-bonzalezz", name: "Todd", guildId: "guild" };
	const miller = { userId: "miller", slug: "miller-litesworth", name: "Miller", guildId: "guild" };
	const silk = 4306;
	const use = (
		e: Partial<typeof event>,
		who: typeof todd,
		reagents = [silk],
		r: Parameters<typeof deliveryOutcome>[0] = craft,
	) => deliveryOutcome(r, { ...event, ...e }, who, now, reagents);
	// Mats, seen from both sides; before the accept too.
	assert.deepEqual(use({ kind: "mailSent", itemId: silk, other: "Miller Litesworth" }, todd), { use: "matsSent" });
	assert.deepEqual(use({ kind: "mailReceived", itemId: silk, other: "Todd" }, miller), { use: "matsReceived" });
	assert.deepEqual(use({ kind: "tradeSent", itemId: silk, other: "Miller", at: now - 8000 }, todd), {
		use: "matsSent",
	});
	assert.deepEqual(use({ kind: "mailSent", itemId: silk, other: "Brenna" }, todd), {
		rejected: "not between requester and crafter",
	});
	assert.deepEqual(use({ kind: "mailReceived", itemId: silk, other: "Miller" }, todd), {
		rejected: "not between requester and crafter",
	});
	// The crafted item back: the requester's receipt counts; the crafter's send is only "sent".
	assert.deepEqual(use({ kind: "tradeReceived", itemId: 6450, other: "Miller" }, todd), { use: "receipt" });
	assert.deepEqual(use({ kind: "mailSent", itemId: 6450, other: "Todd Bonzalezz" }, miller), { use: "sent" });
	assert.deepEqual(use({ kind: "mailReceived", itemId: 6450, other: "Brenna" }, todd), {
		rejected: "not from the claimant",
	});
	assert.deepEqual(use({ kind: "mailReceived", itemId: 9999, other: "Miller" }, todd), { rejected: "different item" });
	// Not accepted yet: nothing counts.
	assert.deepEqual(
		use({ kind: "mailSent", itemId: silk, other: "Miller" }, todd, [silk], { ...craft, status: "open" }),
		{
			rejected: "craft not accepted",
		},
	);
	// An enchant (no crafted item): the trade that put it on the requester's item.
	const enchant = { ...craft, itemId: undefined, quantity: 1 };
	assert.deepEqual(use({ kind: "enchantReceived", itemId: 2453, other: "Miller" }, todd, [], enchant), {
		use: "receipt",
	});
	assert.deepEqual(use({ kind: "enchantReceived", itemId: 2453, other: "Miller" }, miller, [], enchant), {
		rejected: "not the requester",
	});
	assert.deepEqual(use({ kind: "enchantReceived", itemId: 2453, other: "Miller" }, todd), {
		rejected: "not an enchant",
	});
	assert.deepEqual(use({ kind: "enchantReceived", itemId: 4306, other: "Miller" }, receiver, [], request), {
		rejected: "not an enchant",
	});
	// Receipts close it at the quantity, crafted or enchanted.
	let state = { ...craft, ...deliveryProgress(craft, { kind: "tradeReceived", quantity: 1 }) };
	assert.equal(state.status, "claimed");
	state = { ...state, ...deliveryProgress(state, { kind: "mailReceived", quantity: 1 }) };
	assert.equal(state.status, "done");
	assert.equal(deliveryProgress(enchant, { kind: "enchantReceived", quantity: 1 }).status, "done");
	// Participants: an enchant is a received trade.
	assert.equal(deliveryParticipants({ kind: "enchantReceived", other: "Miller" }, { name: "Todd" }).method, "trade");
});

test("mats progress: one transfer seen from both sides counts once", () => {
	const reagents = [
		{ itemId: 4306, name: "Silk Cloth", quantity: 2 },
		{ itemId: 2321, name: "Fine Thread", quantity: 1 },
	];
	let sent = matsAdd(undefined, 4306, 3);
	sent = matsAdd(sent, 4306, 1);
	const received = matsAdd(undefined, 4306, 3);
	assert.deepEqual(matsProgress(reagents, 2, sent, received), [
		{ itemId: 4306, name: "Silk Cloth", need: 4, got: 4 },
		{ itemId: 2321, name: "Fine Thread", need: 2, got: 0 },
	]);
	assert.deepEqual(
		matsProgress(reagents, 1, undefined, matsAdd(undefined, 2321, 1))[1].got,
		1,
		"the crafter's side alone",
	);
	assert.deepEqual(sent, [{ itemId: 4306, quantity: 4 }], "adds per reagent");
});

test("mail that comes back unopened takes the send back, and reopens a request the sends closed", () => {
	const todd = { name: "Todd", slug: "todd-bonzalezz" };
	const open = { ...request, status: "open", claim: undefined };
	let state = { ...open, ...deliveryProgress(open, { kind: "mailSent", quantity: 20 }, todd) };
	assert.equal(state.status, "done");
	assert.equal(state.doneByDeliveries, true);
	// The requester took 4 of it before the rest came back.
	state = { ...state, ...deliveryProgress(state, { kind: "mailReceived", quantity: 4 }, { name: "Todd" }) };
	state = { ...state, ...deliveryProgress(state, { kind: "mailReturned", quantity: 16 }, todd) };
	assert.equal(state.deliveredQuantity, 4);
	assert.equal(state.sentQuantity, 4);
	assert.equal(state.status, "open", "reopened");
	assert.equal(state.doneByDeliveries, undefined);
	assert.equal(remainingQuantity(state), 16);
	// More back than was counted (a send from before tallies): never below zero.
	assert.equal(deliveryProgress(open, { kind: "mailReturned", quantity: 5 }, todd).deliveredQuantity, 0);
	// Marked done by the requester: a return doesn't reopen it.
	const marked = { ...open, status: "done" };
	assert.equal(deliveryProgress(marked, { kind: "mailReturned", quantity: 5 }, todd).status, "done");
});

test("which returns count", () => {
	const toddReporter = { ...sender, slug: "todd-bonzalezz", name: "Todd" };
	const open = { ...request, status: "open", claim: undefined };
	const back = { ...event, kind: "mailReturned", other: "Receiver-Last" };
	assert.deepEqual(deliveryOutcome(open, back, toddReporter, now), { use: "returned" });
	assert.deepEqual(deliveryOutcome({ ...open, status: "done" }, back, toddReporter, now), { use: "returned" });
	assert.deepEqual(deliveryOutcome({ ...open, status: "cancelled" }, back, toddReporter, now), {
		rejected: "request closed",
	});
	assert.deepEqual(deliveryOutcome(open, { ...back, other: "Someone" }, toddReporter, now), {
		rejected: "not to the requester",
	});
	assert.deepEqual(deliveryOutcome(open, { ...back, itemId: 1 }, toddReporter, now), { rejected: "different item" });
	assert.deepEqual(deliveryOutcome(open, back, receiver, now), { rejected: "not to the requester" });
	const c = { guid: "Player-1", name: "Todd", talents: [], capturedAt: now / 1000 };
	assert(parseCharacter({ ...c, deliveries: [{ ...back, at: now / 1000 }] }, now).ok);
});
