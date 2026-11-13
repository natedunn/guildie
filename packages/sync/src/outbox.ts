import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Complete captures, committed before network I/O. Never evict unacknowledged data. */
export class Outbox {
	private readonly root: string;
	private readonly scope: string;
	constructor(root: string, scope: string) {
		this.root = root;
		this.scope = scope;
	}
	private get folder() {
		return join(this.root, createHash("sha256").update(this.scope).digest("hex"));
	}
	put(payload: string) {
		mkdirSync(this.folder, { recursive: true, mode: 0o700 });
		const file = join(this.folder, `${createHash("sha256").update(payload).digest("hex")}.json`);
		if (existsSync(file)) return;
		const obsolete = this.files().filter((p) => supersedes(payload, readFileSync(p, "utf8")));
		const bytes = this.files()
			.filter((p) => !obsolete.includes(p))
			.reduce((sum, p) => sum + statSync(p).size, 0);
		if (bytes + Buffer.byteLength(payload) > 64 * 1024 * 1024)
			throw new Error(
				"Pending sync storage is full. Existing captures are safe; reconnect and sync before capturing more.",
			);
		const temp = `${file}.tmp`;
		const fd = openSync(temp, "w", 0o600);
		try {
			writeFileSync(fd, payload);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		renameSync(temp, file);
		for (const old of obsolete) rmSync(old, { force: true });
	}
	private files() {
		if (!existsSync(this.folder)) return [];
		return readdirSync(this.folder)
			.filter((f) => f.endsWith(".json"))
			.map((f) => join(this.folder, f))
			.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs || a.localeCompare(b));
	}
	peek() {
		const file = this.files()[0];
		return file ? { file, payload: readFileSync(file, "utf8") } : undefined;
	}
	defer(file: string) {
		if (existsSync(file)) {
			const now = new Date();
			utimesSync(file, now, now);
		}
	}
	ack(file: string) {
		rmSync(file, { force: true });
	}
	clear() {
		rmSync(this.folder, { recursive: true, force: true });
	}
}

// Compact only when every old character, captured section and retained event
// is represented in the replacement. Commit the replacement before deletion.
type Captured = { capturedAt: number };
type Character = {
	guid?: string;
	capturedAt: number;
	equipment?: Captured;
	professions?: Captured;
	proficiencies?: Captured;
	quests?: Captured;
	inventory?: { bags?: Captured; bank?: Captured };
	recipes?: (Captured & { profession: string })[];
	completedQuestIds?: number[];
	deliveries?: { id: string }[];
};
function supersedes(next: string, previous: string): boolean {
	const n = JSON.parse(next) as { characters: Character[] },
		p = JSON.parse(previous) as { characters: Character[] };
	return p.characters.every((old) => {
		if (!old.guid) return false;
		const fresh = n.characters.find((c) => c.guid === old.guid);
		if (!fresh || !(fresh.capturedAt >= old.capturedAt)) return false;
		for (const key of ["equipment", "professions", "proficiencies", "quests"] as const) {
			if (old[key] && !((fresh[key]?.capturedAt ?? -1) >= old[key].capturedAt)) return false;
		}
		for (const key of ["bags", "bank"] as const) {
			if (old.inventory?.[key] && !((fresh.inventory?.[key]?.capturedAt ?? -1) >= old.inventory[key].capturedAt))
				return false;
		}
		for (const recipe of old.recipes ?? []) {
			if (!(fresh.recipes ?? []).some((r) => r.profession === recipe.profession && r.capturedAt >= recipe.capturedAt))
				return false;
		}
		return (
			(old.completedQuestIds ?? []).every((id: number) => (fresh.completedQuestIds ?? []).includes(id)) &&
			(old.deliveries ?? []).every((e: { id: string }) =>
				(fresh.deliveries ?? []).some((f: { id: string }) => e.id === f.id),
			)
		);
	});
}
