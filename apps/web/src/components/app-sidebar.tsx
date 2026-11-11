import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import {
	AnvilIcon,
	Backpack01Icon,
	Cancel01Icon,
	Castle01Icon,
	InboxIcon,
	KnightShieldIcon,
	Login03Icon,
	Menu01Icon,
	ScrollTextIcon,
	Settings02Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, type LinkProps, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { UpdateReady } from "@/components/update-ready";
import { UpdatedNotice } from "@/components/whats-new";
import { useCurrentGuild } from "@/lib/breadcrumbs";
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
			<svg viewBox="0 0 32 32" aria-hidden="true" className="size-[18px]">
				<path d="M16 4l10 4.2v7.3c0 6-4.1 10.4-10 12.1-5.9-1.7-10-6.1-10-12.1V8.2z" fill="currentColor" />
				<path d="M16 10.5v11M10.5 16h11" stroke="var(--chrome)" strokeWidth="2.25" strokeLinecap="round" />
			</svg>
			Guildie
		</Link>
	);
}

function SidebarNav() {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	// Requests you could fill, per guild, and yours that went quiet (members only).
	const { data: requests } = useQuery({ ...convexQuery(api.requests.sidebar, {}), enabled: !!viewer });
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
	const characters = [...(viewer?.characters ?? [])].sort(
		(a, b) => (b.level ?? 0) - (a.level ?? 0) || a.name.localeCompare(b.name),
	);
	return (
		<nav className="flex min-h-0 flex-1 flex-col text-[0.8125rem]">
			<div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 pt-2 pb-4">
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
											activeOptions={{ exact: true }}
											className="pl-3"
										>
											<HugeiconsIcon icon={UserGroupIcon} size={15} strokeWidth={1.75} />
											Roster
										</NavLink>
										<NavLink
											to="/g/$region/$slug/crafting"
											params={{ region: g.region, slug: g.slug }}
											className="pl-3"
										>
											<HugeiconsIcon icon={AnvilIcon} size={15} strokeWidth={1.75} />
											Crafting
										</NavLink>
										<NavLink to="/g/$region/$slug/gear" params={{ region: g.region, slug: g.slug }} className="pl-3">
											<HugeiconsIcon icon={KnightShieldIcon} size={15} strokeWidth={1.75} />
											Gear
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
						<NavLink to="/inventory">
							<HugeiconsIcon icon={Backpack01Icon} size={15} strokeWidth={1.75} />
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
						className="mx-0.5 mb-2 block rounded-md border border-border px-3 py-2 text-[0.8125rem] hover:bg-hover"
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
				<UpdatedNotice />
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

/** Phones: a top bar with the page title, and the sidebar in a sheet. */
export function AppTopBar() {
	const title = usePageTitle();
	return (
		<div className="app-topbar flex h-12 flex-none items-center gap-2 border-b border-border bg-chrome px-2 md:hidden">
			<NavSheet />
			<span className="truncate font-medium">{title}</span>
		</div>
	);
}

/** The menu button and the sidebar it opens, for windows too narrow for the sidebar. */
export function NavSheet({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);
	const href = useRouterState({ select: (s) => s.location.href });
	useEffect(() => setOpen(false), [href]);
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
