import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Tabs that are routes (a guild's Roster / Crafting, a character's Gear /
// Talents / Professions). The active tab is the current route.

export function PageTabs({ children, className }: { children: ReactNode; className?: string }) {
	return <nav className={cn("flex gap-1 border-b border-border", className)}>{children}</nav>;
}

export function PageTab(props: LinkProps & { children: ReactNode }) {
	return (
		<Link
			{...props}
			activeOptions={{ exact: true, includeSearch: false }}
			className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm pointer-coarse:py-2.5 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-foreground data-[status=active]:text-foreground"
		/>
	);
}
