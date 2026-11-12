import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { OnboardingCard, PairingCode, stepsOf } from "@/components/onboarding";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";

// The desktop app (or the older tray helper) opens this page with its code;
// the signed-in player approves it, and the app picks up its token by itself.
export const Route = createFileRoute("/helper/connect")({
	validateSearch: (search: Record<string, unknown>) => ({
		code: typeof search.code === "string" ? search.code.toUpperCase() : "",
	}),
	head: () => ({ meta: [{ title: "Connect the Guildie app · Guildie" }] }),
	// The browser's side of the app's sign-in (components/onboarding.tsx): signing
	// in from here keeps the same card through /sign-in and /claim/callback.
	staticData: { onboarding: true },
	component: Connect,
});

function Connect() {
	const { code } = Route.useSearch();
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	const { data: pairing } = useQuery(convexQuery(api.helper.pairing, { code }));
	const approve = useMutation(api.helper.approvePairing);
	const [error, setError] = useState<string | null>(null);

	const here = `/helper/connect?code=${encodeURIComponent(code)}`;
	if (!viewer) {
		return (
			<OnboardingCard
				title="Connect the Guildie app"
				description="The Guildie app wants to sign in. Sign in with Battle.net first; you'll come back here to connect it."
				steps={stepsOf("connect", null)}
			>
				<div className="[&>span]:flex">
					<SignInButton next={here} className="w-full">
						Continue with Battle.net
					</SignInButton>
				</div>
			</OnboardingCard>
		);
	}
	const signedIn = { 0: `Signed in as ${viewer.battletag ?? viewer.name}` };
	if (!pairing) {
		return <OnboardingCard title="Connect the Guildie app" steps={stepsOf("connect", 2, { details: signedIn })} />;
	}
	if (pairing.state === "unknown") {
		return (
			<OnboardingCard title="This code expired" steps={stepsOf("connect", 2, { error: true, details: signedIn })}>
				<p className="text-[0.8125rem] text-muted-foreground">
					It doesn't exist or is too old. Sign in from the Guildie app again; it opens a fresh page here.
				</p>
			</OnboardingCard>
		);
	}
	if (pairing.state === "approved") {
		return (
			<OnboardingCard title="Connected" steps={stepsOf("connect", 3, { details: signedIn })}>
				<p className="text-[0.8125rem] text-muted-foreground">
					You can close this tab; the Guildie app signs in by itself and takes it from here.
				</p>
			</OnboardingCard>
		);
	}
	return (
		<OnboardingCard
			title="Connect the Guildie app"
			description={
				<>
					<span className="text-foreground">{pairing.label}</span> wants to sign in and upload your addon data as{" "}
					{viewer.battletag ?? viewer.name}. Check this code matches the one the app shows.
				</>
			}
			steps={stepsOf("connect", 2, { details: signedIn })}
		>
			<PairingCode code={code} />
			<Button
				size="lg"
				className="mt-5 w-full"
				onClick={async () => {
					setError(null);
					try {
						await approve({ code });
					} catch (err) {
						setError(err instanceof ConvexError ? String(err.data) : "Couldn't connect. Try again.");
					}
				}}
			>
				Connect
			</Button>
			{error && <p className="mt-3 text-[0.8125rem] text-destructive">{error}</p>}
		</OnboardingCard>
	);
}
