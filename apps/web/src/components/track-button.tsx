import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Track a craft (tracking.ts): its reagents go on Inventory's Tracked crafts,
// with what you have against what you need, and on the reagents' tooltips in
// game ("You | need 6 more"). Once tracked, the button says so and links to
// Inventory; untrack there or with the ×.

/** The viewer's tracked crafts, recipe id -> how many. Empty when signed out. */
export function useTracked() {
	const { data } = useQuery(convexQuery(api.tracking.ids, {}));
	return new Map((data ?? []).map((t) => [t.recipeId, t.quantity]));
}

export function TrackButton({
	recipeId,
	size = "sm",
	className,
}: {
	recipeId: number;
	size?: "sm" | "xs";
	className?: string;
}) {
	const tracked = useTracked();
	const track = useMutation(api.tracking.track).withOptimisticUpdate((store, { recipeId: id, quantity }) => {
		const current = store.getQuery(api.tracking.ids, {});
		if (current && !current.some((t) => t.recipeId === id))
			store.setQuery(api.tracking.ids, {}, [...current, { recipeId: id, quantity: quantity ?? 1 }]);
	});
	const untrack = useMutation(api.tracking.untrack).withOptimisticUpdate((store, { recipeId: id }) => {
		const current = store.getQuery(api.tracking.ids, {});
		if (current)
			store.setQuery(
				api.tracking.ids,
				{},
				current.filter((t) => t.recipeId !== id),
			);
	});
	const [error, setError] = useState<string>();
	const quantity = tracked.get(recipeId);
	if (quantity !== undefined) {
		return (
			<span className={cn("inline-flex flex-none items-center", className)}>
				<Link
					to="/inventory"
					className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground"
					title="Its reagents are on Inventory, and on their tooltips in game"
				>
					<HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2.25} />
					Tracked{quantity > 1 ? <span className="num"> ×{quantity}</span> : null}
				</Link>
				<button
					type="button"
					onClick={() => void untrack({ recipeId })}
					className="h-7 rounded-md px-1.5 text-xs text-muted-foreground hover:text-foreground"
					aria-label="Untrack"
					title="Untrack"
				>
					×
				</button>
			</span>
		);
	}
	return (
		<Button
			variant="ghost"
			size={size}
			className={cn("flex-none text-muted-foreground", className)}
			title={error ?? "Track its reagents: what you have and what you still need, here and on tooltips in game"}
			onClick={() => {
				setError(undefined);
				track({ recipeId }).catch((e) =>
					setError(e instanceof ConvexError ? String(e.data) : "Couldn't track it. Try again."),
				);
			}}
		>
			Track
		</Button>
	);
}
