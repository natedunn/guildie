import type { VerdictKind } from "@convex/shared/upgrades";

// How a gear suggestion's verdict reads (shared/upgrades.ts judge): an
// upgrade (a clear gain by their stat weights), a possible
// upgrade (the player decides), or plain armor for an empty slot.

export function verdictLabel(kind: VerdictKind, at?: number) {
	if (kind === "upgrade") return "Upgrade";
	if (kind === "empty") return at ? `Empty slot, at lvl ${at}` : "Empty slot";
	return at ? `Possible upgrade, at lvl ${at}` : "Possible upgrade";
}

/** What each verdict means, for a tooltip. */
export const VERDICT_HINTS: Record<VerdictKind, string> = {
	upgrade: "A clear gain by their stat weights, what they give up counted",
	maybe:
		"A small gain, their second spec, a few levels from now, or an armor type they don't want",
	empty: "Plain armor with no stats, for a slot they have nothing in",
};
