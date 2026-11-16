// Reload reminders (an experimental setting in the app): the game reads
// GuildieData.lua only at login and /reload, so tooltips keep showing what
// the guild looked like then. The app remembers the guild data the game
// loaded and compares each new download with it; when enough has changed
// (guildmates' gear and levels, requests, crafters' recipes) while WoW is
// open, it suggests a /reload.

import type { GuildData } from "./api.ts";

/** What tooltips use, per guildmate, request and crafter: key -> fingerprint. */
export type GuildSummary = {
	levels: Map<string, number>;
	gear: Map<string, string>;
	requests: Map<string, string>;
	recipes: Map<string, string>;
};

export type GuildChanges = { gear: number; levels: number; requests: number; recipes: number; total: number };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const who = (m: Record<string, unknown>) => `${String(m.name)}:${String(m.classId)}`;

export function summarize(data: GuildData): GuildSummary {
	const summary: GuildSummary = { levels: new Map(), gear: new Map(), requests: new Map(), recipes: new Map() };
	for (const m of data.upgrades?.members ?? []) {
		if (!isRecord(m)) continue;
		// `seen` moves at every logout; it isn't a change worth a reload.
		const { seen: _seen, level, ...gear } = m;
		if (typeof level === "number") summary.levels.set(who(m), level);
		summary.gear.set(who(m), JSON.stringify(gear));
	}
	const requests = (data as { requests?: unknown }).requests;
	if (isRecord(requests)) {
		for (const [itemId, list] of Object.entries(requests)) {
			if (!Array.isArray(list)) continue;
			for (const r of list) {
				if (isRecord(r)) summary.requests.set(String(r.requestId ?? `${itemId}:${who(r)}`), JSON.stringify(r));
			}
		}
	}
	for (const c of data.recipes?.crafters ?? []) {
		if (isRecord(c)) summary.recipes.set(who(c), JSON.stringify(c));
	}
	return summary;
}

/** Keys added, removed or changed between two maps. */
function diff<T>(before: Map<string, T>, after: Map<string, T>) {
	let n = 0;
	for (const [key, value] of after) if (before.get(key) !== value) n++;
	for (const key of before.keys()) if (!after.has(key)) n++;
	return n;
}

export function countChanges(before: GuildSummary, after: GuildSummary): GuildChanges {
	let levels = 0;
	for (const [key, level] of after.levels) {
		const was = before.levels.get(key);
		if (was !== undefined && level > was) levels++;
	}
	const changes = {
		gear: diff(before.gear, after.gear),
		levels,
		requests: diff(before.requests, after.requests),
		recipes: diff(before.recipes, after.recipes),
	};
	return { ...changes, total: changes.gear + changes.levels + changes.requests + changes.recipes };
}

/** "12 guild changes since your last /reload (gear on 5 guildmates, 3 level-ups, 4 requests)." */
export function reminderText(c: GuildChanges) {
	const parts = [
		c.gear && (c.gear === 1 ? "gear on 1 guildmate" : `gear on ${c.gear} guildmates`),
		c.levels && (c.levels === 1 ? "1 level-up" : `${c.levels} level-ups`),
		c.requests && (c.requests === 1 ? "1 request" : `${c.requests} requests`),
		c.recipes && (c.recipes === 1 ? "1 crafter's recipes" : `${c.recipes} crafters' recipes`),
	].filter(Boolean);
	return `${c.total} guild changes since your last /reload (${parts.join(", ")}). /reload in WoW to update Guildie's tooltips.`;
}

/** Changes it takes to suggest a reload, and to suggest it again. */
export const RELOAD_THRESHOLD = 10;
/** At most one reminder this often. */
export const RELOAD_REMIND_EVERY_MS = 60 * 60_000;

/**
 * Tells when to remind. Fed by the app: whether WoW is open, when the game
 * last saved Guildie's SavedVariables (it does at /reload and logout, right
 * before loading GuildieData.lua again), and each guild data download.
 */
export class ReloadReminder {
	private current: GuildSummary | undefined;
	/** What the game loaded; unknown when the app started after WoW did. */
	private loaded: GuildSummary | undefined;
	private running = false;
	private savedAt: number | undefined;
	private reminded: { at: number; total: number } | undefined;
	private readonly remind: (text: string) => void;
	private readonly now: () => number;

	constructor(remind: (text: string) => void, now = () => Date.now()) {
		this.remind = remind;
		this.now = now;
	}

	/** WoW opened: it loads the data on disk (the newest download). */
	gameRunning(running: boolean) {
		if (running && !this.running) this.gameLoaded();
		this.running = running;
	}

	/** The game saved Guildie's SavedVariables: a /reload or logout, so a fresh load. */
	savedVariables(at: number | undefined) {
		if (at === undefined) return;
		if (this.savedAt !== undefined && at !== this.savedAt) this.gameLoaded();
		this.savedAt = at;
	}

	/** A download written to GuildieData.lua. */
	guildData(data: GuildData) {
		this.current = summarize(data);
		this.check();
	}

	private gameLoaded() {
		this.loaded = this.current;
		this.reminded = undefined;
	}

	private check() {
		if (!this.running || !this.loaded || !this.current) return;
		const changes = countChanges(this.loaded, this.current);
		if (changes.total < RELOAD_THRESHOLD) return;
		const last = this.reminded;
		if (last && (this.now() - last.at < RELOAD_REMIND_EVERY_MS || changes.total < last.total + RELOAD_THRESHOLD))
			return;
		this.reminded = { at: this.now(), total: changes.total };
		this.remind(reminderText(changes));
	}
}
