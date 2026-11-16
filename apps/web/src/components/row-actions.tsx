import { MailSend01Icon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { TrackButton } from "@/components/track-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Icon buttons in a crafting row's tray: square, muted until hovered. */
export const ICON_BUTTON = "size-8 px-0 text-muted-foreground hover:text-foreground";

/** Request, as the tray shows it (CraftRequest's `icon`). */
export const REQUEST_ICON = <HugeiconsIcon icon={MailSend01Icon} size={16} strokeWidth={1.75} />;

/**
 * A Crafting row's actions, as icons on a tray (app.css .action-tray), each
 * with a tooltip: Request (ask a guildmate to craft it), Track mats (gather
 * its reagents: Inventory and the game's tooltips) and Hide (never suggest
 * it for your character again). `request` is a CraftRequest with
 * REQUEST_ICON.
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
			<div className="action-tray inline-flex items-center gap-1 p-1 *:data-[slot=button]:size-8 *:data-[slot=button]:px-0">
				{request}
				{track ? <TrackButton recipeId={recipeId} icon /> : null}
				{onHide ? (
					<Tooltip>
						<TooltipTrigger
							render={<Button variant="ghost" size="sm" className={ICON_BUTTON} aria-label="Hide" onClick={onHide} />}
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
