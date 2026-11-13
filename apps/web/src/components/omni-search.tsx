import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import { DUNGEON_BY_KEY, DUNGEONS } from "@convex/shared/dungeons";
import { bestScore } from "@convex/shared/search";
import { className as classNameOf, type Region } from "@convex/shared/wow";
import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import {
	Activity01Icon,
	AiChat02Icon,
	AnvilIcon,
	Castle01Icon,
	ChartBarLineIcon,
	ComputerIcon,
	Database01Icon,
	Folder01Icon,
	Globe02Icon,
	Home01Icon,
	InboxIcon,
	Login03Icon,
	Logout03Icon,
	MoneyBag01Icon,
	PuzzleIcon,
	RefreshIcon,
	ScrollTextIcon,
	Search01Icon,
	Settings02Icon,
	Shield01Icon,
	SparklesIcon,
	Upload01Icon,
	UserGroupIcon,
	UserIcon,
	ViewIcon,
	ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { ItemIcon } from "@/components/item";
import { useCurrentGuild } from "@/lib/breadcrumbs";
import { startClaim } from "@/lib/claim";
import { desktop, useInDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";

// Omni search: ⌘K / Ctrl+K (or "/") anywhere, or the sidebar's Search row.
// One box for everything: your guilds' pages, members, items (with what's in
// your bags), recipes, quests, dungeons, open requests, settings, and a few
// actions (sync the roster, hide your BattleTag, sign out).
//
// Pages, settings, dungeons and actions are matched here, in the browser;
// the database's things come from `search.everything` (convex/search.ts).
// Both score with convex/shared/search.ts so they sort together.

export const OMNI_SEARCH_EVENT = "guildie:omni-search";
const RECENTS_KEY = "guildie:omni-recents";
const RECENTS_MAX = 6;
const PER_GROUP = 5;

/** Open the search from anywhere (the sidebar button, the phone top bar). */
export function openOmniSearch() {
	window.dispatchEvent(new Event(OMNI_SEARCH_EVENT));
}

// ---- Results -----------------------------------------------------------------

type Scope = "all" | "members" | "items" | "crafting" | "quests" | "pages" | "settings";

const SCOPES: { key: Scope; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "members", label: "Members" },
	{ key: "items", label: "Items" },
	{ key: "crafting", label: "Recipes" },
	{ key: "quests", label: "Quests" },
	{ key: "pages", label: "Pages" },
	{ key: "settings", label: "Settings" },
];

type Group =
	| "recent"
	| "actions"
	| "pages"
	| "members"
	| "guilds"
	| "items"
	| "recipes"
	| "requests"
	| "quests"
	| "dungeons"
	| "settings";

const GROUPS: Record<Group, { title: string; scope: Scope }> = {
	recent: { title: "Recent", scope: "all" },
	actions: { title: "Actions", scope: "settings" },
	pages: { title: "Pages", scope: "pages" },
	members: { title: "Members", scope: "members" },
	guilds: { title: "Guilds", scope: "pages" },
	items: { title: "Items", scope: "items" },
	recipes: { title: "Recipes", scope: "crafting" },
	requests: { title: "Requests", scope: "items" },
	quests: { title: "Quests", scope: "quests" },
	dungeons: { title: "Dungeons", scope: "quests" },
	settings: { title: "Settings", scope: "settings" },
};

/** UI icons by name, so a recent result can be saved as plain data. */
const ICONS = {
	activity: Activity01Icon,
	ai: AiChat02Icon,
	anvil: AnvilIcon,
	castle: Castle01Icon,
	chart: ChartBarLineIcon,
	computer: ComputerIcon,
	data: Database01Icon,
	folder: Folder01Icon,
	globe: Globe02Icon,
	home: Home01Icon,
	inbox: InboxIcon,
	login: Login03Icon,
	logout: Logout03Icon,
	bag: MoneyBag01Icon,
	puzzle: PuzzleIcon,
	refresh: RefreshIcon,
	scroll: ScrollTextIcon,
	settings: Settings02Icon,
	shield: Shield01Icon,
	sparkles: SparklesIcon,
	upload: Upload01Icon,
	group: UserGroupIcon,
	user: UserIcon,
	view: ViewIcon,
	hide: ViewOffIcon,
};
type IconName = keyof typeof ICONS;

type Visual =
	| { kind: "icon"; name: IconName }
	| { kind: "item"; icon?: string; quality?: string }
	| { kind: "avatar"; url?: string };

/** Where a result goes: a page, or the item panel over the current page. */
type Nav =
	| {
			kind: "route";
			to: string;
			params?: Record<string, string>;
			search?: Record<string, unknown>;
			hash?: string;
	  }
	| { kind: "item"; itemId: number };

type Result = {
	id: string;
	group: Group;
	title: string;
	/** The title in a class color, or an item quality's. */
	classId?: number;
	quality?: string;
	subtitle?: string;
	/** Right-aligned and quiet: a level, a count, a guild. */
	meta?: string;
	visual: Visual;
	score: number;
	nav?: Nav;
	/** Actions run instead of going somewhere; a thrown error shows under the box. */
	run?: () => Promise<unknown> | unknown;
	/** Other words it answers to ("bank" for Inventory). */
	keywords?: string[];
};

/** What a recent result keeps (no functions, no score). */
type Recent = Omit<Result, "run" | "score" | "group" | "keywords"> & { nav: Nav };

// ---- The component -------------------------------------------------------------

/** The search dialog. Mounted once in the app shell; listens for ⌘K, "/" and openOmniSearch(). */
export function OmniSearch() {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((o) => !o);
			} else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
				e.preventDefault();
				setOpen(true);
			}
		};
		const onOpen = () => setOpen(true);
		window.addEventListener("keydown", onKey);
		window.addEventListener(OMNI_SEARCH_EVENT, onOpen);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener(OMNI_SEARCH_EVENT, onOpen);
		};
	}, []);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-black/45 transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup
					aria-label="Search"
					className={cn(
						"fixed z-50 flex flex-col overflow-hidden rounded-[var(--card-radius)] border border-border-strong bg-popover bg-(image:--card-sheen) text-popover-foreground shadow-(--popover-shadow) outline-none",
						"inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)]",
						"sm:inset-x-auto sm:top-[12vh] sm:left-1/2 sm:max-h-[min(36rem,76dvh)] sm:w-[min(40rem,calc(100vw-2rem))] sm:-translate-x-1/2",
						"transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
					)}
				>
					{open && <Palette close={() => setOpen(false)} />}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function isTyping(target: EventTarget | null) {
	const el = target as HTMLElement | null;
	if (!el) return false;
	return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function Palette({ close }: { close: () => void }) {
	const [text, setText] = useState("");
	const [scope, setScope] = useState<Scope>("all");
	const [active, setActive] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const q = useDebounced(text.trim(), 120);
	const listRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();

	const local = useLocalResults(text.trim());
	const current = useCurrentGuild();
	const { data: server, isFetching } = useQuery({
		...convexQuery(api.search.everything, {
			q,
			guild: current ? { region: current.region as Region, slug: current.slug } : undefined,
		}),
		enabled: q.length >= 2,
		placeholderData: keepPreviousData,
	});
	const remote = useRemoteResults(q.length >= 2 ? server : undefined, local.context);
	const [recents, setRecents] = useState<Recent[]>(() => readRecents());

	// Everything, in groups: the best group first (by its best hit), each group best first.
	const sections = useMemo(() => {
		const typed = text.trim();
		if (!typed) {
			const recent: Result[] = recents.map((r, i) => ({ ...r, group: "recent", score: 100 - i }));
			const groups: { group: Group; items: Result[] }[] = [];
			if (recent.length && scope === "all") groups.push({ group: "recent", items: recent });
			const suggested = local.suggestions.filter((r) => scope === "all" || GROUPS[r.group].scope === scope);
			const byGroup = new Map<Group, Result[]>();
			for (const r of suggested) byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r]);
			for (const [group, items] of byGroup) groups.push({ group, items });
			return groups;
		}
		const all = [...local.results, ...remote].filter((r) => scope === "all" || GROUPS[r.group].scope === scope);
		const byGroup = new Map<Group, Result[]>();
		for (const r of all) byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r]);
		return [...byGroup.entries()]
			.map(([group, items]) => {
				const sorted = items.sort((a, b) => b.score - a.score);
				return { group, items: scope === "all" ? sorted.slice(0, PER_GROUP) : sorted.slice(0, 40) };
			})
			.sort((a, b) => b.items[0].score - a.items[0].score);
	}, [text, scope, recents, local, remote]);
	const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

	const type = (value: string) => {
		setText(value);
		setActive(0);
		setError(null);
	};
	const filter = (next: Scope) => {
		setScope(next);
		setActive(0);
	};
	// Keep the active row in view.
	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const pick = useCallback(
		async (r: Result | undefined) => {
			if (!r || busy) return;
			setError(null);
			if (r.run) {
				setBusy(true);
				try {
					await r.run();
					close();
				} catch (err) {
					setError(err instanceof ConvexError ? String(err.data) : "That didn't work. Try again.");
				} finally {
					setBusy(false);
				}
				return;
			}
			if (!r.nav) return;
			setRecents(remember(r));
			close();
			if (r.nav.kind === "item") {
				const itemId = r.nav.itemId;
				await navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, item: itemId }) } as never);
			} else {
				const { to, params, search, hash } = r.nav;
				await navigate({ to, params, search, hash } as never);
				// Same page, new section: the router doesn't scroll for a hash it's already on.
				if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
			}
		},
		[busy, close, navigate],
	);

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
			e.preventDefault();
			setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
		} else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
			e.preventDefault();
			setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
		} else if (e.key === "PageDown" || e.key === "PageUp") {
			e.preventDefault();
			const step = e.key === "PageDown" ? 8 : -8;
			setActive((i) => Math.max(0, Math.min(flat.length - 1, i + step)));
		} else if (e.key === "Enter") {
			e.preventDefault();
			void pick(flat[active]);
		} else if (e.key === "Tab") {
			e.preventDefault();
			const i = SCOPES.findIndex((s) => s.key === scope);
			filter(SCOPES[(i + (e.shiftKey ? -1 : 1) + SCOPES.length) % SCOPES.length].key);
		} else if (e.key === "Backspace" && !text && scope !== "all") {
			filter("all");
		}
	};

	const typed = text.trim();
	const waiting = typed.length >= 2 && (q !== typed || (isFetching && !server));
	let index = -1;
	return (
		<>
			<div className="flex flex-none items-center gap-2.5 border-b border-border px-3.5">
				<HugeiconsIcon icon={Search01Icon} size={17} strokeWidth={1.75} className="flex-none text-muted-foreground" />
				<input
					// biome-ignore lint/a11y/noAutofocus: the dialog exists to type into.
					autoFocus
					value={text}
					onChange={(e) => type(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder={
						local.context.signedIn
							? "Search members, items, recipes, quests, settings…"
							: "Search guilds, items, pages…"
					}
					aria-label="Search"
					aria-controls="omni-results"
					aria-activedescendant={flat[active] ? `omni-${flat[active].id}` : undefined}
					role="combobox"
					aria-expanded
					spellCheck={false}
					autoComplete="off"
					className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground/70 pointer-coarse:text-base"
				/>
				{waiting && <Spinner />}
				<Dialog.Close className="kbd hidden sm:inline-flex" aria-label="Close">
					Esc
				</Dialog.Close>
			</div>
			<div className="flex flex-none gap-1 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]">
				{SCOPES.map((s) => (
					<button
						key={s.key}
						type="button"
						className="chip h-6 flex-none text-xs"
						data-active={scope === s.key}
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => filter(s.key)}
					>
						{s.label}
					</button>
				))}
			</div>
			<div
				ref={listRef}
				id="omni-results"
				role="listbox"
				aria-label="Results"
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
			>
				{sections.map(({ group, items }) => (
					// biome-ignore lint/a11y/useSemanticElements: a listbox's group of options, not a form fieldset.
					<div key={group} role="group" aria-label={GROUPS[group].title} className="pb-1">
						<div className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{GROUPS[group].title}</div>
						{items.map((r) => {
							index++;
							const i = index;
							return (
								<Row
									key={`${group}-${r.id}`}
									result={r}
									index={i}
									active={i === active}
									query={typed}
									onHover={() => setActive(i)}
									onPick={() => void pick(r)}
								/>
							);
						})}
					</div>
				))}
				{flat.length === 0 && <Empty typed={typed} waiting={waiting} scope={scope} signedIn={local.context.signedIn} />}
			</div>
			{error && (
				<div className="flex-none border-t border-border px-3.5 py-2 text-[0.8125rem] text-destructive">{error}</div>
			)}
			<div className="flex flex-none items-center gap-4 border-t border-border px-3.5 py-2 text-xs text-muted-foreground pointer-coarse:hidden">
				<span className="flex items-center gap-1.5">
					<span className="kbd">↑</span>
					<span className="kbd">↓</span> to move
				</span>
				<span className="flex items-center gap-1.5">
					<span className="kbd">↵</span> to open
				</span>
				<span className="flex items-center gap-1.5">
					<span className="kbd">Tab</span> to filter
				</span>
			</div>
		</>
	);
}

