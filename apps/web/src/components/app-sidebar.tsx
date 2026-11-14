import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import {
	Activity01Icon,
	AnvilIcon,
	Cancel01Icon,
	Castle01Icon,
	InboxIcon,
	Login03Icon,
	Menu01Icon,
	MoneyBag01Icon,
	Notification01Icon,
	PuzzleIcon,
	ScrollTextIcon,
	Settings02Icon,
	Shield01Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, type LinkProps, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { AddonNotice } from "@/components/addon-notice";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { GuildieMark } from "@/components/mark";
import { OMNI_SEARCH_EVENT, SearchButton, SearchIconButton } from "@/components/omni-search";
import { SyncButton } from "@/components/sync-button";
import { UpdateReady } from "@/components/update-ready";
import { UpdatedNotice } from "@/components/whats-new";
import { useCurrentGuild } from "@/lib/breadcrumbs";
import { feedDayStart } from "@/lib/feed-day";
import { usePageTitle } from "@/lib/page-title";
import { cn } from "@/lib/utils";

// Navigation. A fixed sidebar from md up; below that a top bar whose menu
// button opens the same list in a sheet.

export function AppSidebar() {
	return (
		<aside className="app-sidebar max-md:hidden">
			<SidebarHead />
			<SidebarNav />
		</aside>
	);
}

/** The wordmark row. In the desktop app it's part of the title bar: drag it to move the window. */
function SidebarHead() {
	return (
		<div className="app-sidebar-drag flex h-12 flex-none items-center px-3 desktop:h-10 desktop:pl-[max(0.75rem,env(titlebar-area-x,0px))]">
			<Wordmark />
		</div>
	);
}

export function Wordmark() {
	return (
		<Link to="/" className="flex items-center gap-2 rounded-md px-1 text-[0.9375rem] font-semibold tracking-tight">
			<GuildieMark />
			Guildie
		</Link>
	);
}

function SidebarNav() {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	// Requests you could fill, per guild, and yours that went quiet (members only).
	const { data: requests } = useQuery({ ...convexQuery(api.requests.sidebar, {}), enabled: !!viewer });
	const { data: unread } = useQuery({ ...convexQuery(api.notifications.unread, {}), enabled: !!viewer });
	const requestsIn = (g: { region: string; slug: string }) =>
		requests?.guilds.find((r) => r.region === g.region && r.slug === g.slug);
	const stale = (requests?.guilds ?? []).filter((g) => g.stale > 0);
	// Your guilds, plus the one you're looking at if it isn't yours, so its
	// pages are always one click away (the guild page itself has no tabs).
	const current = useCurrentGuild();
	const guilds: { name: string; region: string; slug: string }[] = [...(viewer?.guilds ?? [])];
	if (current && !guilds.some((g) => g.region === current.region && g.slug === current.slug)) guilds.push(current);
	// Dungeons (who's on which dungeon quest) is for the guild's members.
	const isMember = (g: { region: string; slug: string }) =>
		!!viewer?.guilds.some((m) => m.region === g.region && m.slug === g.slug);
	// The sync row's guild: the one you're looking at, else your first.
	const syncGuild = viewer ? (current ?? viewer.guilds[0]) : undefined;
	const characters = [...(viewer?.characters ?? [])].sort(
		(a, b) => (b.level ?? 0) - (a.level ?? 0) || a.name.localeCompare(b.name),
	);
	return (
		<nav className="flex min-h-0 flex-1 flex-col text-[0.8125rem]">
			<div className="flex-none px-2 pt-2">
				<SearchButton />
			</div>
			<div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 pt-3 pb-4">
				{guilds.length > 0 && (
					<NavSection title="Guilds">
						<div className="space-y-4">
							{guilds.map((g) => (
								<div key={`${g.region}/${g.slug}`}>
									{/* Each guild's name labels its pages; there can be several. */}
									<div className="truncate px-2 pt-0.5 pb-1.5 text-xs font-medium text-muted-foreground" title={g.name}>
										{g.name}
									</div>
									<div className="space-y-px">
										<NavLink
											to="/g/$region/$slug"
											params={{ region: g.region, slug: g.slug }}
											activeOptions={{ exact: true, includeSearch: false }}
											className="pl-3"
										>
											<HugeiconsIcon icon={UserGroupIcon} size={15} strokeWidth={1.75} />
											Roster
										</NavLink>
										{isMember(g) && (
											<NavLink to="/g/$region/$slug/feed" params={{ region: g.region, slug: g.slug }} className="pl-3">
												<HugeiconsIcon icon={Activity01Icon} size={15} strokeWidth={1.75} />
												<span className="flex-1">Feed</span>
												<FeedToday region={g.region} slug={g.slug} />
											</NavLink>
										)}
										<NavLink
											to="/g/$region/$slug/crafting"
											params={{ region: g.region, slug: g.slug }}
											className="pl-3"
										>
											<HugeiconsIcon icon={AnvilIcon} size={15} strokeWidth={1.75} />
											Crafting
										</NavLink>
										<NavLink to="/g/$region/$slug/gear" params={{ region: g.region, slug: g.slug }} className="pl-3">
											<HugeiconsIcon icon={Shield01Icon} size={15} strokeWidth={1.75} />
											Gear
										</NavLink>
										<NavLink to="/g/$region/$slug/addons" params={{ region: g.region, slug: g.slug }} className="pl-3">
											<HugeiconsIcon icon={PuzzleIcon} size={15} strokeWidth={1.75} />
											Addons
										</NavLink>
										{isMember(g) && (
											<NavLink
												to="/g/$region/$slug/dungeons"
												params={{ region: g.region, slug: g.slug }}
												className="pl-3"
											>
												<HugeiconsIcon icon={Castle01Icon} size={15} strokeWidth={1.75} />
												Dungeons
											</NavLink>
										)}
										{requestsIn(g) && (
											<NavLink
												to="/g/$region/$slug/requests"
												params={{ region: g.region, slug: g.slug }}
												className="pl-3"
											>
												<HugeiconsIcon icon={InboxIcon} size={15} strokeWidth={1.75} />
												<span className="flex-1">Requests</span>
												{(requestsIn(g)?.canHelp ?? 0) > 0 && (
													<span className="num text-xs text-muted-foreground" title="Open requests you could fill">
														{requestsIn(g)?.canHelp}
													</span>
												)}
											</NavLink>
										)}
									</div>
								</div>
							))}
						</div>
					</NavSection>
				)}

				{viewer && (
					<NavSection title="Personal">
						<NavLink to="/notifications">
							<HugeiconsIcon icon={Notification01Icon} size={15} strokeWidth={1.75} />
							<span className="flex-1">Notifications</span>
							{!!unread && (
								<span className="num text-xs text-highlight" title="Unread notifications">
									{unread >= 100 ? "99+" : unread}
								</span>
							)}
						</NavLink>
						<NavLink to="/inventory">
							<HugeiconsIcon icon={MoneyBag01Icon} size={15} strokeWidth={1.75} />
							Inventory
						</NavLink>
						<NavLink to="/quests">
							<HugeiconsIcon icon={ScrollTextIcon} size={15} strokeWidth={1.75} />
							Quests
						</NavLink>
					</NavSection>
				)}

				{characters.length > 0 && (
					<NavSection title="Characters">
						{characters.map((c) => (
							<NavLink
								key={c._id}
								to="/c/$region/$slug"
								params={{ region: c.region, slug: c.slug }}
								className="h-9 pl-1.5"
							>
								<CharacterAvatar url={c.avatarUrl} size={24} className="rounded-full" />
								<span className="min-w-0 flex-1 truncate">
									<ClassText classId={c.classId}>{c.name}</ClassText>
									{c.surname && <span className="text-muted-foreground"> {c.surname}</span>}
								</span>
								{c.level ? <span className="num text-xs text-muted-foreground">lvl {c.level}</span> : null}
							</NavLink>
						))}
					</NavSection>
				)}
			</div>

			<div className="flex-none space-y-px border-t border-border px-2 pt-2 pb-2">
				{stale.map((g) => (
					<Link
						key={`${g.region}/${g.slug}`}
						to="/g/$region/$slug/requests"
						params={{ region: g.region, slug: g.slug }}
						search={{ view: "mine" }}
						className="surface-card mx-0.5 mb-2 block px-3 py-2 text-[0.8125rem]"
					>
						<span className="block font-medium">
							{g.stale === 1 ? "1 request is" : `${g.stale} requests are`} over a week old
						</span>
						<span className="block text-xs text-muted-foreground">
							{stale.length > 1 ? `${g.name}: still` : "Still"} need {g.stale === 1 ? "it" : "them"}?
						</span>
					</Link>
				))}
				<UpdateReady />
				<AddonNotice />
				<UpdatedNotice />
				{/* Keyed by guild: a failed click's message belongs to the guild it was for. */}
				{syncGuild && (
					<SyncButton key={`${syncGuild.region}/${syncGuild.slug}`} region={syncGuild.region} slug={syncGuild.slug} />
				)}
				{viewer ? (
					<NavLink to="/settings">
						<HugeiconsIcon icon={Settings02Icon} size={15} strokeWidth={1.75} />
						<span className="flex-1">Settings</span>
						<span className="min-w-0 truncate text-xs text-muted-foreground">
							{viewer.battletag?.split("#")[0] ?? viewer.name}
						</span>
					</NavLink>
				) : (
					<NavLink to="/sign-in">
						<HugeiconsIcon icon={Login03Icon} size={15} strokeWidth={1.75} />
						Sign in
					</NavLink>
				)}
			</div>
		</nav>
	);
}

/** How many things happened in a guild today (since 4am, like the Feed's days). */
function FeedToday({ region, slug }: { region: string; slug: string }) {
	// Client only: "today" is the viewer's own.
	const [since, setSince] = useState<number>();
	useEffect(() => {
		const update = () => setSince(feedDayStart(Date.now()).getTime());
		update();
		// Roll over at 4am without a reload.
		const timer = window.setInterval(update, 60_000);
		return () => window.clearInterval(timer);
	}, []);
	const { data: count } = useQuery({
		...convexQuery(api.feed.today, { region: region as Region, slug, since: since ?? 0 }),
		enabled: since !== undefined,
	});
	if (!count) return null;
	return (
		<span className="num text-xs text-muted-foreground" title="Today in the feed">
			{count >= 100 ? "99+" : count}
		</span>
	);
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div>
			<div className="truncate px-2 pb-1 text-[0.8125rem] font-semibold text-foreground" title={title}>
				{title}
			</div>
			<div className="space-y-px">{children}</div>
		</div>
	);
}

