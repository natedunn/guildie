import { api } from "@convex/_generated/api";
import { AUTH_JWT_COOKIE, type CookieStore, ServerAuthSession, setupConvexAuthServer } from "@convex-dev/auth/ssr";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { ConvexHttpClient } from "convex/browser";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
const cookieOptions = { secure: import.meta.env.PROD };

export const authServer = setupConvexAuthServer({
	convexUrl,
	refreshSession: api.auth.refreshSession,
	signOut: api.auth.signOut,
	// Allowlist: every function that mints a session, and nothing else.
	signIn: [api.auth.completeSignInWithBattlenet, api.auth.signInWithDesktopCode, api.auth.signInAsGuest],
	cookieOptions,
	// The CSRF check also needs the app's public origin when a proxy rewrites Host.
	allowedOrigins: [import.meta.env.VITE_SITE_URL as string].filter(Boolean),
});

const requestCookies: CookieStore = {
	get: (name) => getCookie(name),
	set: (name, value, options) => setCookie(name, value, options),
	delete: (name, options) => deleteCookie(name, options),
};

/** The current request's access token, refreshed (and cookies rotated) if near expiry. */
export async function readAuthToken(): Promise<string | null> {
	const session = new ServerAuthSession({
		refreshSession: (refreshToken) =>
			new ConvexHttpClient(convexUrl).mutation(api.auth.refreshSession, { refreshToken }),
		cookies: requestCookies,
		cookieOptions,
	});
	try {
		// A token from before Convex Auth 2.0 (a different audience) still
		// looks unexpired for up to its 10 minutes, but Convex rejects it, which
		// would break the server render. Refresh instead: its refresh token is
		// gone too, so that clears the cookies and the page renders signed out.
		const token = getCookie(AUTH_JWT_COOKIE);
		if (token && !isCurrentToken(token)) {
			const result = await session.refresh();
			return result.kind === "rotated" ? result.tokens.accessToken : null;
		}
		return await session.getToken();
	} catch (error) {
		// Thrown when a refresh fails outright (convex-auth#729).
		console.error("convex-auth-start: token refresh failed", error);
		return null;
	}
}

/** Whether a JWT has the audience Convex Auth 2.0 issues. Unverified: Convex checks the signature. */
function isCurrentToken(token: string) {
	try {
		const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
		const aud = payload.aud;
		return aud === "convex-auth" || (Array.isArray(aud) && aud.includes("convex-auth"));
	} catch {
		return false;
	}
}
