import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useAction, useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type Flow, flowFor, OnboardingCard, stepsOf, useStalled } from "@/components/onboarding";
import { Button } from "@/components/ui/button";
import { landingPath, startClaim, takeClaim } from "@/lib/claim";

type Search = { code?: string; state?: string; error?: string };

export const Route = createFileRoute("/claim/callback")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		code: typeof search.code === "string" ? search.code : undefined,
		state: typeof search.state === "string" ? search.state : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	head: () => ({ meta: [{ title: "Reading your characters · Guildie" }] }),
	// A step of the sign-in flow (components/onboarding.tsx): the same card as /sign-in.
	staticData: { shell: "onboarding" },
	component: ClaimCallback,
});

type Guild = { region: Region; slug: string; name: string };
type Found = { total: number; failedRegions: Region[]; found: Guild[] };
type Result =
	| { status: "reading" }
	/** Found a guild; waiting for its first roster sync before landing there. */
	| ({ status: "syncing"; guild: Guild; landing: string } & Found)
	| ({ status: "done"; guild?: Guild } & Found)
	/** Characters read, but none of them in a guild we know of. */
	| ({ status: "no-guild"; landing: string } & Found)
	| { status: "error"; message: string; signedOut?: boolean };

/** How long to wait for a new guild's first sync before going there anyway (it keeps syncing). */
const SYNC_WAIT_MS = 30_000;

function ClaimCallback() {
	const { code, state, error } = Route.useSearch();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const complete = useAction(api.claims.complete);
	const convex = useConvex();
	const router = useRouter();
	const started = useRef(false);
	const [next, setNext] = useState<string>();
	const [result, setResult] = useState<Result>({ status: "reading" });

	useEffect(() => {
		if (started.current || isLoading) return;
		started.current = true;
		const expected = takeClaim();
		setNext(expected.next);
		if (error) return setResult({ status: "error", message: "Battle.net didn't share your character list." });
		if (!isAuthenticated)
			return setResult({ status: "error", message: "You're signed out. Sign in again.", signedOut: true });
		if (!code || !state || state !== expected.state) {
			return setResult({ status: "error", message: "This didn't start in this browser. Try again here." });
		}
		complete({ code, state })
			.then(async (r) => {
				// Guilds just found (maybe not synced yet) plus those already known.
				const viewer = await convex.query(api.users.viewer, {});
				const guilds = [...r.guilds, ...(viewer?.guilds ?? [])];
				const found: Found = { total: r.total, failedRegions: r.failedRegions, found: r.guilds };
				const landing = landingPath(viewer, expected.next, guilds);
				const [guild] = guilds;
				// Connecting the desktop app: straight back to its Connect button.
				if (flowFor(expected.next) === "connect") {
					setResult({ status: "done", ...found });
					return void router.navigate({ href: landing, replace: true });
				}
				if (!guild) return setResult({ status: "no-guild", landing, ...found });
				setResult({
					status: "syncing",
					guild: { region: guild.region as Region, slug: guild.slug, name: guild.name },
					landing,
					...found,
				});
			})
			.catch((err) =>
				setResult({
					status: "error",
					message: err instanceof ConvexError ? String(err.data) : "Reading your characters failed. Try again.",
				}),
			);
	}, [code, state, error, isAuthenticated, isLoading, complete, convex, router]);

	const flow = flowFor(next);
	return result.status === "syncing" ? (
		<SyncingGuild result={result} />
	) : (
		<ClaimCard flow={flow} result={result} next={next} />
	);
}

/** Waits (briefly) for a new guild's first roster sync, so the guild page opens full. */
function SyncingGuild({ result }: { result: Extract<Result, { status: "syncing" }> }) {
	const router = useRouter();
	const { guild } = result;
	const sync = useQuery(api.guilds.syncStatus, { region: guild.region, slug: guild.slug });
	const timedOut = useStalled(true, SYNC_WAIT_MS);
	// Synced (or tried), hidden from us, or taking long: go anyway; the guild page shows its own sync state.
	const ready = sync === null || !!sync?.syncedAt || !!sync?.lastSyncError || timedOut;
	const left = useRef(false);
	useEffect(() => {
		if (!ready || left.current) return;
		left.current = true;
		void router.navigate({ href: result.landing, replace: true });
	}, [ready, router, result.landing]);
	return <ClaimCard flow="web" result={ready ? { ...result, status: "done" } : result} />;
}

