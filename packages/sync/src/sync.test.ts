import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Api, isTokenShaped } from "./api.ts";
import { displayName, SyncEngine } from "./sync.ts";
import { findAddonFolders, findSavedVariables, findWowFolder, loadedAddonVersion } from "./watcher.ts";

/** A WoW folder with Forever and Classic, the addon installed in Forever, and a saved file. */
function fakeWow(payload = '{"version":1,"characters":[]}') {
	const wow = mkdtempSync(join(tmpdir(), "guildie-wow-"));
	const saved = join(wow, "_forever_", "WTF", "Account", "ACCOUNT1", "SavedVariables");
	mkdirSync(saved, { recursive: true });
	mkdirSync(join(wow, "_classic_", "WTF", "Account"), { recursive: true });
	const addon = join(wow, "_forever_", "Interface", "AddOns", "Guildie");
	mkdirSync(addon, { recursive: true });
	writeFileSync(join(addon, "Guildie.toc"), "## Title: Guildie\n");
	const file = join(saved, "Guildie.lua");
	writeFileSync(file, `GuildieDB = {\n\t["payload"] = "${payload.replace(/"/g, '\\"')}",\n}\n`);
	return { wow, file, addon };
}

type Call = { path: string; method: string; auth?: string; body?: string };

/** An Api whose requests are answered by `answer` and recorded in `calls`. */
function fakeApi(answer: (call: Call) => { status: number; body: unknown }) {
	const calls: Call[] = [];
	const api = new Api("https://guildie.test", "gld_abcdefghijklmnopqrstuvwxyz012345", async (url, init) => {
		const headers = init.headers as Record<string, string>;
		const call = {
			path: new URL(url).pathname,
			method: init.method ?? "GET",
			auth: headers.Authorization,
			body: init.body as string | undefined,
		};
		calls.push(call);
		const { status, body } = answer(call);
		return new Response(JSON.stringify(body), { status });
	});
	return { api, calls };
}

test("finds the install, its saved files and addon folders", () => {
	const { wow, file, addon } = fakeWow();
	assert.equal(findWowFolder(wow), wow);
	assert.equal(findWowFolder(join(wow, "nope")), undefined);
	assert.deepEqual(findSavedVariables(wow), [file]);
	assert.deepEqual(findAddonFolders(wow), [addon]);
});

test("uploads once per change, downloads guild data, writes GuildieData.lua", async () => {
	const { wow, file, addon } = fakeWow('{"version":1,"characters":[{"name":"Brenna"}]}');
	const { api, calls } = fakeApi(({ path }) =>
		path === "/api/helper/snapshot"
			? { status: 200, body: { accepted: ["brenna-ironfoot"], unmatched: ["Alt"] } }
			: { status: 200, body: { generatedAt: 1, guilds: ["Dawn"], reagents: {} } },
	);
	const uploads: string[][] = [];
	const unmatched: string[][] = [];
	const engine = new SyncEngine(api, wow, {
		log: () => {},
		onUnauthorized: () => assert.fail("not expected"),
		onUpload: (u) => uploads.push(u.characters),
		onUnmatched: (names) => unmatched.push(names),
	});
	await engine.tick();
	assert.deepEqual(
		calls.map((c) => c.path),
		["/api/helper/snapshot", "/api/helper/guild-data"],
	);
	assert.equal(calls[0]?.auth, "Bearer gld_abcdefghijklmnopqrstuvwxyz012345");
	assert.deepEqual(JSON.parse(calls[0]?.body ?? ""), { version: 1, characters: [{ name: "Brenna" }] });
	assert.deepEqual(uploads, [["brenna-ironfoot"]]);
	assert.deepEqual(unmatched, [["Alt"]]);
	assert.ok(readFileSync(join(addon, "GuildieData.lua"), "utf8").includes('["guilds"]={"Dawn"}'));
	assert.ok(engine.guildDataAt);

	// Nothing changed: nothing to do.
	await engine.tick();
	assert.equal(calls.length, 2);

	// "Upload now" sends it again; the unmatched name isn't repeated.
	engine.now();
	await engine.tick();
	assert.equal(calls.length, 4);
	assert.deepEqual(unmatched, [["Alt"]]);

	// The game rewrites the file with something new.
	writeFileSync(file, 'GuildieDB = { ["payload"] = "{\\"version\\":1,\\"characters\\":[{\\"name\\":\\"Corwin\\"}]}" }');
	const later = new Date(Date.now() + 5_000);
	utimesSync(file, later, later);
	await engine.tick();
	assert.equal(calls.length, 6);
	assert.ok(calls[4]?.body?.includes("Corwin"));
});

