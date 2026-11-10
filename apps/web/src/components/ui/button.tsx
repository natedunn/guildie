import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Touch screens get taller buttons (pointer-coarse:), about 40px, so they're
// easy to hit; mice keep the compact sizes.
const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-[0.8125rem] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/88",
				outline: "border-input bg-transparent hover:bg-hover aria-expanded:bg-hover",
				secondary: "bg-secondary text-secondary-foreground hover:bg-selected aria-expanded:bg-selected",
				ghost:
					"text-muted-foreground hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground",
				destructive: "bg-destructive/12 text-destructive hover:bg-destructive/20",
				link: "text-foreground underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground",
			},
			size: {
				default:
					"h-8 gap-1.5 px-3 pointer-coarse:h-10 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				xs: "h-6 pointer-coarse:h-8 gap-1 rounded-sm px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
				sm: "h-7 pointer-coarse:h-9 gap-1 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				lg: "h-9 pointer-coarse:h-10 gap-1.5 px-4 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
				icon: "size-8 pointer-coarse:size-10 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-xs": "size-6 pointer-coarse:size-8 rounded-sm [&_svg:not([class*='size-'])]:size-2.5",
				"icon-sm": "size-7 pointer-coarse:size-9 [&_svg:not([class*='size-'])]:size-3",
				"icon-lg": "size-9 pointer-coarse:size-10 [&_svg:not([class*='size-'])]:size-4",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
