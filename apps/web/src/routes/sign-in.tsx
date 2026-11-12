import { api } from "@convex/_generated/api";
import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react";
import { useOauth, useOauthSignIn } from "@convex-dev/auth/methods/oauth/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { flowFor, OnboardingCard, PairingCode, stepsOf, useStalled } from "@/components/onboarding";
import { Button } from "@/components/ui/button";
import { isAuthReturn } from "@/lib/auth-return";
import { landingPath, markSignInPending, safeNext, signInPending, startClaim, updateSignInPending } from "@/lib/claim";
import { desktop, useDesktopStatus, useInDesktopApp } from "@/lib/desktop";
import type { RouterContext } from "./__root";

/** Fresh on the client (the cached viewer can predate the sign-in). */
const fetchViewer = (context: RouterContext) =>
	typeof window === "undefined"
		? context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}))
		: context.convex.query(api.users.viewer, {});

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>): { next?: string } => ({ next: safeNext(search.next) }),
	// Battle.net returns here (never guarded for signed-out visitors), the
	// browser finishes the sign-in, then SignIn runs the claim hop
	// (lib/claim.ts). Signed in otherwise: straight on to where they belong.
	beforeLoad: async ({ context, search }) => {
		if (context.token && !signInPending()) {
			throw redirect({ href: landingPath(await fetchViewer(context), search.next) });
		}
	},
	head: () => ({ meta: [{ title: "Sign in · Guildie" }] }),
	// The first card of the sign-in flow (components/onboarding.tsx).
	staticData: { shell: "onboarding" },
	component: SignIn,
});

function SignIn() {
	const inApp = useInDesktopApp();
	// In the desktop app, signing in happens in the player's own browser.
	return inApp ? <DesktopSignIn /> : <BattlenetSignIn />;
}

function BattlenetSignIn() {
	const { next } = Route.useSearch();
	const flow = flowFor(next);
	const { signIn } = useOauthSignIn({
		providerName: "battlenet",
		startSignIn: api.auth.startSignInWithBattlenet,
		completeSignIn: api.auth.completeSignInWithBattlenet,
	});
	const { flowError } = useOauth();
	const { data: options } = useQuery(convexQuery(api.users.signInOptions, {}));
	// A contributor's local backend has no Battle.net client (docs/local-dev.md).
	const battlenet = options?.battlenet ?? true;
	// Back from Battle.net (`?convexAuthCode=`): "signing in" from the first
	// paint, server render included. The auth client drops the code from the
	// address as it finishes, so remember it.
	const searchStr = useRouterState({ select: (s) => s.location.searchStr });
	const [returning] = useState(() => isAuthReturn(searchStr));
	const [starting, setStarting] = useState(false);
	const [startError, setStartError] = useState(false);
	// "Try again" after Battle.net's error hides it until the next attempt.
	const [retried, setRetried] = useState(false);
	const flowFailed = !!flowError && !retried;
	const finishing = useFinishSignIn(!!flowError);
	// Back with a code but signed in nowhere after a while: say so rather than spin.
	const stalled = useStalled(returning && finishing === "idle" && !flowFailed, 20_000);
	const failed = flowFailed || startError || stalled;
	const busy = !failed && (starting || returning || finishing !== "idle");

	const at = finishing === "claiming" ? 1 : busy || failed ? 0 : null;
	const steps = stepsOf(flow, at, {
		error: failed,
		details: {
			0: busy && at === 0 ? (starting && !returning ? "Heading to Battle.net…" : "Finishing up…") : undefined,
		},
	});

	const start = async () => {
		setStarting(true);
		setStartError(false);
		setRetried(true);
		markSignInPending(next);
		const back = new URL("/sign-in", window.location.origin);
		if (next) back.searchParams.set("next", next);
		const result = await signIn({ redirectTo: back.toString() });
		if (result.status === "error") {
			setStarting(false);
			setStartError(true);
			updateSignInPending(null);
		}
	};

	return (
		<OnboardingCard
			title={busy ? "Setting things up" : flow === "connect" ? "Sign in to connect the app" : "Sign in to Guildie"}
			description={
				busy
					? "This takes a few seconds. Battle.net may flash by once more."
					: "Use your Battle.net account. We learn your BattleTag and your character list, which is how we find your guild. We don't keep Battle.net's tokens."
			}
			steps={steps}
		>
			{!busy && (
				<>
					{failed && (
						<p className="mb-3 text-[0.8125rem] text-destructive">
							{flowFailed && flowError?.error === "ACCESS_DENIED"
								? "Sign-in was cancelled."
								: flowFailed && flowError?.error === "EXPIRED"
									? "That sign-in took too long. Try again."
									: startError
										? "Sign-in didn't start. Try again."
										: "Sign-in didn't finish. Try again."}
						</p>
					)}
					<Button size="lg" className="w-full" disabled={!battlenet} onClick={start}>
						{failed ? "Try again" : "Continue with Battle.net"}
					</Button>
					{!battlenet && (
						<p className="mt-3 text-[0.8125rem] text-muted-foreground">
							Battle.net sign-in isn't set up on this local backend. Sign in as a guest below; see docs/local-dev.md.
						</p>
					)}
					{options?.guest && <GuestSignIn />}
				</>
			)}
		</OnboardingCard>
	);
}