function ClaimCard({ flow, result, next }: { flow: Flow; result: Result; next?: string }) {
	const start = useMutation(api.claims.start);
	const [retrying, setRetrying] = useState(false);
	const [retryError, setRetryError] = useState<string>();
	const retry = async () => {
		setRetrying(true);
		setRetryError(undefined);
		try {
			await startClaim(start, next);
		} catch (err) {
			setRetrying(false);
			setRetryError(err instanceof ConvexError ? String(err.data) : "Couldn't start. Try again.");
		}
	};
	const continueTo = next ?? "/";

	const characters = "total" in result ? countCharacters(result.total, result.failedRegions) : undefined;
	const guildName = "guild" in result ? result.guild?.name : undefined;
	const last = flow === "connect" ? 2 : 3;
	const signedOut = result.status === "error" && !!result.signedOut;
	const at = signedOut
		? 0
		: result.status === "reading" || result.status === "error"
			? 1
			: result.status === "no-guild"
				? 2
				: // Connecting the app: done here means on to its Connect step (/helper/connect).
					result.status === "syncing" || flow === "connect"
					? last
					: last + 1;
	const steps = stepsOf(flow, at, {
		error: result.status === "error" || result.status === "no-guild",
		details: {
			0: signedOut ? undefined : "Signed in",
			1: characters,
			2: flow === "web" ? guildName : undefined,
			3: result.status === "syncing" ? "Reading the roster…" : undefined,
		},
	});

	const title: ReactNode =
		result.status === "error"
			? "Couldn't read your characters"
			: result.status === "no-guild"
				? result.total === 0
					? "No characters yet"
					: "No guild found"
				: result.status === "done"
					? flow === "connect"
						? "Signed in"
						: `You're in ${guildName ?? "Guildie"}`
					: "Setting things up";

	return (
		<OnboardingCard
			title={title}
			description={
				result.status === "reading"
					? "Reading your character list from Battle.net and looking up your guild. This takes a few seconds."
					: result.status === "syncing"
						? `Getting ${result.guild.name}'s roster for the first time.`
						: result.status === "done"
							? "Taking you there…"
							: undefined
			}
			steps={steps}
		>
			{result.status === "error" && (
				<Outcome
					message={result.message}
					actions={
						result.signedOut ? (
							<Button size="lg" className="w-full" render={<Link to="/sign-in" search={next ? { next } : {}} />}>
								Sign in
							</Button>
						) : (
							<RetryActions retry={retry} retrying={retrying} continueTo={continueTo} />
						)
					}
					error={retryError}
				/>
			)}
			{result.status === "no-guild" && (
				<Outcome
					message={
						result.total === 0 ? (
							<>
								Battle.net doesn't list any WoW: Forever characters on your account yet. New characters can take a while
								to show up there.
							</>
						) : (
							<>
								None of your characters is in a guild Battle.net knows about yet. Characters show up once they're level
								10, and joining a guild can take a while to reach Battle.net. Check again later, or find your guild and
								add it from the home page.
							</>
						)
					}
					actions={<RetryActions retry={retry} retrying={retrying} continueTo={result.landing} again="Check again" />}
					error={retryError}
				/>
			)}
		</OnboardingCard>
	);
}

function Outcome({ message, actions, error }: { message: ReactNode; actions: ReactNode; error?: string }) {
	return (
		<>
			<p className="mb-4 text-[0.8125rem] text-muted-foreground">{message}</p>
			{actions}
			{error && <p className="mt-3 text-[0.8125rem] text-destructive">{error}</p>}
		</>
	);
}

function RetryActions({
	retry,
	retrying,
	continueTo,
	again = "Try again",
}: {
	retry: () => void;
	retrying: boolean;
	continueTo: string;
	again?: string;
}) {
	const router = useRouter();
	return (
		<div className="flex gap-2">
			<Button size="lg" className="flex-1" disabled={retrying} onClick={retry}>
				{retrying ? "Heading to Battle.net…" : again}
			</Button>
			<Button
				size="lg"
				variant="outline"
				className="flex-1"
				onClick={() => void router.navigate({ href: continueTo, replace: true })}
			>
				Continue
			</Button>
		</div>
	);
}

function countCharacters(total: number, failedRegions: Region[]) {
	const found = `Found ${total} character${total === 1 ? "" : "s"}`;
	return failedRegions.length
		? `${found} (${failedRegions.map((r) => r.toUpperCase()).join(", ")} didn't answer)`
		: found;
}
