import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { BATTLENET_AUTHORIZE } from "./authBattlenet";
import { routingPrefix } from "./authGateway";
import { exchangeToken } from "./blizzard";
import { fetchAccountCharacters } from "./claimRegions";
import { setOwner } from "./guilds";
import { allowedRedirectOrigins } from "./origins";
import { moveLegacy } from "./preferences";
import { vRegion } from "./schema";
import { FLAVORS, REGIONS, type Region } from "./shared/wow";
import { discoverGuilds } from "./sync";
import { requireUserId } from "./users";

// Claiming characters: a second Battle.net authorization with the wow.profile
// scope, run right after every sign-in (and from "Refresh my characters").
// Sign-in already granted wow.profile, so Battle.net approves it without
// asking. We read the account's character list in every region, keep the
// names, and drop the Blizzard token. Convex Auth doesn't hand us the
// sign-in's access token, which is why this is its own hop.
//
// Battle.net redirects to <CONVEX_SITE_URL>/oauth/claim/callback, or to the
// gateway's /oauth/claim/callback when sign-in goes through the gateway
// (AUTH_BATTLENET_CALLBACK_URL set; docs/auth-environments.md). That endpoint (convex/http.ts) bounces the
// browser to the app, and the app completes the claim. Completing requires
// the same browser (state in sessionStorage) and being signed in as the
// person who started, so a claim link can't attach someone else's characters
// to your account.

const REQUEST_TTL_MS = 10 * 60_000;

function randomToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export async function sha256(value: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Where Battle.net sends the browser. Behind the gateway it's the gateway's
 * claim callback, next to its sign-in one; otherwise ours.
 */
function claimCallbackUrl() {
	const site = process.env.CONVEX_SITE_URL;
	if (!site) throw new Error("CONVEX_SITE_URL is not set");
	const signIn = process.env.AUTH_BATTLENET_CALLBACK_URL;
	if (!signIn) return `${site}/oauth/claim/callback`;
	const claim = signIn.replace(/\/oauth\/battlenet\/callback$/, "/oauth/claim/callback");
	if (claim === signIn) throw new Error("AUTH_BATTLENET_CALLBACK_URL must end in /oauth/battlenet/callback");
	return claim;
}

export const start = mutation({
	args: { origin: v.string() },
	handler: async (ctx, { origin }) => {
		const userId = await requireUserId(ctx);
		const clientId = process.env.AUTH_BATTLENET_CLIENT_ID;
		if (!clientId || clientId === "unset") throw new ConvexError("Battle.net isn't configured on this deployment");
		if (!allowedRedirectOrigins.includes(origin)) throw new ConvexError("Unknown origin");
		// Drop this user's abandoned requests.
		const stale = await ctx.db
			.query("claimRequests")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const row of stale) if (row.expiresAt < Date.now()) await ctx.db.delete(row._id);
		const state = randomToken();
		const callbackUrl = claimCallbackUrl();
		await ctx.db.insert("claimRequests", {
			userId,
			stateHash: await sha256(state),
			origin,
			callbackUrl,
			expiresAt: Date.now() + REQUEST_TTL_MS,
		});
		// Behind the gateway, the deployment signs its address into the state
		// Battle.net echoes back (convex/authGateway.ts).
		const secret = process.env.AUTH_GATEWAY_SECRET;
		const site = process.env.CONVEX_SITE_URL!;
		const sentState = secret ? `${await routingPrefix(secret, "claim", site)}${state}` : state;
		const url = new URL(BATTLENET_AUTHORIZE);
		url.searchParams.set("client_id", clientId);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("scope", "wow.profile");
		url.searchParams.set("state", sentState);
		url.searchParams.set("redirect_uri", callbackUrl);
		return { url: url.toString(), state };
	},
});

/** The app origin a pending request returns to (convex/http.ts). */
export const originFor = internalQuery({
	args: { stateHash: v.string() },
	handler: async (ctx, { stateHash }) => {
		const request = await ctx.db
			.query("claimRequests")
			.withIndex("by_stateHash", (q) => q.eq("stateHash", stateHash))
			.unique();
		return request && request.expiresAt > Date.now() ? request.origin : null;
	},
});

/** Claims the pending request for the signed-in user. One use. */
export const consume = internalMutation({
	args: { stateHash: v.string() },
	handler: async (ctx, { stateHash }) => {
		const userId = await getAuthUserId(ctx);
		const request = await ctx.db
			.query("claimRequests")
			.withIndex("by_stateHash", (q) => q.eq("stateHash", stateHash))
			.unique();
		if (!request) return null;
		await ctx.db.delete(request._id);
		if (request.userId !== userId || request.expiresAt < Date.now()) return null;
		return { userId: request.userId, callbackUrl: request.callbackUrl };
	},
});

