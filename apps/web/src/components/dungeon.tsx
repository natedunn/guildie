import type { Readiness } from "@convex/shared/dungeons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Shared by the Dungeons cards and a dungeon's page.

export const READINESS_LABEL: Record<Readiness, string> = {
	completed: "Completed",
	ready: "Ready",
	partial: "Partly ready",
	under: "Under level",
};

/** A dungeon's loading-screen art (game art is the decoration); a plain panel if it doesn't load. */
export function DungeonArt({ src, className }: { src: string; className?: string }) {
	const [failed, setFailed] = useState(false);
	return (
		<div className={cn("overflow-hidden bg-muted/40", className)}>
			{!failed && (
				<img
					src={src}
					alt=""
					loading="lazy"
					draggable={false}
					onError={() => setFailed(true)}
					className="size-full object-cover"
				/>
			)}
		</div>
	);
}

export function MembersOnly() {
	return (
		<p className="pb-12 text-[0.8125rem] text-muted-foreground">
			Only the guild's members see who's ready for which dungeon.{" "}
			<Link to="/settings" className="text-foreground underline underline-offset-4">
				Claim your characters
			</Link>{" "}
			if you're one of them.
		</p>
	);
}
