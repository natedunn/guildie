import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNELS, type NotificationKind, notificationText } from "./shared/notifications.ts";

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
