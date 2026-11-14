// The Guildie endpoints the helper and the desktop app use
// (apps/web/src/routes/api/helper).

export type Me = { battletag: string | null; characters: string[] };
/** `rejected`: characters the site refused as malformed (names; the site logs why). */
export type UploadResult = { accepted?: string[]; unmatched?: string[]; rejected?: string[]; error?: string };
/** `upgrades`: gear-upgrade suggestions (addon 0.5.0); written to GuildieData.lua as is. */
export type GuildData = {
	generatedAt: number;
	guilds: string[];
	reagents: Record<string, unknown>;
	upgrades?: { members?: unknown[] };
	/** Your own characters as Guildie shows them, for the addon's "not on Guildie yet" check (addon 0.6.0). */
	characters?: Record<string, unknown>;
	/** Recipe items and guild crafters, for "who can learn this" (addon 0.14.0). */
	recipes?: { items?: Record<string, unknown>; crafters?: unknown[] };
};
export type Pairing = { code: string; pollSecret: string; expiresInSeconds: number; connectUrl: string };
export type PairingResult =
	| { status: "pending" | "expired" }
	| { status: "approved"; token: string /** When pairing asked for a session. */; sessionCode?: string };

/** What the client calls to reach the site: the global fetch by default. The
 * helper passes one that accepts *.localhost's self-signed certificate (Bun's
 * `tls` option); the desktop app passes Electron's `net.fetch`. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** What a token looks like (`gld_` and then URL-safe characters). */
export const isTokenShaped = (token: unknown): token is string =>
	typeof token === "string" && /^gld_[A-Za-z0-9_-]{16,200}$/.test(token);

export class Api {
	readonly base: string;
	token: string | undefined;
	private readonly fetchImpl: Fetch;

	constructor(base: string, token?: string, fetchImpl: Fetch = (url, init) => fetch(url, init)) {
		this.base = base;
		this.token = token;
		this.fetchImpl = fetchImpl;
	}

	private fetch(path: string, init: RequestInit = {}) {
		return this.fetchImpl(new URL(path, this.base).toString(), {
			...init,
			headers: {
				...(init.headers as Record<string, string> | undefined),
				"Content-Type": "application/json",
				...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
			},
		});
	}

	/** null when the token is unknown or revoked; throws when the site can't be reached. */
	async me(): Promise<Me | null> {
		const res = await this.fetch("/api/helper/me");
		if (res.status === 401) return null;
		if (!res.ok) throw new Error(`Guildie answered ${res.status}`);
		return (await res.json()) as Me;
	}

	/** `session`: also get a one-time code to sign an app window in (the desktop app). */
	async startPairing(label: string, session = false): Promise<Pairing> {
		const res = await this.fetch("/api/helper/pair", { method: "POST", body: JSON.stringify({ label, session }) });
		if (!res.ok) throw new Error(`Guildie answered ${res.status}`);
		return (await res.json()) as Pairing;
	}

	async pollPairing(code: string, pollSecret: string): Promise<PairingResult> {
		const res = await this.fetch("/api/helper/pair/poll", {
			method: "POST",
			body: JSON.stringify({ code, pollSecret }),
		});
		if (!res.ok) throw new Error(`Guildie answered ${res.status}`);
		return (await res.json()) as PairingResult;
	}

	async upload(payload: string): Promise<{ ok: boolean; status: number; body: UploadResult }> {
		const res = await this.fetch("/api/helper/snapshot", { method: "POST", body: payload });
		return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as UploadResult };
	}

	/** The guild data the addon's tooltips use; null when the token is unknown or revoked. */
	async guildData(): Promise<GuildData | null> {
		const res = await this.fetch("/api/helper/guild-data");
		if (res.status === 401) return null;
		if (!res.ok) throw new Error(`Guildie answered ${res.status}`);
		return (await res.json()) as GuildData;
	}

	/**
	 * Notifications to show as system notifications, each handed out once
	 * (`link`: a path on the site). null when the token is unknown or revoked;
	 * an empty list from a site without notifications.
	 */
	async notifications(): Promise<{ id: string; text: string; link: string }[] | null> {
		const res = await this.fetch("/api/helper/notifications", { method: "POST" });
		if (res.status === 401) return null;
		if (res.status === 404) return [];
		if (!res.ok) throw new Error(`Guildie answered ${res.status}`);
		const body = (await res.json()) as { notifications?: unknown };
		if (!Array.isArray(body.notifications)) return [];
		return body.notifications.flatMap((n) => {
			const { id, text, link } = (n ?? {}) as Record<string, unknown>;
			// Only plain site paths: a notification never opens anywhere else.
			return typeof id === "string" && typeof text === "string" && typeof link === "string" && /^\/[^/\\]/.test(link)
				? [{ id, text: text.slice(0, 200), link }]
				: [];
		});
	}

	async signOut() {
		await this.fetch("/api/helper/signout", { method: "POST" }).catch(() => undefined);
	}
}
