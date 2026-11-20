import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	appBundleOf,
	compareSemver,
	MacUpdater,
	type MacUpdaterOptions,
	macUpdateBlocker,
	parseUpdateInfo,
	pickZip,
	SWAP_SCRIPT,
} from "./mac-updater.ts";

const temp = () => mkdtempSync(join(tmpdir(), "guildie-mac-update-test-"));

// What electron-builder 26 writes for the universal dmg + zip.
const LATEST_MAC = `version: 0.3.50
files:
  - url: Guildie-mac-universal.zip
    sha512: ZmFrZQ==
    size: 201234567
  - url: Guildie-mac-universal.dmg
    sha512: b3RoZXI=
    size: 205000000
path: Guildie-mac-universal.zip
sha512: ZmFrZQ==
releaseDate: '2026-11-20T10:00:00.000Z'
`;

test("parseUpdateInfo reads version and files from latest-mac.yml", () => {
	const info = parseUpdateInfo(LATEST_MAC);
	assert.equal(info.version, "0.3.50");
	assert.deepEqual(info.files, [
		{ url: "Guildie-mac-universal.zip", sha512: "ZmFrZQ==", size: 201234567 },
		{ url: "Guildie-mac-universal.dmg", sha512: "b3RoZXI=", size: 205000000 },
	]);
	assert.equal(info.path, "Guildie-mac-universal.zip");
	assert.deepEqual(pickZip(info), { url: "Guildie-mac-universal.zip", sha512: "ZmFrZQ==", size: 201234567 });
});

test("parseUpdateInfo takes quotes, CRLF and the old path-only shape", () => {
	const info = parseUpdateInfo("version: '1.2.3'\r\npath: \"Guildie.zip\"\r\nsha512: 'abc+/='\r\n");
	assert.equal(info.version, "1.2.3");
	assert.deepEqual(info.files, []);
	assert.deepEqual(pickZip(info), { url: "Guildie.zip", sha512: "abc+/=" });
	assert.equal(pickZip(parseUpdateInfo("version: 1.0.0\npath: Guildie.dmg\nsha512: x\n")), undefined);
});

test("parseUpdateInfo rejects a file without a version", () => {
	assert.throws(() => parseUpdateInfo("<html>Not Found</html>"), /no version/);
	assert.throws(() => parseUpdateInfo("files:\n  - url: a.zip\n    sha512: x\n"), /no version/);
});

test("compareSemver orders versions and pre-releases", () => {
	assert.ok(compareSemver("0.3.50", "0.3.49") > 0);
	assert.ok(compareSemver("0.3.10", "0.3.9") > 0);
	assert.ok(compareSemver("1.0.0", "0.99.99") > 0);
	assert.equal(compareSemver("0.3.49", "0.3.49"), 0);
	assert.equal(compareSemver("v1.2.3", "1.2.3+build.5"), 0);
	assert.ok(compareSemver("0.3.48", "0.3.49") < 0);
	assert.ok(compareSemver("1.0.0", "1.0.0-beta.2") > 0);
	assert.ok(compareSemver("1.0.0-beta.2", "1.0.0-beta.10") < 0);
	assert.ok(compareSemver("1.0.0-beta", "1.0.0-alpha") > 0);
	assert.ok(compareSemver("1.0.0-alpha.1", "1.0.0-alpha") > 0);
});

test("appBundleOf finds the running .app", () => {
	assert.equal(appBundleOf("/Applications/Guildie.app/Contents/MacOS/Guildie"), "/Applications/Guildie.app");
	assert.equal(
		appBundleOf("/Users/a/Apps/My Things.app/Guildie.app/Contents/MacOS/Guildie"),
		"/Users/a/Apps/My Things.app/Guildie.app",
	);
	assert.equal(appBundleOf("/usr/lib/electron/electron"), undefined);
	assert.equal(appBundleOf("/Applications/Guildie.app/Contents/Frameworks/x"), undefined);
});

