import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A small hero inside the content pane, for pages that are a single message
 * (404, an error, no guild yet): a pill, a faded title, a line, and actions,
 * centered over a faint map and glow (stronger than the pane's own backdrop).
 */
export function PaneHero({
	pill,
	title,
	description,
	children,
}: {
	pill?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="relative isolate flex flex-col items-center px-2 pt-[max(2.5rem,10vh)] pb-12 text-center">
			<div
				aria-hidden
				className="map-backdrop pointer-events-none absolute inset-x-0 -top-6 -z-10 h-[34rem] [--map-opacity:0.1] [--map-size:min(1100px,140%)] [--map-y:0px]"
			/>
			<div
				aria-hidden
				className="glow pointer-events-none absolute top-6 left-1/2 -z-10 h-56 w-[min(30rem,90%)] -translate-x-1/2 opacity-30"
			/>
			{pill && <span className="pill">{pill}</span>}
			<h1 className="heading-display text-fade mt-4 text-3xl sm:text-4xl">{title}</h1>
			{description && <div className="mt-3 max-w-md text-sm text-muted-foreground">{description}</div>}
			{children}
		</div>
	);
}

export function NotFoundPage() {
	return (
		<PaneHero pill="404" title="Nothing here" description="That page doesn't exist, or it moved.">
			<Button size="lg" className="mt-6" render={<Link to="/" />}>
				Back to Guildie
			</Button>
		</PaneHero>
	);
}

export function ErrorPage({ error }: ErrorComponentProps) {
	return (
		<PaneHero pill="Error" title="Something broke" description="Guildie hit a problem loading this page.">
			<p className="mt-4 max-w-md rounded-md border border-border bg-well px-3 py-2 text-left font-mono text-xs break-words text-muted-foreground">
				{error instanceof Error ? error.message : String(error)}
			</p>
			<div className="mt-6 flex gap-2">
				<Button size="lg" onClick={() => window.location.reload()}>
					Try again
				</Button>
				<Button size="lg" variant="outline" render={<Link to="/" />}>
					Back to Guildie
				</Button>
			</div>
		</PaneHero>
	);
}