const vOwned = v.object({
	slug: v.string(),
	blizzardId: v.optional(v.number()),
	name: v.string(),
	level: v.optional(v.number()),
	classId: v.optional(v.number()),
});

/**
 * Make the account's claims in each region that answered match the list:
 * Battle.net is the truth there. Regions that failed aren't passed, so their
 * claims stay. A claim the player already has is updated in place, and the
 * player's preferences for a character (characterPreferences) are never
 * touched here: they outlive the claim, so a re-claim finds them again.
 */
export const save = internalMutation({
	args: { userId: v.id("users"), regions: v.array(v.object({ region: vRegion, characters: v.array(vOwned) })) },
	handler: async (ctx, { userId, regions }) => {
		const existing = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const answered = new Set(regions.map((r) => r.region));
		const kept = new Set<Id<"ownedCharacters">>();
		const now = Date.now();
		let inGuilds = 0;
		for (const { region, characters } of regions) {
			for (const c of characters) {
				const previous = await ctx.db
					.query("ownedCharacters")
					.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", c.slug))
					.collect();
				const own = previous.find((row) => row.userId === userId && !kept.has(row._id));
				// A character can only be claimed by one person at a time: the latest proof wins.
				for (const row of previous) {
					if (row === own || kept.has(row._id)) continue;
					await moveLegacy(ctx, row);
					await ctx.db.delete(row._id);
				}
				const fields = {
					name: c.name,
					blizzardId: c.blizzardId,
					level: c.level,
					classId: c.classId,
					claimedAt: now,
				};
				if (own) {
					await ctx.db.patch(own._id, fields);
					kept.add(own._id);
				} else {
					kept.add(await ctx.db.insert("ownedCharacters", { ...c, userId, flavor: "forever", region, claimedAt: now }));
				}
				const rows = await ctx.db
					.query("characters")
					.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", c.slug))
					.collect();
				const member = rows.find((r) => r.inRoster);
				if (!member) continue;
				inGuilds++;
				// The guild master's player owns the guild.
				if (member.rank === 0) await setOwner(ctx, member.guildId, userId);
			}
		}
		// Characters no longer on the account (in a region that answered).
		for (const row of existing) {
			if (!answered.has(row.region) || kept.has(row._id)) continue;
			await moveLegacy(ctx, row);
			await ctx.db.delete(row._id);
		}
		return inGuilds;
	},
});

export const complete = action({
	args: { code: v.string(), state: v.string() },
	handler: async (
		ctx,
		{ code, state },
	): Promise<{
		total: number;
		inGuilds: number;
		failedRegions: Region[];
		guilds: { region: Region; slug: string; name: string }[];
	}> => {
		const request = await ctx.runMutation(internal.claims.consume, { stateHash: await sha256(state) });
		if (!request) throw new ConvexError("This claim link expired or isn't yours. Start again.");
		const { access_token } = await exchangeToken(
			new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: request.callbackUrl }),
		);
		// One user token works against every regional host.
		const results = await fetchAccountCharacters({
			token: access_token,
			regions: REGIONS,
			namespace: (region) => FLAVORS.forever.namespace("profile", region),
		});
		const answered = results.flatMap((r) =>
			r.status === "ok"
				? [{ region: r.region, characters: r.characters }]
				: r.status === "none"
					? [{ region: r.region, characters: [] }]
					: [],
		);
		const failedRegions = results.flatMap((r) => (r.status === "error" ? [r.region] : []));
		for (const r of results) if (r.status === "error") console.warn(`claim: ${r.region} failed: ${r.error}`);
		if (answered.length === 0) throw new ConvexError("Battle.net didn't answer. Try again in a minute.");
		const userId = request.userId as Id<"users">;
		const inGuilds: number = await ctx.runMutation(internal.claims.save, { userId, regions: answered });
		// The claim is saved; finding guilds is a bonus that mustn't fail it.
		const guilds = await discoverGuilds(
			ctx,
			answered.flatMap(({ region, characters }) => characters.map((c) => ({ region, slug: c.slug, level: c.level }))),
		).catch((error) => {
			console.warn(`claim: guild discovery failed: ${String(error)}`);
			return [];
		});
		return {
			total: answered.reduce((n, r) => n + r.characters.length, 0),
			inGuilds,
			failedRegions,
			guilds,
		};
	},
});