test("an accepted upload downloads guild data again at once; a refused one doesn't", async () => {
	const { wow, file, addon } = fakeWow('{"version":1,"characters":[{"name":"Brenna"}]}');
	let level = 22;
	let accept = true;
	const { api, calls } = fakeApi(({ path }) =>
		path === "/api/helper/snapshot"
			? { status: 200, body: accept ? { accepted: ["brenna-ironfoot"] } : { unmatched: ["Brenna"] } }
			: {
					status: 200,
					body: { generatedAt: level, guilds: ["Dawn"], reagents: {}, characters: { Brenna: { level } } },
				},
	);
	const engine = new SyncEngine(api, wow, { log: () => {}, onUnauthorized: () => assert.fail("not expected") });
	await engine.tick();
	assert.equal(calls.length, 2);

	// Leveled up and /reloaded: the upload, then fresh guild data in the same tick.
	level = 23;
	const rewrite = (name: string, seconds: number) => {
		writeFileSync(
			file,
			`GuildieDB = { ["payload"] = "{\\"version\\":1,\\"characters\\":[{\\"name\\":\\"${name}\\"}]}" }`,
		);
		const later = new Date(Date.now() + seconds * 1000);
		utimesSync(file, later, later);
	};
	rewrite("Brenna2", 5);
	await engine.tick();
	assert.deepEqual(
		calls.slice(2).map((c) => c.path),
		["/api/helper/snapshot", "/api/helper/guild-data"],
	);
	assert.deepEqual(JSON.parse(calls[2]?.body ?? ""), { version: 1, characters: [{ name: "Brenna2" }] });
	assert.ok(readFileSync(join(addon, "GuildieData.lua"), "utf8").includes('["Brenna"]={["level"]=23}'));

	// Nothing accepted (not claimed): no extra download.
	accept = false;
	rewrite("Brenna3", 10);
	await engine.tick();
	assert.deepEqual(
		calls.slice(4).map((c) => c.path),
		["/api/helper/snapshot"],
	);
});

test("a 401 disconnects", async () => {
	const { wow } = fakeWow();
	const { api } = fakeApi(() => ({ status: 401, body: { error: "Unknown or revoked token" } }));
	let disconnected = 0;
	const engine = new SyncEngine(api, wow, {
		log: () => {},
		onUnauthorized: () => {
			disconnected++;
			api.token = undefined;
		},
	});
	await engine.tick();
	assert.equal(disconnected, 1);
	assert.equal(engine.lastUpload, undefined);
});

test("token shape and display names", () => {
	assert.ok(isTokenShaped("gld_abcdefghijklmnopqrstuvwxyz012345"));
	assert.ok(!isTokenShaped("gld_short"));
	assert.ok(!isTokenShaped("abc_abcdefghijklmnopqrstuvwxyz012345"));
	assert.ok(!isTokenShaped("gld_abcdefghijklmnop qrstuvwxyz012345"));
	assert.ok(!isTokenShaped(42));
	assert.equal(displayName("brenna-ironfoot"), "Brenna");
});

test("pixel snapshots coalesce, retry with throttling, deduplicate and reset on disconnect", async (t) => {
	let now = 1_000_000;
	t.mock.method(Date, "now", () => now);
	const { wow } = fakeWow();
	let fail = false;
	const { api, calls } = fakeApi(({ path }) =>
		path === "/api/helper/snapshot"
			? { status: fail ? 503 : 200, body: { accepted: ["test-player"] } }
			: { status: 200, body: { generatedAt: 1, guilds: [], reagents: {} } },
	);
	const engine = new SyncEngine(api, wow, { log: () => {}, onUnauthorized: () => {} });
	await engine.tick();
	calls.length = 0;
	const snapshot = (level: number) => ({
		version: 6,
		characters: [
			{
				name: "Test",
				level,
				completedQuestIds: [6981],
				deliveries: [
					{
						id: "Player:1:1",
						requestId: "request1",
						kind: "mailReceived",
						other: "Sender-Last",
						itemId: 4306,
						quantity: 7,
						at: 1794300000,
					},
				],
			},
		],
	});
	assert.equal(engine.queuePixelSnapshot({ health: 10 }), false);
	assert.equal(engine.queuePixelSnapshot(snapshot(1)), true);
	engine.queuePixelSnapshot(snapshot(2));
	fail = true;
	await engine.tick();
	assert.equal(calls.length, 1);
	assert.deepEqual(JSON.parse(calls[0]!.body!), snapshot(2));
	await engine.tick();
	assert.equal(calls.length, 1, "retry waits 30 seconds");
	fail = false;
	now += 30_000;
	await engine.tick();
	assert.equal(calls.filter((c) => c.path.endsWith("snapshot")).length, 2);
	assert.ok(engine.lastUpload);
	engine.queuePixelSnapshot(snapshot(2));
	now += 30_000;
	await engine.tick();
	assert.equal(calls.filter((c) => c.path.endsWith("snapshot")).length, 2, "identical snapshot not sent twice");
	engine.queuePixelSnapshot(snapshot(3));
	engine.reset();
	api.token = undefined;
	assert.equal(engine.queuePixelSnapshot(snapshot(4)), false);
	await engine.tick();
	assert.equal(calls.filter((c) => c.path.endsWith("snapshot")).length, 2, "disconnect discards pending data");
});

