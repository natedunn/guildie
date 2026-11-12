import { AuthClient, JWT_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY, type TokenStorage } from "@convex-dev/auth/browser";
import { oauth } from "@convex-dev/auth/methods/oauth/react";
import { useRouter } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import { type ReactNode, useState } from "react";
import { AuthProvider, type AuthSignInApi, useAuth } from "#convex-auth-react-internal";

type AuthSessionResponse = { tokens: { accessToken: string } | null };

async function postAuth(route: string): Promise<AuthSessionResponse> {
	const res = await fetch(route, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "{}",
	});
	return (await res.json().catch(() => ({ tokens: null }))) as AuthSessionResponse;
}

const isSessionKey = (key: string) => key.startsWith(JWT_STORAGE_KEY) || key.startsWith(REFRESH_TOKEN_STORAGE_KEY);

/**
 * localStorage, except the session's tokens, which stay in this page's memory.
 * The httpOnly cookies are the session: each page gets its access token from
 * the server render or a refresh. With the token in localStorage (the
 * default), a page that started with no cookie session ran on a token left by
 * an earlier page and was signed out at its first refresh, and a page dying
 * mid-refresh (the sign-in page leaving for the claim hop) could sign other
 * pages out through the shared copy. The OAuth flow's own state (what
 * Battle.net's return needs) still goes to localStorage.
 */
function pageStorage(): TokenStorage {
	const memory = new Map<string, string>();
	let local: Storage | null = null;
	try {
		local = window.localStorage;
		// Earlier builds kept the access token there.
		for (const key of Object.keys(local)) if (isSessionKey(key)) local.removeItem(key);
	} catch {}
	return {
		getItem: (key) => (isSessionKey(key) ? (memory.get(key) ?? null) : (local?.getItem(key) ?? null)),
		setItem: (key, value) => {
			if (isSessionKey(key)) memory.set(key, value);
			else local?.setItem(key, value);
		},
		removeItem: (key) => {
			if (isSessionKey(key)) memory.delete(key);
			else local?.removeItem(key);
		},
	};
}

export function ConvexAuthStartProvider({
	client,
	initialToken,
	children,
}: {
	client: ConvexReactClient;
	/** The access token read during SSR, so the client hydrates authenticated. */
	initialToken: string | null;
	children: ReactNode;
}) {
	const router = useRouter();

	const [{ authClient, signInApi }] = useState(() => {
		// Sign-ins go through our /auth/signin proxy (ConvexHttpClient wire
		// format) so the refresh token lands in an httpOnly cookie.
		const proxy = new ConvexHttpClient("/auth/signin?path=", {
			skipConvexDeploymentUrlCheck: true,
			logger: client.logger,
		});
		let authClient: AuthClient;
		const withAuth = () => {
			const token = authClient.getAccessToken();
			if (token !== null) proxy.setAuth(token);
			else proxy.clearAuth();
			return proxy;
		};
		const signInApi: AuthSignInApi = {
			mutation: (fn, args) => withAuth().mutation(fn, args),
			action: (fn, args) => withAuth().action(fn, args),
		};
		authClient = new AuthClient({
			mode: "ssr",
			authApi: {
				refreshSession: async () => (await postAuth("/auth/refresh")).tokens as never,
				signOut: async () => {
					await postAuth("/auth/signout");
				},
			},
			storage: pageStorage(),
			storageNamespace: client.url,
			initialAccessToken: initialToken,
			ambientSignIns: {
				signIns: [oauth()],
				signInApi,
				convex: { mutation: (fn, args) => client.mutation(fn, args) },
				// Gets an absolute URL; the router's history takes a path.
				replaceUrl: (url) => {
					const { pathname, search, hash } = new URL(url, window.location.href);
					router.history.replace(pathname + search + hash);
				},
			},
		});
		return { authClient, signInApi };
	});

	return (
		<AuthProvider authClient={authClient} signInApi={signInApi}>
			<ConvexProviderWithAuth client={client} useAuth={useAuth}>
				{children}
			</ConvexProviderWithAuth>
		</AuthProvider>
	);
}