function Row({
	result: r,
	index,
	active,
	query,
	onHover,
	onPick,
}: {
	result: Result;
	index: number;
	active: boolean;
	query: string;
	onHover: () => void;
	onPick: () => void;
}) {
	// Focus stays in the box (aria-activedescendant points here), so options aren't focusable.
	return (
		// biome-ignore lint/a11y/useFocusableInteractive: see above.
		// biome-ignore lint/a11y/useKeyWithClickEvents: the box handles the keys.
		<div
			id={`omni-${r.id}`}
			role="option"
			aria-selected={active}
			data-index={index}
			data-active={active}
			onMouseMove={active ? undefined : onHover}
			onMouseDown={(e) => e.preventDefault()}
			onClick={onPick}
			className="flex min-h-10 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-[0.8125rem] data-[active=true]:bg-selected pointer-coarse:min-h-11"
		>
			<Glyph visual={r.visual} />
			<div className="min-w-0 flex-1">
				<div className="truncate">
					{r.classId !== undefined || r.quality ? (
						<ClassText classId={r.classId} quality={r.quality}>
							<Highlight text={r.title} query={query} />
						</ClassText>
					) : (
						<Highlight text={r.title} query={query} />
					)}
				</div>
				{r.subtitle && <div className="truncate text-xs text-muted-foreground">{r.subtitle}</div>}
			</div>
			{r.meta && <span className="num flex-none text-xs text-muted-foreground">{r.meta}</span>}
		</div>
	);
}

