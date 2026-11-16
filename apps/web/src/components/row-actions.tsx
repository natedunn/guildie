import { MailSend01Icon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { TrackButton } from "@/components/track-button";
import { Button } from "@/components/ui/button";

/** Request's icon (CraftRequest's `icon`), for the tray. */
export const REQUEST_ICON = <HugeiconsIcon icon={MailSend01Icon} size={16} strokeWidth={1.75} />;

/**
 * A Crafting row's actions on a tray (app.css .action-tray): Request (ask a
 * guildmate to craft it), Track mats (gather its reagents: Inventory and the
 * game's tooltips) and Hide (never suggest it for your character again),
 * each an icon and its name. Stacked full width on a wide pane; one row of
 * equal buttons on a narrow one. `request` is a CraftRequest with
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
			<div className="action-tray flex gap-1.5 p-1.5 *:flex-1 @2xl:flex-col @2xl:*:flex-none">
				{request}
				{track ? <TrackButton recipeId={recipeId} icon /> : null}
				{onHide ? (
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground hover:text-foreground"
						title="Never suggest this for your character again, here or in the game's tooltips"
						onClick={onHide}
					>
						<HugeiconsIcon icon={ViewOffSlashIcon} size={16} strokeWidth={1.75} />
						Hide
					</Button>
				) : null}
			</div>
		</div>
	);
}
