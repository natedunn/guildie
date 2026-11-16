import type { VerdictKind } from "@convex/shared/upgrades";
import { useId } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// How good a suggested item is, as a small lit square at the start of a row:
// an upgrade (green up arrow, the tooltips' stat green), a possible one (gold
// diagonal, the game's tooltip yellow), an empty slot (grey plus), or one the
// player removed (grey minus). Lit like the cards (app.css .verdict-marker);
// the hover says what it means.

export type MarkerKind = VerdictKind | "removed";

const PATHS: Record<MarkerKind, string> = {
	upgrade: "M8 13V3M3.5 7.5 8 3l4.5 4.5",
	maybe: "M5 11 11 5M6 5h5v5",
	empty: "M8 3.5v9M3.5 8h9",
	removed: "M3.5 8h9",
};

/** Top-to-bottom shading of the glyph: pale, the color, deeper. */
const STOPS: Record<MarkerKind, [string, string, string]> = {
	upgrade: ["#d6ffc9", "#3dff1f", "#14b800"],
	maybe: ["#fff3c2", "#ffd21a", "#c79a00"],
	empty: ["#f4eee6", "#c4bcb0", "#8f877b"],
	removed: ["#c4bcb0", "#998f82", "#6f675d"],
};

export const MARKER_LABELS: Record<MarkerKind, string> = {
	upgrade: "Upgrade",
	maybe: "Possible upgrade",
	empty: "Empty slot",
	removed: "Hidden",
};

/** The glyph alone (also for legends): `size` is the square's side in px. */
export function VerdictGlyph({ kind, size = 24, className }: { kind: MarkerKind; size?: number; className?: string }) {
	// useId's ids carry characters url(#...) can't take.
	const id = `vm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const [top, mid, bottom] = STOPS[kind];
	return (
		<span
			data-kind={kind}
			className={cn("verdict-marker", className)}
			style={{ width: size, height: size, borderRadius: Math.round(size / 4) }}
		>
			<svg
				viewBox="0 0 16 16"
				width={Math.round(size * 0.58)}
				height={Math.round(size * 0.58)}
				fill="none"
				stroke={`url(#${id})`}
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden
			>
				<defs>
					<linearGradient id={id} x1="0" y1="0" x2="0" y2="16" gradientUnits="userSpaceOnUse">
						<stop offset="0" stopColor={top} />
						<stop offset=".55" stopColor={mid} />
						<stop offset="1" stopColor={bottom} />
					</linearGradient>
				</defs>
				<path d={PATHS[kind]} />
			</svg>
		</span>
	);
}

/** The marker with its meaning on hover (`hint`: the sentence under the label). */
export function VerdictMarker({ kind, hint, className }: { kind: MarkerKind; hint: string; className?: string }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={<span role="img" aria-label={MARKER_LABELS[kind]} className={cn("inline-flex", className)} />}
			>
				<VerdictGlyph kind={kind} />
			</TooltipTrigger>
			<TooltipContent side="right" className="block max-w-72">
				<span className="flex items-center gap-2 font-medium">
					<VerdictGlyph kind={kind} size={20} />
					{MARKER_LABELS[kind]}
				</span>
				<span className="mt-1 block text-muted-foreground">{hint}</span>
			</TooltipContent>
		</Tooltip>
	);
}
