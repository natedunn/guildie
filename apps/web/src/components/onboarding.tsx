import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Signing in is one calm flow: a single card that stays put and steps through
// what's happening (signing in, reading your characters, finding and syncing
// your guild), even though the browser hops between routes on the way
// (Battle.net's redirects): /sign-in → /claim/callback → your guild. In the
// desktop app: /sign-in (in the window) → the browser's /helper/connect →
// /desktop/session (in the window). Each of those routes sets
// `staticData: { shell: "onboarding" }` (lib/shell.ts), so the root renders it
// on its own, without the sidebar (OnboardingShell), and draws this card in
// the same place.

/** The steps each flow shows, the same on every route it passes through. */
export const FLOWS = {
	/** Signing in on the web (and "Refresh my characters"). */
	web: ["Sign in with Battle.net", "Read your characters", "Find your guild", "Sync your guild"],
	/** The browser's side of signing the desktop app in (/helper/connect). */
	connect: ["Sign in with Battle.net", "Read your characters", "Connect the app"],
	/** The desktop app's window, while the player signs in in their browser. */
	app: ["Sign in in your browser", "Click Connect there", "Sign the app in"],
} as const;

export type Flow = keyof typeof FLOWS;

/** Signing in on the way to connecting the desktop app follows that flow's steps. */
export const flowFor = (next?: string): Flow => (next?.startsWith("/helper/connect") ? "connect" : "web");

export type StepState = "pending" | "active" | "done" | "error";
export type Step = { label: string; state: StepState; detail?: ReactNode };

/**
 * A flow's steps with everything before `at` done and `at` active (or failed).
 * `at` null: nothing started yet. `at` past the end: all done.
 */
export function stepsOf(
	flow: Flow,
	at: number | null,
	{ error, details }: { error?: boolean; details?: Partial<Record<number, ReactNode>> } = {},
): Step[] {
	return FLOWS[flow].map((label, i) => ({
		label,
		detail: details?.[i],
		state: at === null || i > at ? "pending" : i < at ? "done" : error ? "error" : "active",
	}));
}

/**
 * The page around the card: the whole window, the card near the top of the
 * middle, with the landing hero's faint world map and a glow behind it.
 */
export function OnboardingScreen({ children }: { children: ReactNode }) {
	return (
		<div className="relative isolate flex min-h-full flex-col items-center overflow-hidden px-4 pt-[max(2rem,14vh)] pb-12">
			<div
				aria-hidden
				className="map-backdrop pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] [--map-opacity:0.07] [--map-y:1rem]"
			/>
			<div className="mb-5 flex items-center gap-2 text-sm font-semibold">
				<img src="/favicon.svg" alt="" className="size-5" />
				Guildie
			</div>
			<div className="relative flex w-full flex-col items-center">
				<div
					aria-hidden
					className="glow pointer-events-none absolute -top-10 left-1/2 -z-10 h-72 w-[min(34rem,100%)] -translate-x-1/2 opacity-35"
				/>
				{children}
			</div>
		</div>
	);
}

/**
 * The sign-in card: a title, a line under it, the flow's steps with a
 * progress bar, and whatever the current step needs (a button, a code, an
 * error with a way out). Same width and place on every route, so moving
 * between them only changes what's inside.
 */
export function OnboardingCard({
	title,
	description,
	steps,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	steps: Step[];
	children?: ReactNode;
}) {
	const done = steps.filter((s) => s.state === "done").length;
	const busy = steps.some((s) => s.state === "active") ? 0.5 : 0;
	const progress = (done + busy) / steps.length;
	return (
		<OnboardingScreen>
			<section className="surface-card w-full max-w-[400px] overflow-hidden">
				<div
					role="progressbar"
					aria-label="Progress"
					aria-valuemin={0}
					aria-valuemax={steps.length}
					aria-valuenow={done}
					className="h-0.5 bg-border"
				>
					<div
						className="h-full bg-highlight/70 transition-[width] duration-500 ease-out"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
				<div className="p-6" aria-live="polite">
					<h1 className="heading-display text-fade text-base leading-snug tracking-[-0.015em]">{title}</h1>
					{description && <div className="mt-1 text-[0.8125rem] text-muted-foreground">{description}</div>}
					<ol className="mt-5 space-y-2.5">
						{steps.map((step) => (
							<StepRow key={step.label} step={step} />
						))}
					</ol>
					{children && <div className="mt-5 border-t border-border pt-5">{children}</div>}
				</div>
			</section>
		</OnboardingScreen>
	);
}

function StepRow({ step }: { step: Step }) {
	return (
		<li className="flex gap-3" aria-current={step.state === "active" ? "step" : undefined}>
			<span className="mt-0.5 grid size-4 flex-none place-items-center">
				{step.state === "done" ? (
					<HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
				) : step.state === "error" ? (
					<HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} className="text-destructive" />
				) : step.state === "active" ? (
					<span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
				) : (
					<span className="size-1.5 rounded-full bg-muted-foreground/40" />
				)}
			</span>
			<span className="min-w-0">
				<span
					className={cn(
						"block text-[0.8125rem]",
						step.state === "active" && "font-medium text-foreground",
						step.state === "done" && "text-muted-foreground",
						step.state === "pending" && "text-muted-foreground/60",
						step.state === "error" && "text-destructive",
					)}
				>
					{step.label}
				</span>
				{step.detail && <span className="block text-xs text-muted-foreground">{step.detail}</span>}
			</span>
		</li>
	);
}

/** The pairing code the desktop app and the browser both show, to check they match. */
export function PairingCode({ code }: { code: string }) {
	return (
		<p className="num inline-block rounded-md border border-border bg-muted px-4 py-2 font-mono text-2xl tracking-[0.25em]">
			{code}
		</p>
	);
}

/** True once `active` has stayed true for `ms` (a step that should have moved on by now). */
export function useStalled(active: boolean, ms: number) {
	const [stalled, setStalled] = useState(false);
	useEffect(() => {
		setStalled(false);
		if (!active) return;
		const timer = setTimeout(() => setStalled(true), ms);
		return () => clearTimeout(timer);
	}, [active, ms]);
	return stalled;
}