test("macUpdateBlocker: translocated, the disk image, read-only folders", () => {
	assert.equal(macUpdateBlocker("/Applications/Guildie.app", true), undefined);
	assert.equal(macUpdateBlocker("/Users/a/Downloads/Guildie.app", true), undefined);
	// An external drive is fine when it's writable.
	assert.equal(macUpdateBlocker("/Volumes/Games/Guildie.app", true), undefined);
	assert.match(macUpdateBlocker("/Volumes/Guildie 0.3.50-universal/Guildie.app", false) ?? "", /disk image/);
	assert.match(
		macUpdateBlocker("/private/var/folders/x/T/AppTranslocation/ABC-123/d/Guildie.app", true) ?? "",
		/App Translocation/,
	);
	assert.match(macUpdateBlocker("/Applications/Guildie.app", false) ?? "", /can't write to \/Applications/);
	assert.match(macUpdateBlocker(undefined, true) ?? "", /\.app bundle/);
});

/** A fake Guildie.app at `dir`, with a marker file. */
function fakeApp(dir: string, marker: string) {
	mkdirSync(join(dir, "Contents", "Resources", "addon", "Guildie"), { recursive: true });
	writeFileSync(join(dir, "Contents", "Resources", "addon", "Guildie", "Guildie.toc"), "## Version: 1\n");
	writeFileSync(join(dir, "Contents", "marker"), marker);
}

/** Runs the swap script synchronously, for a process that already exited. */
function swap(app: string, next: string, log: string) {
	const script = join(temp(), "install.sh");
	writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 });
	// A pid that's gone: a child that already exited.
	const gone = spawnSync("/bin/sh", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim();
	return spawnSync("/bin/sh", [script, gone, app, next, "0", log], { encoding: "utf8" });
}

test("the swap script replaces the app and removes the old one", { skip: process.platform === "win32" }, () => {
	const root = temp();
	const apps = join(root, "Applications");
	mkdirSync(apps);
	const app = join(apps, "Guildie.app");
	fakeApp(app, "old");
	const next = join(root, "update", "app", "Guildie.app");
	fakeApp(next, "new");
	const log = join(root, "guildie.log");

	const result = swap(app, next, log);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(join(app, "Contents", "marker"), "utf8"), "new");
	assert.equal(existsSync(next), false);
	// Nothing left next to it.
	assert.deepEqual(spawnSync("ls", ["-A", apps], { encoding: "utf8" }).stdout.trim().split("\n"), ["Guildie.app"]);
	assert.match(readFileSync(log, "utf8"), /Update: installed into/);
});

test("the swap script keeps the old app when the update is missing", { skip: process.platform === "win32" }, () => {
	const root = temp();
	const app = join(root, "Guildie.app");
	fakeApp(app, "old");
	const log = join(root, "guildie.log");

	const result = swap(app, join(root, "nothing", "Guildie.app"), log);
	assert.equal(result.status, 1);
	assert.equal(readFileSync(join(app, "Contents", "marker"), "utf8"), "old");
	assert.match(readFileSync(log, "utf8"), /kept the old version/);
});

/** A MacUpdater against an in-memory release, with every outside call faked. */
function harness(release: { version: string; zip: Buffer; sha512?: string; appVersion?: string; appId?: string }) {
	const root = temp();
	const zipName = "Guildie-mac-universal.zip";
	const sha512 = release.sha512 ?? createHash("sha512").update(release.zip).digest("base64");
	const yml = `version: ${release.version}\nfiles:\n  - url: ${zipName}\n    sha512: ${sha512}\n    size: ${release.zip.length}\npath: ${zipName}\nsha512: ${sha512}\n`;
	const fetched: string[] = [];
	const fakeFetch = (async (input: string | URL | Request) => {
		const url = String(input);
		fetched.push(url);
		if (url.endsWith("latest-mac.yml")) return new Response(yml);
		if (url.endsWith(zipName))
			return new Response(new Uint8Array(release.zip), { headers: { "content-length": String(release.zip.length) } });
		return new Response("Not Found", { status: 404 });
	}) as typeof fetch;
	let install: (() => void) | undefined;
	const spawned: string[][] = [];
	let quit = 0;
	const options: MacUpdaterOptions = {
		currentVersion: "0.3.49",
		bundle: join(root, "Applications", "Guildie.app"),
		workDir: join(root, "userData", "update"),
		logFile: join(root, "userData", "guildie.log"),
		feedUrl: "https://example.test/releases/latest/download/latest-mac.yml",
		fetch: fakeFetch,
		log: () => {},
		onQuit: (cb) => {
			install = cb;
		},
		quit: () => {
			quit++;
			install?.();
		},
		readPlist: async (_plist, key) =>
			key === "CFBundleIdentifier"
				? (release.appId ?? "club.guildie.desktop")
				: (release.appVersion ?? release.version),
		unzip: async (_zip, into) => fakeApp(join(into, "Guildie.app"), "new"),
		spawnInstaller: (script, args) => spawned.push([script, ...args]),
		pid: 4242,
	};
	const updater = new MacUpdater(options);
	const events: string[] = [];
	for (const e of ["checking-for-update", "update-available", "update-not-available", "update-downloaded", "error"])
		updater.on(e, (arg: { version?: string; message?: string }) =>
			events.push(arg?.message ? `${e}: ${arg.message}` : arg?.version ? `${e} ${arg.version}` : e),
		);
	let progress = 0;
	updater.on("download-progress", () => progress++);
	const settled = () =>
		new Promise<void>((resolve) => {
			const done = () => resolve();
			updater.once("update-downloaded", done);
			updater.once("error", done);
		});
	return {
		updater,
		events,
		fetched,
		spawned,
		options,
		settled,
		get progress() {
			return progress;
		},
		get quit() {
			return quit;
		},
		triggerQuit: () => install?.(),
	};
}