function Glyph({ visual }: { visual: Visual }) {
	if (visual.kind === "item") return <ItemIcon icon={visual.icon} quality={visual.quality} size={26} />;
	if (visual.kind === "avatar") return <CharacterAvatar url={visual.url} size={26} className="rounded-full" />;
	return (
		<span className="grid size-[26px] flex-none place-items-center rounded-md border border-border bg-well text-muted-foreground">
			<HugeiconsIcon icon={ICONS[visual.name]} size={15} strokeWidth={1.75} />
		</span>
	);
}

/** The typed text, brighter, where it appears in the title (case-insensitive). */
function Highlight({ text, query }: { text: string; query: string }) {
	const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
	if (at < 0) return <>{text}</>;
	return (
		<>
			{text.slice(0, at)}
			<span className="font-semibold">{text.slice(at, at + query.length)}</span>
			{text.slice(at + query.length)}
		</>
	);
}

function Empty({
	typed,
	waiting,
	scope,
	signedIn,
}: {
	typed: string;
	waiting: boolean;
	scope: Scope;
	signedIn: boolean;
}) {
	let message: ReactNode;
	if (waiting) message = "Searching…";
	else if (!typed) message = "Type to search.";
	else if (typed.length < 2 && scope !== "pages" && scope !== "settings") message = "Keep typing…";
	else
		message = (
			<>
				Nothing matches “{typed}”{scope !== "all" && " here. Tab to search everything"}.
			</>
		);
	return (
		<div className="px-3 py-8 text-center text-[0.8125rem] text-muted-foreground">
			{message}
			{!signedIn && !waiting && typed.length >= 2 && (
				<div className="mt-1 text-xs">Sign in to search your guild's members, requests and your bags.</div>
			)}
		</div>
	);
}

