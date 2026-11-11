import type { VerdictKind } from "@convex/shared/upgrades";

// How a gear suggestion's verdict reads (shared/upgrades.ts judge): an
// upgrade (more of their priority stats, nothing lost), a trade-off (worth it
// by their weights, but it gives some of one up), or a maybe.

export function verdictLabel(kind: VerdictKind, at?: number) {
	if (kind === "upgrade") return "Upgrade";
	if (kind === "tradeoff") return "Trade-off";
	return at ? `Maybe, at ${at}` : "Maybe";
}

/** What each verdict means, for a tooltip. */
export const VERDICT_HINTS: Record<VerdictKind, string> = {
	upgrade: "More of their priority stats, nothing lost",
	tradeoff: "Gives up some of one priority stat for more of another; worth it at their stat priority's steepness",
	maybe: "A small gain, for their second spec, or for a few levels from now",
};
