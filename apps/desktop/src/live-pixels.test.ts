import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LivePixels, PixelLines, type PixelStatus, parsePixelConfig } from "./live-pixels.ts";

test("pixel config requires local absolute paths and bounded geometry", () => {
	const config = { python: process.execPath, reader: join(tmpdir(), "reader.py"), left: -32, top: 10, cell: 2 };
	assert.equal(parsePixelConfig(config).theme, "amber");
	for (const invalid of [{ cell: 1 }, { left: 0.5 }, { reader: "relative.py" }, { theme: "red" }]) {
		assert.throws(() => parsePixelConfig({ ...config, ...invalid }));
	}
});

test("pixel JSON lines handle chunk boundaries and reject oversized/malformed records", () => {
	const records: unknown[] = [];
	const lines = new PixelLines((channel, data) => records.push({ channel, data }));
	lines.feed('{"channel":"live","data":');
	assert.equal(records.length, 0);
	lines.feed('{"zone":"Forêt"}}\n{"channel":"snapshot","data":{"version":4,"characters":[]}}\n');
	assert.equal(records.length, 2);
	assert.throws(() => new PixelLines(() => {}).feed("x".repeat(2 * 1024 * 1024 + 1)));
	assert.throws(() => new PixelLines(() => {}).feed('{"channel":"command","data":{}}\n'));
});

test("reader lifecycle forwards only snapshots and stops the child", async () => {
	const directory = mkdtempSync(join(tmpdir(), "guildie-pixel-test-"));
	const reader = join(directory, "reader.cjs");
	writeFileSync(
		reader,
		`
console.log(JSON.stringify({channel:"live",data:{health:5}}));
console.log(JSON.stringify({channel:"snapshot",data:{version:4,characters:[{name:"test"}]}}));
setInterval(() => {}, 1000);
`,
	);
	const states: PixelStatus[] = [];
	let capture: LivePixels;
	try {
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error("reader timeout")), 5_000);
			capture = new LivePixels(
				{ python: process.execPath, reader, left: 0, top: 0, cell: 2, theme: "amber" },
				(snapshot) => {
					clearTimeout(timeout);
					try {
						assert.deepEqual(snapshot, { version: 4, characters: [{ name: "test" }] });
						capture.stop();
						resolve();
					} catch (error) {
						reject(error);
					}
				},
				(state) => states.push(state),
			);
			capture.start();
		});
		assert.deepEqual(states, ["waiting", "receiving", "stopped"]);
	} finally {
		capture!.stop();
		rmSync(directory, { recursive: true, force: true });
	}
});
