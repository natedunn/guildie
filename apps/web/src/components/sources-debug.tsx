import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { ago } from "@/lib/format";

// Maintainers only (the query returns null for everyone else): per section,
// what the game and Blizzard each have, which one the page shows and why.
// The rules: convex/profile.ts.

const REASONS = {
	none: "neither source has it",
	only: "the only source",
	newer: "the newer source",
	"other-empty": "the newer source is empty, this one isn't",
	"both-empty": "both empty, the newer one",
} as const;

const when = (at?: number) => (at ? (ago(at) ?? "just now") : "unknown");

export function SourcesDebug({ region, slug }: { region: string; slug: string }) {
	const { data } = useQuery(convexQuery(api.sources.character, { region: region as Region, slug }));
	if (!data) return null;
	return (
		<details className="surface-card mt-8 rounded-lg px-4 py-3 text-[0.8125rem]">
			<summary className="cursor-pointer select-none text-muted-foreground">Data sources (maintainers)</summary>
			<div className="mt-3 space-y-1 text-muted-foreground">
				<p>
					Blizzard: last login {when(data.blizzard.lastLoginAt)}, checked {when(data.blizzard.profileSyncedAt)}
					{data.blizzard.profileMissing ? ", no profile" : ""}
				</p>
				<p>
					Game:{" "}
					{data.addon
						? `read ${when(data.addon.capturedAt)}, uploaded ${when(data.addon.receivedAt)}, payload v${data.addon.version}`
						: "nothing uploaded"}
				</p>
			</div>
			<table className="num mt-3 w-full text-left">
				<thead className="text-muted-foreground">
					<tr>
						<th className="py-1 font-medium">Section</th>
						<th className="py-1 font-medium">Game</th>
						<th className="py-1 font-medium">Blizzard</th>
						<th className="py-1 font-medium">Shown</th>
					</tr>
				</thead>
				<tbody>
					{Object.entries(data.decisions).map(([section, d]) => (
						<tr key={section} className="border-t border-border/60">
							<td className="py-1.5 capitalize">{section}</td>
							<td className="py-1.5">{d.addon ? `${d.addon.count} · ${when(d.addon.at)}` : "—"}</td>
							<td className="py-1.5">{d.blizzard ? `${d.blizzard.count} · ${when(d.blizzard.at)}` : "—"}</td>
							<td className="py-1.5">
								<span className="text-foreground">
									{d.shown === "addon" ? "Game" : d.shown === "blizzard" ? "Blizzard" : "Nothing"}
								</span>
								<span className="text-muted-foreground">, {REASONS[d.reason]}</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{data.addon && data.addon.recipes.length > 0 && (
				<p className="mt-3 text-muted-foreground">
					Game recipes: {data.addon.recipes.map((r) => `${r.profession} ${r.count} (${when(r.capturedAt)})`).join(", ")}
				</p>
			)}
		</details>
	);
}
