import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Every content page starts the same way: a title (weight, not size; tight,
// fading to grey like the landing's headings), an optional line under it, and
// actions on the right. The pane draws the faint map and glow behind it
// (.pane-backdrop, routes/__root.tsx).

export function PageHeader({
	title,
	description,
	actions,
	className,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
	/** Under the title row (tabs, filters). */
	children?: ReactNode;
}) {
	return (
		<div className={cn("pt-6 pb-4", className)}>
			<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
				<div className="min-w-0">
					<h1 className="heading-display text-fade truncate text-xl leading-tight tracking-[-0.025em]">{title}</h1>
					{description && <div className="mt-1 text-[0.8125rem] text-muted-foreground">{description}</div>}
				</div>
				{actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
			</div>
			{children}
		</div>
	);
}

/** A page's body. Reading pages set a width; tables fill the pane. */
export function Page({
	width,
	className,
	children,
}: {
	width?: "narrow" | "medium";
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("pb-12", width === "narrow" && "max-w-xl", width === "medium" && "max-w-3xl", className)}>
			{children}
		</div>
	);
}

/** A section heading inside a page. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
	return <h2 className={cn("text-sm font-semibold", className)}>{children}</h2>;
}
