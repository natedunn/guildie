import type { ReactNode } from "react";

/** "+6 Agility", "-2.5 DPS": a signed stat change in an upgrade's why (shared/upgrades.ts explain). */
const CHANGE = /([+-]\d+(?:\.\d+)?) ([A-Z][A-Za-z ]*?)(?=,| over | \(|;|$)/g;

/**
 * An upgrade's why ("+6 Agility, -4 Stamina over Embossed Leather Gloves")
 * with gains in the game's comparison green and losses in its red.
 */
export function UpgradeWhy({ text }: { text?: string }) {
	if (!text) return null;
	const out: ReactNode[] = [];
	let last = 0;
	for (const m of text.matchAll(CHANGE)) {
		const at = m.index ?? 0;
		if (at > last) out.push(text.slice(last, at));
		out.push(
			<span key={at} className={m[1].startsWith("-") ? "stat-loss" : "stat-gain"}>
				<span className="num">{m[1]}</span> {m[2]}
			</span>,
		);
		last = at + m[0].length;
	}
	out.push(text.slice(last));
	return <>{out}</>;
}