function Spinner() {
	return (
		<span
			aria-hidden
			className="size-3.5 flex-none animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-muted-foreground"
		/>
	);
}

// ---- What's matched in the browser ------------------------------------------------

type GuildRef = { _id?: string; name: string; region: string; slug: string };

type Context = {
	signedIn: boolean;
	/** The guild in front of you (or your first), for dungeons, crafting and request links. */
	home: GuildRef | null;
	homeIsMember: boolean;
	memberGuilds: GuildRef[];
};

/**
 * Pages, settings, dungeons, your characters and actions, scored against
 * what's typed; and with nothing typed, a few suggestions.
 */
function useLocalResults(typed: string) {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	const current = useCurrentGuild();
	const inApp = useInDesktopApp();
	const navigate = useNavigate();
	const router = useRouter();
	const { signOut } = useAuthActions();
	const requestSync = useMutation(api.guilds.requestSync);
	const setHide = useMutation(api.users.setHideBattletag);
	const startClaimMutation = useMutation(api.claims.start);

	return useMemo(() => {
		const memberGuilds: GuildRef[] = viewer?.guilds ?? [];
		const isMember = (g: { region: string; slug: string }) =>
			memberGuilds.some((m) => m.region === g.region && m.slug === g.slug);
		// Your guilds plus the one you're looking at; the one in front of you first.
		const guilds: GuildRef[] = [...memberGuilds];
		if (current && !isMember(current)) guilds.push(current);
		guilds.sort((a, b) => Number(isSame(b, current)) - Number(isSame(a, current)));
		const home = guilds[0] ?? null;
		const homeMember = (home && isMember(home) ? home : memberGuilds[0]) ?? null;
		const several = guilds.length > 1;
		const context: Context = {
			signedIn: !!viewer,
			home,
			homeIsMember: !!home && isMember(home),
			memberGuilds,
		};

		const all: Omit<Result, "score">[] = [];
		const suggestions: Omit<Result, "score">[] = [];
		const add = (r: Omit<Result, "score">, suggest = false) => {
			all.push(r);
			if (suggest) suggestions.push(r);
		};
		const route = (
			to: string,
			params?: Record<string, string>,
			search?: Record<string, unknown>,
			hash?: string,
		): Nav => ({
			kind: "route",
			to,
			params,
			search,
			hash,
		});

		// Guild pages.
		for (const g of guilds) {
			const p = { region: g.region, slug: g.slug };
			const member = isMember(g);
			const front = g === home;
			const sub = several ? g.name : undefined;
			const id = (s: string) => `g:${g.region}/${g.slug}:${s}`;
			add(
				{
					id: id("roster"),
					group: "pages",
					title: `${g.name}`,
					subtitle: "Roster",
					visual: { kind: "icon", name: "group" },
					nav: route("/g/$region/$slug", p),
					keywords: ["roster", "members", "guild", "people"],
				},
				front,
			);
			add({
				id: id("stats"),
				group: "pages",
				title: "Roster: stats",
				subtitle: sub,
				visual: { kind: "icon", name: "chart" },
				nav: route("/g/$region/$slug", p, { view: "stats" }),
				keywords: ["stat priority", "talents", "specs"],
			});
			add({
				id: id("gearview"),
				group: "pages",
				title: "Roster: gear",
				subtitle: sub,
				visual: { kind: "icon", name: "shield" },
				nav: route("/g/$region/$slug", p, { view: "gear" }),
				keywords: ["item level", "ilvl", "equipment"],
			});
			add({
				id: id("profs"),
				group: "pages",
				title: "Roster: professions",
				subtitle: sub,
				visual: { kind: "icon", name: "anvil" },
				nav: route("/g/$region/$slug", p, { view: "professions" }),
				keywords: ["skills", "crafters"],
			});
			if (member) {
				add(
					{
						id: id("feed"),
						group: "pages",
						title: "Feed",
						subtitle: sub,
						visual: { kind: "icon", name: "activity" },
						nav: route("/g/$region/$slug/feed", p),
						keywords: ["activity", "news", "level ups", "dings"],
					},
					front,
				);
			}
			add(
				{
					id: id("crafting"),
					group: "pages",
					title: "Crafting",
					subtitle: sub,
					visual: { kind: "icon", name: "anvil" },
					nav: route("/g/$region/$slug/crafting", p),
					keywords: ["recipes", "crafters", "professions", "who can craft"],
				},
				front,
			);
			if (member) {
				add({
					id: id("upgrades"),
					group: "pages",
					title: "Upgrades for me",
					subtitle: sub ?? "Crafting",
					visual: { kind: "icon", name: "sparkles" },
					nav: route("/g/$region/$slug/crafting", p, { view: "upgrades" }),
					keywords: ["crafting", "gear upgrades", "better gear"],
				});
				add({
					id: id("craft"),
					group: "pages",
					title: "Upgrades I can craft",
					subtitle: sub ?? "Crafting",
					visual: { kind: "icon", name: "anvil" },
					nav: route("/g/$region/$slug/crafting", p, { view: "craft" }),
					keywords: ["crafting", "craft for guildmates", "help"],
				});
			}
			add(
				{
					id: id("gear"),
					group: "pages",
					title: "Gear",
					subtitle: sub,
					visual: { kind: "icon", name: "shield" },
					nav: route("/g/$region/$slug/gear", p),
					keywords: ["armor", "weapons", "proficiencies", "who can use"],
				},
				front,
			);
			add({
				id: id("addons"),
				group: "pages",
				title: "Addons",
				subtitle: sub,
				visual: { kind: "icon", name: "puzzle" },
				nav: route("/g/$region/$slug/addons", p),
				keywords: ["addons", "mods", "ui", "who runs"],
			});
			if (member) {
				add(
					{
						id: id("dungeons"),
						group: "pages",
						title: "Dungeons",
						subtitle: sub,
						visual: { kind: "icon", name: "castle" },
						nav: route("/g/$region/$slug/dungeons", p),
						keywords: ["instances", "groups", "dungeon quests", "lfg"],
					},
					front,
				);
				add(
					{
						id: id("requests"),
						group: "pages",
						title: "Requests",
						subtitle: sub,
						visual: { kind: "icon", name: "inbox" },
						nav: route("/g/$region/$slug/requests", p),
						keywords: ["ask", "need", "make a request", "wishlist"],
					},
					front,
				);
				add({
					id: id("mine"),
					group: "pages",
					title: "My requests",
					subtitle: sub ?? "Requests",
					visual: { kind: "icon", name: "inbox" },
					nav: route("/g/$region/$slug/requests", p, { view: "mine" }),
					keywords: ["requests", "asked"],
				});
				add({
					id: id("help"),
					group: "pages",
					title: "Requests I can help with",
					subtitle: sub ?? "Requests",
					visual: { kind: "icon", name: "inbox" },
					nav: route("/g/$region/$slug/requests", p, { view: "help" }),
					keywords: ["requests", "fill", "claim"],
				});
			}
		}

		// Who in the guild crafts what: the crafting page filtered to a profession.
		if (home) {
			const p = { region: home.region, slug: home.slug };
			for (const prof of CRAFTING_PROFESSIONS) {
				add({
					id: `prof:${home.region}/${home.slug}:${prof}`,
					group: "pages",
					title: `${prof} recipes`,
					subtitle: several ? `Crafting · ${home.name}` : "Crafting",
					visual: { kind: "icon", name: "anvil" },
					nav: route("/g/$region/$slug/crafting", p, { profession: prof }),
					keywords: [prof, `${prof} crafters`],
				});
			}
		}

		// Dungeons: who's on each one's quests (members only).
		for (const d of DUNGEONS) {
			const g = homeMember;
			add({
				id: `dungeon:${d.key}`,
				group: "dungeons",
				title: d.name,
				subtitle: g ? `Level ${d.level}${several ? ` · ${g.name}` : ""}` : `Level ${d.level}`,
				visual: { kind: "icon", name: "castle" },
				nav: g
					? route("/g/$region/$slug/dungeons/$dungeon", { region: g.region, slug: g.slug, dungeon: d.key })
					: undefined,
				keywords: DUNGEON_ALIASES[d.key] ?? [],
			});
		}

		// Personal.
		if (viewer) {
			add(
				{
					id: "inventory",
					group: "pages",
					title: "Inventory",
					subtitle: "Your bags and banks",
					visual: { kind: "icon", name: "bag" },
					nav: route("/inventory"),
					keywords: ["bags", "bank", "items", "mats"],
				},
				true,
			);
			add(
				{
					id: "quests",
					group: "pages",
					title: "Quests",
					subtitle: "Your quest logs",
					visual: { kind: "icon", name: "scroll" },
					nav: route("/quests"),
					keywords: ["quest log", "objectives"],
				},
				true,
			);
			add({
				id: "quests-zone",
				group: "pages",
				title: "Quests by zone",
				visual: { kind: "icon", name: "scroll" },
				nav: route("/quests", undefined, { view: "zone" }),
				keywords: ["quest log", "area"],
			});
			const characters = [...viewer.characters].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
			for (const c of characters) {
				const p = { region: c.region, slug: c.slug };
				const who = { classId: c.classId ?? undefined };
				const level = c.level ? `${c.level}` : undefined;
				add({
					id: `me:${c.region}/${c.slug}`,
					group: "members",
					title: c.name,
					...who,
					subtitle: [c.surname, c.classId ? classNameOf(c.classId) : undefined, "You"].filter(Boolean).join(" · "),
					meta: level,
					visual: { kind: "avatar", url: c.avatarUrl },
					nav: route("/c/$region/$slug", p),
					keywords: [c.surname ?? "", "me", "my character"],
				});
				for (const [tab, label, keywords] of CHARACTER_TABS) {
					add({
						id: `me:${c.region}/${c.slug}:${tab}`,
						group: "pages",
						title: `${c.name}: ${label}`,
						...who,
						visual: { kind: "avatar", url: c.avatarUrl },
						nav: route(`/c/$region/$slug/${tab}`, p),
						keywords: keywords.map((k) => `${c.name} ${k}`),
					});
				}
			}
		}
		add({
			id: "home",
			group: "pages",
			title: "Home",
			visual: { kind: "icon", name: "home" },
			nav: route("/"),
			keywords: ["start", "landing"],
		});
		add({
			id: "data",
			group: "pages",
			title: "Where the data comes from",
			visual: { kind: "icon", name: "data" },
			nav: route("/data"),
			keywords: ["blizzard api", "sources", "privacy", "how it works"],
		});

		// Settings.
		if (viewer) {
			const s = (
				id: string,
				title: string,
				to: string,
				name: IconName,
				keywords: string[],
				hash?: string,
				subtitle?: string,
				suggest = false,
			) =>
				add(
					{
						id: `settings:${id}`,
						group: "settings",
						title,
						subtitle: subtitle ?? "Settings",
						visual: { kind: "icon", name },
						nav: route(to, undefined, undefined, hash),
						keywords,
					},
					suggest,
				);
			s(
				"account",
				"Account",
				"/settings",
				"settings",
				["settings", "preferences", "profile"],
				undefined,
				undefined,
				true,
			);
			s(
				"characters",
				"Your characters",
				"/settings",
				"user",
				["claim", "refresh characters", "battle.net", "alts"],
				"characters",
				"Settings · Account",
			);
			s(
				"privacy",
				"Privacy",
				"/settings",
				"hide",
				["hide battletag", "show battletag", "privacy"],
				"privacy",
				"Settings · Account",
			);
			s(
				"ai",
				"AI apps",
				"/settings",
				"ai",
				["claude", "chatgpt", "mcp", "connect", "assistant"],
				"ai-apps",
				"Settings · Account",
			);
			s("guilds", "Guild settings", "/settings/guilds", "group", [
				"visibility",
				"public",
				"members only",
				"private",
				"owner",
				"guild master",
			]);
			s("addon", "Addon", "/settings/addon", "puzzle", ["install addon", "update addon", "in-game", "lua"]);
			if (inApp) {
				s(
					"wow",
					"World of Warcraft folder",
					"/settings/addon",
					"folder",
					["wow folder", "install location", "_forever_"],
					"wow",
					"Settings · Addon",
				);
				s(
					"sync",
					"Upload now",
					"/settings/addon",
					"upload",
					["sync", "upload", "savedvariables", "last upload"],
					"sync",
					"Settings · Addon",
				);
			}
			s("app", "Windows app", "/settings/app", "computer", [
				"desktop",
				"download",
				"update",
				"version",
				"guildie for windows",
			]);
			s(
				"whats-new",
				"What's new",
				"/settings/app",
				"sparkles",
				["changelog", "release notes", "updates"],
				"whats-new",
				"Settings · App",
			);
			s(
				"computers",
				"Connected computers",
				"/settings/app",
				"computer",
				["devices", "tokens", "uploader", "helper", "disconnect"],
				"computers",
				"Settings · App",
			);
		}

		// Actions.
		if (viewer) {
			const syncable = memberGuilds.find((g) => isSame(g, current)) ?? memberGuilds[0];
			if (syncable?._id) {
				const guildId = syncable._id;
				add({
					id: "act:sync",
					group: "actions",
					title: "Sync roster now",
					subtitle: `${syncable.name} from Blizzard`,
					visual: { kind: "icon", name: "refresh" },
					run: () => requestSync({ guildId: guildId as never }),
					keywords: ["refresh", "update roster", "sync now"],
				});
			}
			const hidden = !!viewer.hideBattletag;
			add({
				id: "act:battletag",
				group: "actions",
				title: hidden ? "Show my BattleTag to guildmates" : "Hide my BattleTag from guildmates",
				subtitle: hidden ? "Hidden now" : "Shown now",
				visual: { kind: "icon", name: hidden ? "view" : "hide" },
				run: () => setHide({ hide: !hidden }),
				keywords: ["battletag", "privacy", "hide", "show"],
			});
			if (!inApp) {
				add({
					id: "act:claim",
					group: "actions",
					title: "Refresh my characters",
					subtitle: "From Battle.net",
					visual: { kind: "icon", name: "refresh" },
					run: () => startClaim(startClaimMutation, "/settings"),
					keywords: ["claim", "characters", "battle.net", "new character"],
				});
			}
			add({
				id: "act:signout",
				group: "actions",
				title: "Sign out",
				visual: { kind: "icon", name: "logout" },
				run: async () => {
					await signOut();
					await desktop()
						?.signOut()
						.catch(() => {});
					await router.invalidate();
					await navigate({ to: "/" });
				},
				keywords: ["log out", "logout"],
			});
		} else {
			add(
				{
					id: "signin",
					group: "actions",
					title: "Sign in",
					subtitle: "With Battle.net",
					visual: { kind: "icon", name: "login" },
					nav: route("/sign-in"),
					keywords: ["log in", "login", "battle.net"],
				},
				true,
			);
		}

		const results: Result[] = [];
		if (typed) {
			for (const r of all) {
				const score = bestScore(typed, [r.title, r.subtitle, ...(r.keywords ?? [])]);
				// Its own title counts most; a keyword or subtitle less.
				const own = bestScore(typed, [r.title]);
				if (score > 0) results.push({ ...r, score: Math.max(own, score * 0.85) + GROUP_BOOST[r.group] });
			}
		}
		return {
			context,
			results,
			suggestions: suggestions.slice(0, 10).map((r) => ({ ...r, score: 0 })),
		};
	}, [typed, viewer, current, inApp, navigate, router, signOut, requestSync, setHide, startClaimMutation]);
}

