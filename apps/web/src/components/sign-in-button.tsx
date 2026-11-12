import { api } from "@convex/_generated/api";
import { useOauthSignIn } from "@convex-dev/auth/methods/oauth/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { markSignInPending, updateSignInPending } from "@/lib/claim";
import { desktop, useDesktopStatus, useInDesktopApp } from "@/lib/desktop";

// "Sign in with Battle.net" anywhere, starting the sign-in right away (the
// same as the button on /sign-in). Battle.net returns to /sign-in, which
// finishes it: the claim hop, then on to `next` or the player's guild
// (lib/claim.ts). In the desktop app, signing in happens in the player's own
// browser. A local backend without Battle.net links to /sign-in instead, for
// guest sign-in (docs/local-dev.md).

type Props = {
	/** Where to land once signed in (same-site path); default the player's guild. */
	next?: string;
	size?: "default" | "lg";
	className?: string;
	children?: ReactNode;
};

export function SignInButton(props: Props) {
	const inApp = useInDesktopApp();
	return inApp ? <DesktopSignInButton {...props} /> : <BattlenetSignInButton {...props} />;
}

function BattlenetSignInButton({ next, size = "lg", className, children = "Sign in with Battle.net" }: Props) {
	const { signIn } = useOauthSignIn({
		providerName: "battlenet",
		startSignIn: api.auth.startSignInWithBattlenet,
		completeSignIn: api.auth.completeSignInWithBattlenet,
	});
	const { data: options } = useQuery(convexQuery(api.users.signInOptions, {}));
	// A contributor's local backend has no Battle.net client (docs/local-dev.md).
	const battlenet = options?.battlenet ?? true;
	const [pending, setPending] = useState(false);
	const [startError, setStartError] = useState(false);

	if (!battlenet) {
		return (
			<Button size={size} className={className} render={<Link to="/sign-in" search={next ? { next } : {}} />}>
				Sign in
			</Button>
		);
	}

	return (
		<span className="inline-flex flex-col items-start">
			<Button
				size={size}
				className={className}
				disabled={pending}
				onClick={async () => {
					setPending(true);
					setStartError(false);
					markSignInPending(next);
					const back = new URL("/sign-in", window.location.origin);
					if (next) back.searchParams.set("next", next);
					const result = await signIn({ redirectTo: back.toString() });
					if (result.status === "error") {
						setPending(false);
						setStartError(true);
						updateSignInPending(null);
					}
				}}
			>
				{pending ? "Heading to Battle.net…" : children}
			</Button>
			{startError && <span className="mt-2 text-[0.8125rem] text-destructive">Sign-in didn't start. Try again.</span>}
		</span>
	);
}

/** The desktop app: sign in in the browser, and the app signs its window in when you approve it. */
function DesktopSignInButton({ size = "lg", className, children = "Sign in with Battle.net" }: Props) {
	const [pending, setPending] = useState(false);
	const pairingCode = useDesktopStatus()?.pairingCode;
	return (
		<span className="inline-flex flex-col items-start">
			<Button
				size={size}
				className={className}
				disabled={pending}
				onClick={async () => {
					setPending(true);
					await desktop()
						?.signIn?.()
						.catch(() => undefined);
					setPending(false);
				}}
			>
				{pending || pairingCode ? "Continue in your browser…" : children}
			</Button>
			{pairingCode ? (
				<span className="mt-3 text-[0.8125rem] text-muted-foreground">
					Your browser should show <span className="num font-mono tracking-[0.2em] text-foreground">{pairingCode}</span>
					. Click Connect there.
				</span>
			) : (
				<span className="mt-2 text-[0.8125rem] text-muted-foreground">
					Opens your web browser; the app signs in once you approve it there.
				</span>
			)}
		</span>
	);
}