/**
 * Back from Battle.net and signed in: hop through the claim (Battle.net
 * approves it without asking) so characters and guild are set up, then land.
 * "claiming" while the browser heads off for that, "landing" when skipping it.
 */
function useFinishSignIn(failed: boolean) {
	const { isAuthenticated } = useConvexAuth();
	const start = useMutation(api.claims.start);
	const { convex } = Route.useRouteContext();
	const router = useRouter();
	const [phase, setPhase] = useState<"idle" | "claiming" | "landing">("idle");
	const started = useRef(false);
	useEffect(() => {
		const pending = signInPending();
		if (!pending) return;
		if (failed) return updateSignInPending(null);
		if (!isAuthenticated || started.current) return;
		started.current = true;
		const land = async () => {
			setPhase("landing");
			updateSignInPending(null);
			const viewer = await convex.query(api.users.viewer, {});
			await router.navigate({ href: landingPath(viewer, pending.next), replace: true });
		};
		// Already hopped once (e.g. Back from Battle.net): don't loop.
		if (pending.claimStarted) return void land();
		setPhase("claiming");
		updateSignInPending({ ...pending, claimStarted: true });
		// Can't claim (e.g. Battle.net isn't configured here): sign-in still worked.
		startClaim(start, pending.next).catch(land);
	}, [isAuthenticated, failed, start, convex, router]);
	return phase;
}

/** Local backends only; the backend refuses anywhere else. */
function GuestSignIn() {
	const { signIn } = useSignInAnonymously({ signInAnonymously: api.auth.signInAsGuest });
	const router = useRouter();
	return (
		<div className="mt-5 border-t border-border pt-4">
			<p className="text-[0.8125rem] text-muted-foreground">
				Local backend: guest accounts are on. With the sample data, a guest plays one of the Sample Guild's characters.
			</p>
			<Button
				variant="outline"
				className="mt-3 w-full"
				onClick={async () => {
					await signIn();
					await router.invalidate();
					await router.navigate({ to: "/" });
				}}
			>
				Sign in as a guest
			</Button>
		</div>
	);
}

/**
 * The desktop app: sign in in the browser, and the app signs its window in
 * when you approve it there (/helper/connect, then /desktop/session, which
 * carries on with the same card).
 */
function DesktopSignIn() {
	const [pending, setPending] = useState(false);
	// The code the app is waiting on, while it signs in through the browser (from the tray too).
	const pairingCode = useDesktopStatus()?.pairingCode;
	const waiting = pending || !!pairingCode;
	return (
		<OnboardingCard
			title={waiting ? "Continue in your browser" : "Sign in to Guildie"}
			description={
				waiting
					? "Sign in with Battle.net there, check the code matches, and click Connect. This window signs in by itself."
					: "You'll sign in with Battle.net in your web browser, where any of your usual logins work. Then click Connect there, and the app signs in by itself."
			}
			steps={stepsOf("app", pairingCode ? 1 : waiting ? 0 : null, {
				details: { 0: pending && !pairingCode ? "Opening your browser…" : undefined },
			})}
		>
			{pairingCode ? (
				<div>
					<p className="mb-3 text-[0.8125rem] text-muted-foreground">Your browser should show this code:</p>
					<PairingCode code={pairingCode} />
				</div>
			) : (
				<Button
					size="lg"
					className="w-full"
					disabled={pending}
					onClick={async () => {
						setPending(true);
						await desktop()
							?.signIn?.()
							.catch(() => undefined);
						setPending(false);
					}}
				>
					{pending ? "Opening your browser…" : "Sign in with your browser"}
				</Button>
			)}
		</OnboardingCard>
	);
}
