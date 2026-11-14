import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCharacter } from "./addonPayload.ts";
import {
	deliveryMatches,
	deliveryParticipants,
	deliveryProgress,
	deliveryRejection,
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
		{ kind: "craft" },
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
test("sender reports never count twice as receipt; partial and ongoing contributions", () => {
	let state = { ...request, ...deliveryProgress(request, { ...event, kind: "mailSent", quantity: 20 }) };
	assert.equal(state.status, "claimed");
	assert.equal(state.receivedQuantity, 0);
	state = { ...state, ...deliveryProgress(state, event) };
	assert.equal(state.receivedQuantity, 7);
	assert.equal(state.status, "claimed");
	state = { ...state, ...deliveryProgress(state, { ...event, kind: "tradeReceived", quantity: 13 }) };
	assert.equal(state.receivedQuantity, 20);
	assert.equal(state.status, "done");
	assert.equal(deliveryProgress({ ...request, ongoing: true, quantity: 0 }, event).status, "claimed");
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

test("only receipt quantities reduce the remainder, preserving the target and clamping overdelivery", () => {
	for (const method of ["mail", "trade"]) {
		let state = { ...request, ...deliveryProgress(request, { kind: `${method}Sent`, quantity: 7 }) };
		assert.equal(remainingQuantity(state), 20);
		state = { ...state, ...deliveryProgress(state, { kind: `${method}Received`, quantity: 7 }) };
		assert.equal(remainingQuantity(state), 13);
		assert.equal(state.quantity, 20);
		state = { ...state, ...deliveryProgress(state, { kind: `${method}Sent`, quantity: 7 }) };
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
		[[{ ...request, kind: "craft" }, event, receiver, now], "not an item request"],
		[[request, { ...event, itemId: 1 }, receiver, now], "different item"],
		[[{ ...request, status: "done" }, event, receiver, now], "request closed"],
		[[request, event, { ...receiver, guildId: "x" }, now], "other guild"],
		[[request, { ...event, at: now - 20000 }, receiver, now], "before the request"],
		[[request, { ...event, at: now - 6000 }, receiver, now], "before the claim"],
		[[request, event, receiver, now + 31 * 86400000], "older than 30 days"],
		[[request, event, { ...receiver, slug: "alt" }, now], "not the requester"],
		[[request, { ...event, other: "Someone" }, receiver, now], "not from the claimant"],
		[[{ ...request, claim: undefined }, { ...event, kind: "mailSent" }, sender, now], "request not claimed"],
		[[request, { ...event, kind: "mailSent", other: "Receiver-Last" }, receiver, now], "not the claimant"],
		[[request, { ...event, kind: "mailSent", other: "Someone" }, sender, now], "not to the requester"],
	];
	for (const [args, why] of cases) assert.equal(deliveryRejection(...args), why);
});
