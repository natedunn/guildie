import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { useEffect, useRef, useState } from "react";
import { OnboardingCard, stepsOf } from "@/components/onboarding";
import { Button } from "@/components/ui/button";
import { landingPath } from "@/lib/claim";

// The desktop app opens this in its window with a one-time code, after the
// player approved the app in their own browser (/helper/connect). The code is
// swapped for a session through the same sign-in proxy as Battle.net's
// (session cookie, refresh token httpOnly), then on to where they belong.
export const Route = createFileRoute("/desktop/session")({
	validateSearch: (search: Record<string, unknown>) => ({
		code: typeof search.code === "string" ? search.code : "",
	}),
	head: () => ({ meta: [{ title: "Signing in · Guildie" }] }),
	// The last card of the app's sign-in flow (components/onboarding.tsx), after /sign-in's.
	staticData: { shell: "onboarding" },
	component: DesktopSession,
});

function DesktopSession() {
	const { code } = Route.useSearch();
	const { setSession } = useAuthActions();
	const router = useRouter();
	const started = useRef(false);
	const [failed, setFailed] = useState(false);
	const [done, setDone] = useState(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		// Don't leave the code in the address (or history).
		router.history.replace("/desktop/session");
		void (async () => {
			try {
				const proxy = new ConvexHttpClient("/auth/signin?path=", { skipConvexDeploymentUrlCheck: true });
				const result = await proxy.mutation(api.auth.signInWithDesktopCode, { code });
				if (result.status !== "complete") return setFailed(true);
				await setSession(result.tokens);
				setDone(true);
				await router.invalidate();
				const viewer = await router.options.context.queryClient.fetchQuery(convexQuery(api.users.viewer, {}));
				await router.navigate({ href: landingPath(viewer), replace: true });
			} catch {
				setFailed(true);
			}
		})();
	}, [code, router, setSession]);

	return (
		<OnboardingCard
			title={failed ? "Couldn't sign the app in" : done ? "Signed in" : "Signing the app in"}
			description={failed ? undefined : done ? "Opening your guild…" : "One moment…"}
			steps={stepsOf("app", done ? 3 : 2, { error: failed, details: { 1: "Connected in your browser" } })}
		>
			{failed && (
				<>
					<p className="mb-4 text-[0.8125rem] text-muted-foreground">
						That sign-in link expired or was already used. Start again; it takes a moment.
					</p>
					<Button size="lg" className="w-full" render={<Link to="/sign-in" />}>
						Sign in again
					</Button>
				</>
			)}
		</OnboardingCard>
	);
}
