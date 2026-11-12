import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server";
import { setupOauth } from "@convex-dev/auth/methods/oauth/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import type { RegisteredMutation } from "convex/server";
import { type Infer, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";
import { type BattlenetProfile, type BattlenetUserInfo, battlenetCatalog } from "./authBattlenet";
import { viaGateway } from "./authGateway";
import { sha256 } from "./claims";
import { allowedRedirectOrigins } from "./origins";

const auth = setupConvexAuth({
	component: components.auth,
	// The default is 60s. Longer keeps SSR and the browser from refreshing
	// constantly; revocation takes effect when the token expires.
	accessTokenTtlSeconds: 10 * 60,
});

export const { signOut, refreshSession, isAuthenticated } = auth;

// Annotated: inferring the type from `internal.users` is circular.
type BattlenetSignIn = ReturnType<typeof setupOauth<"battlenet", BattlenetProfile, "users", BattlenetUserInfo>>;
const battlenet: BattlenetSignIn = setupOauth(
	auth,
	"battlenet",
	battlenetCatalog,
	{ createUser: internal.users.createFromBattlenet, onSignIn: internal.users.onBattlenetSignIn },
	{ component: components.authBattlenet, allowedRedirectOrigins },
);
export const startSignInWithBattlenet = viaGateway("battlenet", battlenet.startSignIn);
export const completeSignInWithBattlenet = battlenet.completeSignIn;

// The desktop app's window: after the player approves the app in their own
// browser (where any Battle.net login works, Google included), the app swaps a
// one-time code for a session here. The account is "the user who approved".
// bindMethod is Convex Auth's sign-in method builder, still internal in 2.0
// (docs/convex-auth.md).
const vTokens = v.object({
	accessToken: v.string(),
	refreshToken: v.string(),
	refreshTokenExpiresAt: v.number(),
	userId: v.string(),
});
const desktop = auth.bindMethod<"desktop", { userId: Id<"users"> }>({
	name: "desktop",
	createUser: internal.users.createFromDesktop,
});
type DesktopSignIn =
	| { status: "complete"; tokens: Infer<typeof vTokens> }
	| { status: "error"; userError: { error: "EXPIRED" } };
// Annotated: inferring it from `internal.users` is circular.
export const signInWithDesktopCode: RegisteredMutation<
	"public",
	{ code: string },
	Promise<DesktopSignIn>
> = desktop.authMutation({
	args: { code: v.string() },
	returns: v.union(
		v.object({ status: v.literal("complete"), tokens: vTokens }),
		v.object({ status: v.literal("error"), userError: v.object({ error: v.literal("EXPIRED") }) }),
	),
	handler: async (ctx, { code }) => {
		const codeHash = await sha256(code);
		// authMutation's ctx isn't typed with our schema.
		const db = ctx.db as unknown as DatabaseWriter;
		const row = await db
			.query("desktopSessionCodes")
			.withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
			.unique();
		if (row) await db.delete(row._id);
		if (!row || row.expiresAt < Date.now() || !(await db.get(row.userId))) {
			return { status: "error" as const, userError: { error: "EXPIRED" as const } };
		}
		// The code was issued to this user, so it signs in as them. The session
		// records the core as the component that authenticated it (there is no
		// desktop component).
		const tokens = await ctx.convexAuth.completeSignIn({
			userId: row.userId,
			profile: { userId: row.userId },
			authenticatedBy: components.auth,
		});
		return { status: "complete" as const, tokens };
	},
});

// Dev-only guest accounts so the app can be exercised without Blizzard keys.
// createFromGuest refuses anywhere but a local backend (origins.ts).
export const { signInAnonymously: signInAsGuest } = setupAnonymous(auth, {
	component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.users.createFromGuest });
