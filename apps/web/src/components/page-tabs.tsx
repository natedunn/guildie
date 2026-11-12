import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Tabs that are routes (a guild's Roster / Crafting, a character's Gear /
// Talents / Professions): the active tab is the current route. PageTabButton
// looks the same for views within one page (Crafting's).

export function PageTabs({ children, className }: { children: ReactNode; className?: string }) {
	return <nav className={cn("flex gap-1 border-b border-border", className)}>{children}</nav>;
}

const TAB =
	"-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm pointer-coarse:py-2.5 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-highlight/85 data-[status=active]:text-foreground";

export function PageTab(props: LinkProps & { children: ReactNode }) {
	return <Link {...props} activeOptions={{ exact: true, includeSearch: false }} className={TAB} />;
}

/**
 * A tab that switches a view within one page (a search param, like
 * Crafting's ?view=), looking like PageTab. `count`: a number after the label.
 */
export function PageTabButton({
	active,
	onClick,
	count,
	children,
}: {
	active: boolean;
	onClick: () => void;
	count?: number;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-current={active ? "page" : undefined}
			data-status={active ? "active" : undefined}
			onClick={onClick}
			className={TAB}
		>
			{children}
			{count !== undefined && <span className="num ml-1.5 text-xs text-muted-foreground">{count}</span>}
		</button>
	);
}
