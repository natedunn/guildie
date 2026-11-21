import assert from "node:assert/strict";
import { test } from "node:test";
import {
	CHANNELS,
	type NotificationKind,
	notificationEvent,
	notificationSince,
	notificationText,
} from "./shared/notifications.ts";

test("notification text: who, what and how many", () => {
	const bandage = { name: "Silk Bandage", quantity: 2 };
	const miller = { name: "Miller" };
	assert.equal(notificationText("craftClaimed", bandage, miller), "Miller will craft your Silk Bandage ×2");
	assert.equal(notificationText("craftSent", { name: "Silk Bandage" }, miller), "Miller sent your Silk Bandage");
	assert.equal(notificationText("craftSent", { name: "Silk Bandage" }), "Someone sent your Silk Bandage");
	assert.equal(
		notificationText("requestDone", { name: "Silk Cloth", quantity: 20 }),
		"Your request for 20 Silk Cloth is complete",
	);
	assert.equal(notificationText("requestExpired", { name: "Silk Cloth" }), "Your request for Silk Cloth expired");
});

test("channels: crafts reach the app and the game; completion the app; expiry only the inbox", () => {
	const where = (kind: NotificationKind) => CHANNELS[kind];
	assert.deepEqual(where("craftClaimed"), { desktop: true, game: true });
	assert.deepEqual(where("craftSent"), { desktop: true, game: true });
	assert.deepEqual(where("requestDone"), { desktop: true, game: false });
	assert.deepEqual(where("requestExpired"), { desktop: false, game: false });
});

test("items mailed: the mailed amount, shown only by apps that opt in, never in game", () => {
	assert.equal(
		notificationText("itemsMailed", { name: "Silk Cloth", quantity: 7 }, { name: "Brenna" }),
		"Brenna mailed you 7 Silk Cloth",
	);
	assert.equal(
		notificationText("itemsMailed", { name: "Heavy Linen Gloves" }, { name: "Brenna" }),
		"Brenna mailed you Heavy Linen Gloves",
	);
	assert.deepEqual(CHANNELS.itemsMailed, { desktop: "optIn", game: false });
});

test("since: an ask the requester cancelled says so, so the crafter isn't sent looking for it", () => {
	const me = "crafter";
	const asked = { status: "open" as const, ask: { userId: me } };
	assert.equal(notificationSince("craftAsked", 100, me, asked), undefined);
	assert.equal(notificationSince("craftAsked", 100, me, { status: "cancelled" }), "cancelled");
	assert.equal(notificationSince("craftAsked", 100, me, { status: "claimed", claim: { userId: me } }), "accepted");
	assert.equal(
		notificationSince("craftAsked", 100, me, { status: "open", lastAsk: { outcome: "declined", at: 200 } }),
		"declined",
	);
	// A later ask of someone else isn't this one ending.
	assert.equal(notificationSince("craftAsked", 100, me, { status: "open", ask: { userId: "other" } }), undefined);
	assert.equal(notificationSince("craftClaimed", 100, "requester", { status: "done" }), "done");
	// Events that are already an ending get no tag.
	assert.equal(notificationSince("craftWithdrawn", 100, me, { status: "cancelled" }), undefined);
	assert.equal(notificationSince("requestDone", 100, me, { status: "done" }), undefined);
});

test("event lines: present while waiting, past once it ended", () => {
	assert.equal(notificationEvent("craftAsked"), "asks you to craft it");
	assert.equal(notificationEvent("craftAsked", { since: true }), "asked you to craft it");
	assert.equal(notificationEvent("itemsMailed", { mailed: 7 }), "mailed you 7");
});
