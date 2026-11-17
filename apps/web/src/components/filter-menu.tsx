import { Fragment, type ReactNode } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** One choice: its value ("" for the first, "all" choice), what it says, and how many it would show. */
export type FilterOption = {
	value: string;
	label: ReactNode;
	/** A second line under the label, in the menu only ("Bags 1 hr ago · No bank"). */
	detail?: ReactNode;
	count?: number;
	/** Under the one before (a character under "My characters"). */
	indent?: boolean;
	/** A line above it, starting a group. */
	separate?: boolean;
};

/**
 * A filter as a menu that looks like the page's selects: "For Anyone",
 * "Crafted by Ivar", "All professions". The label leads in grey; the menu
 * lists the choices with how many each would show. Names keep their
 * colors (a native select can't color its options).
 */
export function FilterMenu({
	label,
	value,
	options,
	onChange,
	className,
}: {
	/** Leads the button in grey ("For"); none for a menu whose choices say it all ("All professions"). */
	label?: string;
	value: string;
	options: FilterOption[];
	onChange: (value: string) => void;
	className?: string;
}) {
	const current = options.find((o) => o.value === value) ?? options[0];
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					"h-10 min-w-0 truncate whitespace-nowrap rounded-md border border-input bg-well bg-(image:--select-chevron) bg-size-[0.75rem] bg-position-[right_0.5rem_center] bg-no-repeat pr-7 pl-3 text-left text-sm",
					className,
				)}
			>
				{label ? <span className="text-muted-foreground">{label} </span> : null}
				{current?.label}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-(--anchor-width)">
				<DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(String(v))}>
					{options.map((o) => (
						<Fragment key={o.value}>
							{o.separate ? <DropdownMenuSeparator /> : null}
							<DropdownMenuRadioItem value={o.value}>
								{/* The count sits centered on the row, level with the check mark. */}
								<span className={cn("flex w-full items-center gap-4", o.indent && "pl-3")}>
									<span className="flex min-w-0 flex-col gap-0.5">
										<span className="truncate">{o.label}</span>
										{o.detail ? <span className="truncate text-xs text-muted-foreground">{o.detail}</span> : null}
									</span>
									{o.count !== undefined ? (
										<span className="num ml-auto text-xs text-muted-foreground">{o.count}</span>
									) : null}
								</span>
							</DropdownMenuRadioItem>
						</Fragment>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
