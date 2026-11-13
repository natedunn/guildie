import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Outbox } from "./outbox.ts";

test("compaction keeps missing events, characters and older section reads", () => {
	const root = mkdtempSync(join(tmpdir(), "guildie-outbox-test-"));
	try {
		const queue = new Outbox(root, "account");
		const value = (time: number, ids: number[], gear = time) =>
			JSON.stringify({
				version: 6,
				characters: [{ guid: "Player-1", capturedAt: time, equipment: { capturedAt: gear }, completedQuestIds: ids }],
			});
		queue.put(value(1, [123]));
		queue.put(value(2, [123]));
		assert.equal(queue.peek()?.payload, value(2, [123]), "newer complete snapshot supersedes older");
		queue.put(value(3, []));
		assert.equal(queue.peek()?.payload, value(2, [123]), "completion cannot disappear during compaction");
		queue.put(value(4, [123], 1));
		assert.equal(queue.peek()?.payload, value(2, [123]), "old gear cannot replace newer capture");
		queue.put(value(5, [123]));
		assert.equal(queue.peek()?.payload, value(5, [123]));
		queue.ack(queue.peek()!.file);
		assert.equal(queue.peek(), undefined);
		assert.equal(readdirSync(root).length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