/** Nudges for ties: an exact page beats an item of the same name. */
const GROUP_BOOST: Record<Group, number> = {
	recent: 0,
	actions: 0.5,
	pages: 1,
	members: 1.5,
	guilds: 0.5,
	items: 0,
	recipes: 0,
	requests: 0,
	quests: 0,
	dungeons: 0.8,
	settings: 0.6,
};

const isSame = (a: { region: string; slug: string } | null | undefined, b: { region: string; slug: string } | null) =>
	!!a && !!b && a.region === b.region && a.slug === b.slug;

const CRAFTING_PROFESSIONS = [
	"Alchemy",
	"Blacksmithing",
	"Cooking",
	"Enchanting",
	"Engineering",
	"First Aid",
	"Leatherworking",
	"Tailoring",
];

const CHARACTER_TABS: [string, string, string[]][] = [
	["talents", "Talents", ["talents", "build", "spec"]],
	["professions", "Professions", ["professions", "recipes known"]],
	["inventory", "Inventory", ["bags", "bank"]],
	["preferences", "Preferences", ["stat priority", "gear preference", "weights"]],
];

/** What players call the dungeons. */
const DUNGEON_ALIASES: Record<string, string[]> = {
	"ragefire-chasm": ["rfc"],
	deadmines: ["dm", "vc", "van cleef"],
	"wailing-caverns": ["wc"],
	"shadowfang-keep": ["sfk"],
	"blackfathom-deeps": ["bfd"],
	stockade: ["stocks", "stockades"],
	gnomeregan: ["gnomer"],
	"razorfen-kraul": ["rfk"],
	"scarlet-monastery": ["sm", "graveyard", "library", "armory", "cathedral"],
	"razorfen-downs": ["rfd"],
	uldaman: ["ulda"],
	zulfarrak: ["zf"],
	maraudon: ["mara"],
	"sunken-temple": ["st", "temple of atal'hakkar"],
	"blackrock-depths": ["brd"],
	"blackrock-spire": ["lbrs", "ubrs"],
	"dire-maul": ["dm", "dme", "dmw", "dmn"],
	stratholme: ["strat"],
	scholomance: ["scholo"],
};

