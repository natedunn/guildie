import { useRouterState } from "@tanstack/react-router";
import { usePageTitle } from "@/lib/page-title";

// Where you are, for the title bar: "MeowPewPew › Crafting",
// "MeowPewPew › Brisket › Professions". Built from the matched routes and
// their loaders, so it's there from the first paint.

type GuildRef = { name: string; region: string; slug: string };

export type Crumb = {
	label: string;
	link?:
		| { to: "/g/$region/$slug" | "/c/$region/$slug"; params: { region: string; slug: string } }
		| { to: "/settings"; params?: undefined };
};

type Match = { routeId: string; params: Record<string, string>; loaderData?: unknown };

const TAB_LABELS: Record<string, string> = {
	"/settings/guilds": "Guilds",
	"/settings/addon": "Addon",
	"/settings/app": "App",
	"/g/$region/$slug/crafting": "Crafting",
	"/g/$region/$slug/gear": "Gear",
	"/c/$region/$slug/talents": "Talents",
	"/c/$region/$slug/professions": "Professions",
};

function crumbsOf(matches: Match[]): Crumb[] | null {
	const crumbs: Crumb[] = [];
	for (const m of matches) {
		const data = m.loaderData as { name?: string; guild?: GuildRef } | undefined;
		if (m.routeId === "/g/$region/$slug" && data?.name) {
			crumbs.push({
				label: data.name,
				link: { to: "/g/$region/$slug", params: { region: m.params.region, slug: m.params.slug } },
			});
		} else if (m.routeId === "/c/$region/$slug" && data?.name) {
			if (data.guild) {
				crumbs.push({
					label: data.guild.name,
					link: { to: "/g/$region/$slug", params: { region: data.guild.region, slug: data.guild.slug } },
				});
			}
			crumbs.push({
				label: data.name,
				link: { to: "/c/$region/$slug", params: { region: m.params.region, slug: m.params.slug } },
			});
		} else if (m.routeId === "/settings") {
			crumbs.push({ label: "Settings", link: { to: "/settings" } });
		} else if (TAB_LABELS[m.routeId]) {
			crumbs.push({ label: TAB_LABELS[m.routeId] });
		}
	}
	return crumbs.length ? crumbs : null;
}

export function useBreadcrumbs(): Crumb[] {
	const title = usePageTitle();
	const crumbs = useRouterState({ select: (s) => crumbsOf(s.matches as unknown as Match[]) });
	return crumbs ?? [{ label: title }];
}

/** The guild being looked at (a guild page, or a character's guild), if any. */
export function useCurrentGuild(): GuildRef | null {
	return useRouterState({
		select: (s) => {
			for (const m of s.matches as unknown as Match[]) {
				const data = m.loaderData as { name?: string; guild?: GuildRef } | undefined;
				if (m.routeId === "/g/$region/$slug" && data?.name)
					return { name: data.name, region: m.params.region, slug: m.params.slug };
				if (m.routeId === "/c/$region/$slug" && data?.guild) return data.guild;
			}
			return null;
		},
		structuralSharing: true,
	});
}
