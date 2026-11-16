import assert from "node:assert/strict";
import { test } from "node:test";
import type { GuildData } from "./api.ts";
import { countChanges, RELOAD_REMIND_EVERY_MS, ReloadReminder, reminderText, summarize } from "./reloadReminder.ts";

type Member = { name: string; classId: number; level: number; seen: number; slots: Record<number, number> };
const member = (name: string, level = 20, head = 10, seen = 1): Member => ({
	name,
	classId: 1,
	level,
	seen,
	slots: { 1: head },
});
const guild = (members: Member[], requests: Record<string, unknown[]> = {}, crafters: unknown[] = []) =>
	({
		generatedAt: 0,
		guilds: [],
		reagents: {},
		upgrades: { members },
		requests,
		recipes: { crafters },
	}) as GuildData;
const names = Array.from({ length: 12 }, (_, i) => `M${i}`);

test("counts gear, level-ups, requests and recipes; not logins", () => {
	const before = summarize(
		guild(
			[member("A"), member("B"), member("C")],
			{ 2589: [{ requestId: "r1", name: "Todd", classId: 1, quantity: 20 }] },
			[{ name: "Miller", classId: 2, known: [1] }],
		),
	);
	const after = summarize(
		guild(
			[member("A", 21), member("B", 20, 12), member("C", 20, 10, 99)],
			{ 2589: [{ requestId: "r2", name: "Todd", classId: 1, quantity: 5 }] },
			[{ name: "Miller", classId: 2, known: [1, 2] }],
		),
	);
	assert.deepEqual(countChanges(before, after), { gear: 1, levels: 1, requests: 2, recipes: 1, total: 5 });
	assert.equal(
		reminderText(countChanges(before, after)),
		"5 guild changes since your last /reload (gear on 1 guildmate, 1 level-up, 2 requests, 1 crafter's recipes). /reload in WoW to update Guildie's tooltips.",
	);
});

test("reminds once enough changed while WoW is open, then not again for an hour", () => {
	let now = 0;
	const said: string[] = [];
	const r = new ReloadReminder(
		(t) => said.push(t),
		() => now,
	);
	r.guildData(guild(names.map((n) => member(n))));
	r.savedVariables(100);
	r.gameRunning(true);
	r.guildData(guild(names.map((n, i) => member(n, i < 5 ? 21 : 20))));
	assert.equal(said.length, 0, "5 changes: not yet");
	r.guildData(guild(names.map((n) => member(n, 21))));
	assert.equal(said.length, 1);
	assert.match(said[0], /^12 guild changes/);
	r.guildData(guild(names.map((n) => member(n, 22, 99))));
	assert.equal(said.length, 1, "not within the hour");
	now = RELOAD_REMIND_EVERY_MS;
	r.guildData(guild(names.map((n) => member(n, 22, 98))));
	assert.equal(said.length, 2, "an hour on and 10 more");
});

test("a /reload loads the newest data; nothing while WoW is closed or before a known load", () => {
	const said: string[] = [];
	const r = new ReloadReminder((t) => said.push(t));
	r.gameRunning(true); // the app started after WoW: what it loaded is unknown
	r.savedVariables(100);
	r.guildData(guild(names.map((n) => member(n))));
	r.guildData(guild(names.map((n) => member(n, 30))));
	assert.equal(said.length, 0, "unknown load: no reminder");
	r.savedVariables(200); // a /reload: the game loaded the level 30 data
	r.guildData(guild(names.map((n) => member(n, 30, 50))));
	assert.equal(said.length, 1);
	r.savedVariables(300);
	r.gameRunning(false);
	r.guildData(guild(names.map((n) => member(n, 40, 60))));
	assert.equal(said.length, 1, "WoW closed");
});
