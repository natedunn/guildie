import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A search field: the Input with a magnifier at the start (like the ⌘K
 * search) and the text indented past it. `className` styles the input
 * (height, text size); `wrapperClassName` places it (width, flex, order).
 * `large` for 40px fields.
 */
export function SearchInput({
	className,
	wrapperClassName,
	large,
	type = "search",
	...props
}: React.ComponentProps<"input"> & { wrapperClassName?: string; large?: boolean }) {
	return (
		<div className={cn("relative min-w-0", wrapperClassName)}>
			<HugeiconsIcon
				icon={Search01Icon}
				size={large ? 17 : 14}
				strokeWidth={1.75}
				aria-hidden
				className={cn(
					"pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
					large ? "left-3" : "left-2.5",
				)}
			/>
			<Input type={type} className={cn(large ? "pl-9.5" : "pl-8", className)} {...props} />
		</div>
	);
}