// ---- What comes from the database ------------------------------------------------

type ServerResults = FunctionReturnType<typeof api.search.everything>;

function useRemoteResults(data: ServerResults | undefined, context: Context): Result[] {
	return useMemo(() => {
		if (!data) return [];
		const out: Result[] = [];
		// The server already ranked within each kind; keep its order, with a little room for our own score.
		const rank = (i: number) => 50 - i;
		data.members.forEach((m, i) => {
			out.push({
				id: `m:${m.region}/${m.slug}`,
				group: "members",
				title: m.name,
				classId: m.classId,
				subtitle: [
					m.surname,
					classNameOf(m.classId),
					context.memberGuilds.length > 1 || !context.signedIn ? m.guild.name : undefined,
				]
					.filter(Boolean)
					.join(" · "),
				meta: `${m.level}`,
				visual: { kind: "avatar", url: m.avatarUrl },
				nav: { kind: "route", to: "/c/$region/$slug", params: { region: m.region, slug: m.slug } },
				score: 45 + rank(i) / 10,
			});
		});
		data.guilds.forEach((g, i) => {
			out.push({
				id: `pg:${g.region}/${g.slug}`,
				group: "guilds",
				title: g.name,
				subtitle: [g.faction, g.region.toUpperCase()].filter(Boolean).join(" · "),
				meta: `${g.memberCount} members`,
				visual: { kind: "icon", name: "globe" },
				nav: { kind: "route", to: "/g/$region/$slug", params: { region: g.region, slug: g.slug } },
				score: 30 + rank(i) / 10,
			});
		});
		data.items.forEach((it, i) => {
			const have = it.have
				? `You have ${it.have.total}${it.have.where.length > 1 || context.signedIn ? ` (${it.have.where.map((w) => `${w.name} ${w.count}`).join(", ")})` : ""}`
				: undefined;
			out.push({
				id: `i:${it.itemId}`,
				group: "items",
				title: it.name,
				quality: it.quality,
				// Found by its description: show the line that matched.
				subtitle: [have, it.matched ?? it.kind, !it.matched && it.craft].filter(Boolean).join(" · ") || undefined,
				visual: { kind: "item", icon: it.icon, quality: it.quality },
				nav: { kind: "item", itemId: it.itemId },
				score: (it.matched ? 30 : 42) + rank(i) / 10 + (it.have ? 2 : 0),
			});
		});
		data.recipes.forEach((r, i) => {
			const g = context.home;
			const nav: Nav | undefined = g
				? {
						kind: "route",
						to: "/g/$region/$slug/crafting",
						params: { region: g.region, slug: g.slug },
						search: { q: r.name },
					}
				: r.item
					? { kind: "item", itemId: r.item.itemId }
					: undefined;
			if (!nav) return;
			out.push({
				id: `r:${r.recipeId}`,
				group: "recipes",
				title: r.name,
				quality: r.item?.quality,
				subtitle: r.matched
					? `${r.profession} · ${r.matched}`
					: g
						? `${r.profession} · Who can craft it`
						: r.profession,
				visual: r.item ? { kind: "item", icon: r.item.icon, quality: r.item.quality } : { kind: "icon", name: "anvil" },
				nav,
				score: (r.matched ? 28 : 38) + rank(i) / 10,
			});
		});
		data.requests.forEach((r, i) => {
			out.push({
				id: `rq:${r.id}`,
				group: "requests",
				title: r.quantity > 1 ? `${r.name} ×${r.quantity}` : r.name,
				quality: r.quality,
				subtitle: `${r.character.name} asked${r.ongoing ? " · Ongoing" : r.status === "claimed" ? " · Claimed" : " · Open"}${context.memberGuilds.length > 1 ? ` · ${r.guild.name}` : ""}`,
				visual: { kind: "item", icon: r.icon, quality: r.quality },
				nav: {
					kind: "route",
					to: "/g/$region/$slug/requests",
					params: { region: r.guild.region, slug: r.guild.slug },
					...(r.ongoing ? { search: { type: "ongoing" } } : {}),
				},
				score: 40 + rank(i) / 10,
			});
		});
		data.quests.forEach((q, i) => {
			const dungeon = q.dungeon ? DUNGEON_BY_KEY.get(q.dungeon) : undefined;
			const g = context.homeIsMember ? context.home : context.memberGuilds[0];
			const nav: Nav | undefined =
				dungeon && g
					? {
							kind: "route",
							to: "/g/$region/$slug/dungeons/$dungeon",
							params: { region: g.region, slug: g.slug, dungeon: dungeon.key },
						}
					: context.signedIn
						? { kind: "route", to: "/quests" }
						: undefined;
			if (!nav) return;
			out.push({
				id: `q:${q.questId}`,
				group: "quests",
				title: q.title,
				subtitle: [dungeon?.name ?? q.area, q.type].filter(Boolean).join(" · ") || undefined,
				meta: q.level ? `${q.level}` : undefined,
				visual: { kind: "icon", name: dungeon ? "castle" : "scroll" },
				nav,
				score: 36 + rank(i) / 10,
			});
		});
		return out;
	}, [data, context]);
}

