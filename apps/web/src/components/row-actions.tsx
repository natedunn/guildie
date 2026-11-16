import type { ReactNode } from "react";
import { TrackButton } from "@/components/track-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A Crafting row's actions, in their own column: Request, Track mats and
 * Remove, stacked full width on a wide pane; one row of equal buttons under
 * the row's content on a narrow one. All bordered, so they sit as one group.
 */
export function RowActions({
	request,
	recipeId,
	track,
	onRemove,
	className,
}: {
	request: ReactNode;
	recipeId: number;
	track: boolean;
	onRemove?: () => void;
	className?: string;
}) {
	if (!request && !track && !onRemove) return <div className={className} />;
	return (
		<div className={cn("flex items-start gap-2 *:flex-1 @2xl:flex-col @2xl:items-stretch @2xl:*:flex-none", className)}>
			{request}
			{track ? <TrackButton recipeId={recipeId} /> : null}
			{onRemove ? (
				<Button
					variant="outline"
					size="sm"
					className="text-muted-foreground"
					title="Never suggest this for your character again, here or in the game's tooltips"
					onClick={onRemove}
				>
					Remove
				</Button>
			) : null}
		</div>
	);
}