function NavLink({ className, children, ...props }: LinkProps & { className?: string; children: ReactNode }) {
	return (
		<Link {...props} className={cn("nav-item", className)}>
			{children}
		</Link>
	);
}

/** Phones: a frosted top bar over the pane (app.css) with the page title, and the sidebar in a sheet. */
export function AppTopBar() {
	const title = usePageTitle();
	return (
		<div className="app-topbar flex h-12 flex-none items-center gap-2 border-b border-border px-2 md:hidden">
			<NavSheet />
			<span className="min-w-0 flex-1 truncate font-medium">{title}</span>
			<SearchIconButton />
		</div>
	);
}

/** The menu button and the sidebar it opens, for windows too narrow for the sidebar. */
export function NavSheet({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);
	const href = useRouterState({ select: (s) => s.location.href });
	useEffect(() => setOpen(false), [href]);
	// Search opens over everything; the menu it was opened from gets out of the way.
	useEffect(() => {
		const close = () => setOpen(false);
		window.addEventListener(OMNI_SEARCH_EVENT, close);
		return () => window.removeEventListener(OMNI_SEARCH_EVENT, close);
	}, []);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger
				className={cn(
					"grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground desktop:h-7 desktop:w-8",
					className,
				)}
				aria-label="Menu"
			>
				<HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={1.75} />
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup
					initialFocus={false}
					className="app-sidebar fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] border-r border-border bg-chrome! shadow-2xl transition-transform data-ending-style:-translate-x-full data-starting-style:-translate-x-full"
				>
					<div className="flex h-12 flex-none items-center justify-between px-3 desktop:h-10">
						<Wordmark />
						<Dialog.Close
							className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground desktop:size-8"
							aria-label="Close menu"
						>
							<HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.75} />
						</Dialog.Close>
					</div>
					<SidebarNav />
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