// ---- Bits ------------------------------------------------------------------------

function useDebounced<T>(value: T, ms: number) {
	const [out, setOut] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setOut(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return out;
}

function readRecents(): Recent[] {
	try {
		const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
		return Array.isArray(raw) ? raw.filter((r) => r && typeof r.id === "string" && r.nav).slice(0, RECENTS_MAX) : [];
	} catch {
		return [];
	}
}

/** Put a picked result at the top of the recents (pages and things, not actions). */
function remember(r: Result): Recent[] {
	const { run: _run, score: _score, group: _group, keywords: _keywords, ...rest } = r;
	const next = [{ ...rest, nav: r.nav as Nav }, ...readRecents().filter((x) => x.id !== r.id)].slice(0, RECENTS_MAX);
	try {
		localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
	} catch {
		// Private windows and blocked storage: recents just don't stick.
	}
	return next;
}

/** The sidebar's search row: looks like a field, opens the dialog. */
export function SearchButton({ className }: { className?: string }) {
	const [mac, setMac] = useState<boolean | null>(null);
	useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
	return (
		<button
			type="button"
			onClick={openOmniSearch}
			className={cn(
				"flex h-8 w-full items-center gap-2 rounded-md border border-border bg-well/60 px-2 text-[0.8125rem] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground pointer-coarse:h-10",
				className,
			)}
		>
			<HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.75} />
			<span className="flex-1 text-left">Search</span>
			{mac !== null && (
				<span className="kbd pointer-coarse:hidden">
					{mac ? "⌘" : "Ctrl"}
					{mac ? "" : " "}K
				</span>
			)}
		</button>
	);
}

/** The phone top bar's search button. */
export function SearchIconButton({ className }: { className?: string }) {
	return (
		<button
			type="button"
			onClick={openOmniSearch}
			aria-label="Search"
			className={cn(
				"grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground",
				className,
			)}
		>
			<HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.75} />
		</button>
	);
}
