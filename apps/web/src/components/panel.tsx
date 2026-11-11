import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A small titled box for a page's side facts (the character page's stats to
// look for, talents, what they can use): surface fill, hairline border.

export const PANEL = "rounded-md border border-border bg-surface p-3.5";

export function Panel({
	title,
	action,
	children,
	className,
}: {
	title: ReactNode;
	/** Beside the title, on the right: a small link or button. */
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn(PANEL, className)}>
			<div className="mb-2.5 flex items-baseline justify-between gap-3">
				<h2 className="text-sm font-semibold">{title}</h2>
				{action && <div className="text-xs text-muted-foreground">{action}</div>}
			</div>
			{children}
		</section>
	);
}

/** The muted text button panels use for their action ("Change", "All talents"). */
export const panelAction = "text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
