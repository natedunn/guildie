import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { SectionTitle } from "@/components/page-header";
import { Switch } from "@/components/ui/switch";

// Settings → Guilds: the guilds your characters are in. The owner (the
// player who claimed the guild master's character) decides who can see it.
export const Route = createFileRoute("/settings/guilds")({
	head: () => ({ meta: [{ title: "Guilds · Settings · Guildie" }] }),
	component: GuildSettings,
});

function GuildSettings() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) return null;
	return (
		<div className="max-w-3xl pb-12">
			<SectionTitle>Your guilds</SectionTitle>
			<p className="mt-1 text-[0.8125rem] text-muted-foreground">
				Found from your characters each time you sign in. The guild master's player owns a guild on Guildie and can make
				it members only.
			</p>
			{viewer.guilds.length === 0 ? (
				<p className="mt-3 rounded-[var(--card-radius)] border border-dashed border-border px-3.5 py-3 text-[0.8125rem] text-muted-foreground">
					None yet. Your guilds show up here once Guildie finds them from your characters.
				</p>
			) : (
				<ul className="surface-card mt-3 divide-y divide-border">
					{viewer.guilds.map((g) => (
						<li key={g._id} className="px-3.5 py-3 text-[0.8125rem]">
							<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
								<Link
									to="/g/$region/$slug"
									params={{ region: g.region, slug: g.slug }}
									className="font-medium hover:underline underline-offset-4"
								>
									{g.name}
								</Link>
								<span className="num flex items-center gap-2 text-muted-foreground">
									{g.region.toUpperCase()} · {g.memberCount} members
									{g.isOwner && <span className="pill px-2 py-0">You own it</span>}
								</span>
							</div>
							{g.isOwner ? (
								<MembersOnly guildId={g._id} on={g.visibility === "members"} />
							) : (
								<p className="mt-1 text-muted-foreground">
									{g.visibility === "members"
										? "Members only: only its members can see it."
										: "Public: anyone with the link can see it."}
								</p>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function MembersOnly({ guildId, on }: { guildId: Id<"guilds">; on: boolean }) {
	const setVisibility = useMutation(api.guilds.setVisibility);
	const [error, setError] = useState<string | null>(null);
	return (
		<label className="mt-3 flex items-start gap-3">
			<Switch
				className="mt-0.5"
				checked={on}
				onCheckedChange={async (checked) => {
					setError(null);
					try {
						await setVisibility({ guildId, visibility: checked ? "members" : "public" });
					} catch (err) {
						setError(err instanceof ConvexError ? String(err.data) : "Couldn't change it.");
					}
				}}
			/>
			<span>
				Members only
				<span className="block text-muted-foreground">
					Only people who've claimed a character in this guild can see its roster, crafting and characters, and it
					doesn't show up in search. Off: anyone with the link or the guild's name can look.
				</span>
				{error && <span className="mt-1 block text-destructive">{error}</span>}
			</span>
		</label>
	);
}
