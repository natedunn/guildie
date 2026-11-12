import { createFileRoute } from "@tanstack/react-router";
import { Page, PageHeader, SectionTitle } from "@/components/page-header";

export const Route = createFileRoute("/data")({
	head: () => ({ meta: [{ title: "Where the data comes from · Guildie" }] }),
	component: DataNotes,
});

// Keep this page honest: everything here is about WoW: Forever specifically.
// When a gap closes (or a new one shows up), change it here.

const SOURCES = [
	[
		"Blizzard's API, Forever namespaces",
		"Rosters, character profiles, gear, talents, professions and known recipes, item and recipe data, auction houses. Refreshed hourly.",
	],
	[
		"Your Battle.net account",
		"When you sign in: your BattleTag and your character list in every region, which ties you to your guild. We don't keep Battle.net's tokens.",
	],
	["Wowhead (Forever)", "Item links and tooltips."],
	[
		"Recipes and reagents",
		"Every Forever recipe and its reagents, and each member's known recipes, from Blizzard. The addon uses them to suggest who might want an item. Refreshed weekly (recipes) and hourly (members).",
	],
	[
		"The Guildie addon (optional)",
		"Players who install it with the Guildie app can show talent changes after a /reload, before Blizzard's data updates. Shown only while it's newer than Blizzard's.",
	],
];

const GAPS = [
	["Who's online", "Blizzard's API doesn't say. \"Last seen\" is the last logout."],
	[
		"New characters",
		"A character appears on the roster right away, but its profile (gear, talents, professions, last seen) only once it's level 10 and has logged out.",
	],
	["Snapshots, not live", "Profiles reflect the character's last logout, not right now."],
	["Portraits", "Can take a day or more to appear after a character first shows up."],
	["Rank names", "Only rank numbers; 0 is the guild master."],
	["Your guild", "Found from your characters at level 10 or higher. If all of yours are lower, add the guild by name."],
	["Talents", "Only the active talent group. Trees with no points aren't listed."],
	["Guild crests and achievements", "Not provided for Forever yet."],
	["Item data", "Blizzard's item data for Forever is incomplete: a good share of items return nothing."],
	["Recipes", "A few known recipes aren't in Blizzard's recipe lists, so their reagents aren't suggested."],
	[
		"Documentation",
		"Blizzard hasn't documented the Forever API. Everything here works, but was found by testing, and can change.",
	],
];

function DataNotes() {
	return (
		<Page width="medium">
			<PageHeader title="Where the data comes from" description="Everything here is for WoW: Forever." />
			<Notes title="Sources" rows={SOURCES} className="mt-2" />
			<Notes title="What we can't know (yet)" rows={GAPS} className="mt-10" />
		</Page>
	);
}

function Notes({ title, rows, className }: { title: string; rows: string[][]; className?: string }) {
	return (
		<section className={className}>
			<SectionTitle>{title}</SectionTitle>
			<dl className="surface-card mt-3 divide-y divide-border text-[0.8125rem]">
				{rows.map(([name, text]) => (
					<div key={name} className="grid gap-x-6 gap-y-0.5 px-3.5 py-2.5 sm:grid-cols-[13rem_1fr]">
						<dt className="font-medium">{name}</dt>
						<dd className="text-muted-foreground">{text}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