test("loadedAddonVersion: what the game last ran, from the newest saved file", () => {
	const { wow, file } = fakeWow();
	assert.equal(loadedAddonVersion(wow), null, "an addon from before 0.10.1 doesn't say");
	writeFileSync(file, `GuildieDB = {\n\t["addonVersion"] = "0.10.1",\n\t["payload"] = "{}",\n}\n`);
	utimesSync(file, new Date(), new Date(Date.now() + 1000));
	assert.equal(loadedAddonVersion(wow), "0.10.1");
	assert.equal(loadedAddonVersion(mkdtempSync(join(tmpdir(), "guildie-empty-"))), undefined, "nothing saved");
});

test("capture follows the newest saved Forever preference and stops for missing or invalid saves", async () => {
	const { savedLivePixelsEnabled } = await import("./watcher.ts");
	const { rmSync } = await import("node:fs");
	const { wow, file } = fakeWow();
	try {
		assert.equal(savedLivePixelsEnabled(wow), false);
		writeFileSync(file, 'GuildieDB = { ["livePixels"] = { ["enabled"] = true, ["theme"] = "amber" } }');
		assert.equal(savedLivePixelsEnabled(wow), true);
		writeFileSync(file, 'GuildieDB = { ["livePixels"] = { ["enabled"] = false } }');
		assert.equal(savedLivePixelsEnabled(wow), false);
		writeFileSync(file, 'GuildieDB = { ["livePixels"] = { ["enabled"] = true');
		assert.equal(savedLivePixelsEnabled(wow), false);
		const second = join(wow, "_forever_", "WTF", "Account", "ACCOUNT2", "SavedVariables", "Guildie.lua");
		mkdirSync(join(second, ".."), { recursive: true });
		writeFileSync(second, 'GuildieDB = { ["livePixels"] = { ["enabled"] = true } }');
		utimesSync(second, new Date(), new Date(Date.now() + 5000));
		assert.equal(savedLivePixelsEnabled(wow), true);
		writeFileSync(file, 'GuildieDB = { ["livePixels"] = { ["enabled"] = false } }');
		utimesSync(file, new Date(), new Date(Date.now() + 10000));
		assert.equal(savedLivePixelsEnabled(wow), false);
		rmSync(file);
		rmSync(second);
		assert.equal(savedLivePixelsEnabled(wow), false);
	} finally {
		rmSync(wow, { recursive: true, force: true });
	}
});

test("durable captures survive restart, partial acceptance and disabled capture", async (t) => {
	let now = 2_000_000;
	t.mock.method(Date, "now", () => now);
	const root = mkdtempSync(join(tmpdir(), "guildie-outbox-"));
	let accept = false;
	const { api, calls } = fakeApi(() => ({
		status: 200,
		body: accept ? { accepted: ["test"] } : { unmatched: ["Test"] },
	}));
	const events = { log: () => {}, onUnauthorized: () => {} };
	const first = new SyncEngine(api, "/missing", events, root);
	const snapshot = { version: 6, characters: [{ name: "Test", completedQuestIds: [6981] }] };
	assert.equal(first.queuePixelSnapshot(snapshot), true);
	first.clearPixelSnapshot();
	await first.tick();
	assert.equal(calls.length, 1);
	first.reset(false); // normal shutdown
	const second = new SyncEngine(api, "/missing", events, root);
	now += 30_000;
	accept = true;
	await second.tick();
	assert.deepEqual(JSON.parse(calls[1]!.body!), snapshot);
	now += 30_000;
	await second.tick();
	assert.equal(calls.length, 2, "accepted capture removed from disk");
	second.queuePixelSnapshot(snapshot);
	const third = new SyncEngine(api, "/missing", events, root);
	api.token = "gld_different_account_token_123456";
	await third.tick();
	assert.equal(calls.length, 2, "different account cannot replay old captures");
	api.token = "gld_abcdefghijklmnopqrstuvwxyz012345";
	third.reset(); // explicit sign-out purges this account
	await new SyncEngine(api, "/missing", events, root).tick();
	assert.equal(calls.length, 2);
});
