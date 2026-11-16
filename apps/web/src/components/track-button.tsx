import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { ShoppingBasketAdd01Icon, ShoppingBasketDone01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Track a craft (tracking.ts): its reagents go on Inventory's Tracked crafts,
// with what you have against what you need, and on the reagents' tooltips in
// game ("You | need 6 more"). Once tracked, the button says so and links to
// Inventory; click it again (or Done on Inventory) to stop.

/** The viewer's tracked crafts, recipe id -> how many. Empty when signed out. */
export function useTracked() {
	const { data } = useQuery(convexQuery(api.tracking.ids, {}));
	return new Map((data ?? []).map((t) => [t.recipeId, t.quantity]));
}

/**
 * "Track mats", or "✓ Tracking" once tracked (click again to stop). How many
 * to make is set on Inventory's Tracked crafts, not here.
 */
export function TrackButton({
	recipeId,
	size = "sm",
	icon,
	className,
}: {
	recipeId: number;
	size?: "sm" | "xs";
	/** With a basket icon (checked once tracked), for crafting rows' action tray. */
	icon?: boolean;
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
	const on = tracked.has(recipeId);
	const toggle = () => {
		setError(undefined);
		if (on) void untrack({ recipeId });
		else
			track({ recipeId }).catch((e) =>
				setError(e instanceof ConvexError ? String(e.data) : "Couldn't track it. Try again."),
			);
	};
	if (icon) {
		return (
			<Button
				variant="outline"
				size={size}
				aria-pressed={on}
				title={error ?? (on ? "Tracking its mats: click to stop" : undefined)}
				className={cn(
					on
						? "border-highlight/45 bg-selected text-foreground hover:bg-selected"
						: "text-muted-foreground hover:text-foreground",
					className,
				)}
				onClick={toggle}
			>
				<HugeiconsIcon icon={on ? ShoppingBasketDone01Icon : ShoppingBasketAdd01Icon} size={16} strokeWidth={1.75} />
				{on ? "Tracking" : "Track mats"}
			</Button>
		);
	}
	return (
		<Button
			variant="outline"
			size={size}
			aria-pressed={on}
			className={cn("gap-1.5", on ? "text-foreground" : "text-muted-foreground", className)}
			title={
				error ??
				(on
					? "You're gathering mats for this: they're on Inventory → Tracked crafts and on their tooltips in game. Click to stop tracking."
					: "Gather mats for this: Inventory and the game's tooltips show what you have and what you still need")
			}
			onClick={() => {
				setError(undefined);
				if (on) void untrack({ recipeId });
				else
					track({ recipeId }).catch((e) =>
						setError(e instanceof ConvexError ? String(e.data) : "Couldn't track it. Try again."),
					);
			}}
		>
			{on ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.25} /> : null}
			{on ? "Tracking" : "Track mats"}
		</Button>
	);
}