test("MacUpdater: up to date", async () => {
	const h = harness({ version: "0.3.49", zip: Buffer.from("zip") });
	await h.updater.checkForUpdates();
	assert.deepEqual(h.events, ["checking-for-update", "update-not-available 0.3.49"]);
	assert.equal(h.fetched.length, 1);
});

test("MacUpdater: downloads, checks and installs on quit without reopening", async () => {
	const h = harness({ version: "0.3.50", zip: Buffer.alloc(300_000, 7) });
	const done = h.settled();
	await h.updater.checkForUpdates();
	await done;
	assert.deepEqual(h.events, ["checking-for-update", "update-available 0.3.50", "update-downloaded 0.3.50"]);
	assert.equal(h.fetched[1], "https://example.test/releases/latest/download/Guildie-mac-universal.zip");
	assert.ok(h.progress >= 1);
	// The zip is gone once unzipped; the app waits in userData/update.
	assert.equal(existsSync(join(h.options.workDir, "0.3.50", "update.zip")), false);

	h.triggerQuit();
	h.triggerQuit(); // once only
	assert.equal(h.spawned.length, 1);
	const [script, pid, app, next, relaunch, log] = h.spawned[0];
	assert.equal(readFileSync(script, "utf8"), SWAP_SCRIPT);
	assert.equal(pid, "4242");
	assert.equal(app, h.options.bundle);
	assert.equal(next, join(h.options.workDir, "0.3.50", "app", "Guildie.app"));
	assert.equal(relaunch, "0");
	assert.equal(log, h.options.logFile);

	// Checking again after it's downloaded says ready again, without a second download.
	await h.updater.checkForUpdates();
	assert.equal(h.events.at(-1), "update-downloaded 0.3.50");
	assert.equal(h.fetched.filter((u) => u.endsWith(".zip")).length, 1);
});

test("MacUpdater: Restart to update quits and reopens", async () => {
	const h = harness({ version: "0.4.0", zip: Buffer.from("zip") });
	const done = h.settled();
	await h.updater.checkForUpdates();
	await done;
	h.updater.quitAndInstall();
	assert.equal(h.quit, 1);
	assert.equal(h.spawned[0][4], "1");
});

test("MacUpdater: a wrong sha512 is an error and nothing installs", async () => {
	const h = harness({ version: "0.3.50", zip: Buffer.from("zip"), sha512: "bm9wZQ==" });
	const done = h.settled();
	await h.updater.checkForUpdates();
	await done;
	assert.match(h.events.at(-1) ?? "", /^error: .*sha512 doesn't match/);
	assert.equal(existsSync(h.options.workDir), false);
	h.triggerQuit();
	assert.equal(h.spawned.length, 0);
});

test("MacUpdater: refuses an app that isn't Guildie or isn't that version", async () => {
	for (const [bad, message] of [
		[{ appId: "com.example.other" }, /not club\.guildie\.desktop/],
		[{ appVersion: "0.3.49" }, /version 0\.3\.49, not 0\.3\.50/],
	] as const) {
		const h = harness({ version: "0.3.50", zip: Buffer.from("zip"), ...bad });
		const done = h.settled();
		await h.updater.checkForUpdates();
		await done;
		assert.match(h.events.at(-1) ?? "", message);
		h.triggerQuit();
		assert.equal(h.spawned.length, 0);
	}
});

test("MacUpdater: a missing feed is an error", async () => {
	const h = harness({ version: "0.3.50", zip: Buffer.from("zip") });
	h.options.fetch = (async () => new Response("Not Found", { status: 404 })) as typeof fetch;
	const updater = new MacUpdater(h.options);
	const errors: string[] = [];
	updater.on("error", (e: Error) => errors.push(e.message));
	await updater.checkForUpdates();
	assert.deepEqual(errors, ["latest-mac.yml: HTTP 404"]);
});
