import { ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { TrackButton } from "@/components/track-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A Crafting row's actions, together on a tray (app.css .action-tray):
 * Request and Track mats, stacked on a wide pane and side by side on a
 * narrow one, and Hide as an icon (never suggest it for your character
 * again).
 */
export function RowActions({
	request,
	recipeId,
	track,
	onHide,
	className,
}: {
	request: ReactNode;
	recipeId: number;
	track: boolean;
	onHide?: () => void;
	className?: string;
}) {
	if (!request && !track && !onHide) return <div className={className} />;
	return (
		<div className={className}>
			<div className="action-tray flex flex-wrap items-center gap-2 p-2">
				{request ? <div className="flex flex-1 *:flex-1 @2xl:basis-full">{request}</div> : null}
				{track ? <TrackButton recipeId={recipeId} className="flex-1" /> : null}
				{onHide ? (
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="ghost"
									size="sm"
									className="w-8 flex-none px-0 text-muted-foreground"
									aria-label="Hide"
									onClick={onHide}
								/>
							}
						>
							<HugeiconsIcon icon={ViewOffSlashIcon} size={16} strokeWidth={1.75} />
						</TooltipTrigger>
						<TooltipContent side="top">Hide</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		</div>
	);
}
