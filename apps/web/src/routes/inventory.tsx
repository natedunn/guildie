import { api } from "@convex/_generated/api";
import { ITEM_CATEGORIES } from "@convex/shared/itemCategories";
import { CLASSES } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { GridViewIcon, ListViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { ClassText } from "@/components/class-name";
import { FilterMenu } from "@/components/filter-menu";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { Page, PageHeader } from "@/components/page-header";
import { PageTabButton, PageTabs } from "@/components/page-tabs";
import { LearnerSummary } from "@/components/recipe-learners";
import { TrackedCrafts } from "@/components/tracked-crafts";
import { SearchInput } from "@/components/ui/search-input";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

// Personal → Inventory: every bag and bank of your claimed characters, as
// the addon last read them (bags at the last /reload or logout, the bank as
// of the last time it was open). Only you see it (inventory:all).
//
// Two tabs. Items: by category like the game's bag addons (Baganator), or as
// a list ("Where's my Silk Cloth?": Lich bags 37 · Isai bank 20), filtered by
// character (all of them together by default, ?character=<slug>; old
// /c/…/inventory links land here) and bags or bank (?where=). The reagents
// your tracked crafts use are outlined in place, with have/need. Recipe items in the list say who in
// your guilds could learn them. Tracked crafts (?tab=tracked): what you're
// gathering for, have against need (tracked-crafts.tsx).

type Where = "bags" | "bank";
type Search = { character?: string; tab?: "tracked"; view?: "list"; where?: Where };

export const Route = createFileRoute("/inventory")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const out: Search = {};
		if (typeof search.character === "string" && search.character) out.character = search.character;
		if (search.tab === "tracked") out.tab = "tracked";
		if (search.view === "list") out.view = "list";
		if (search.where === "bags" || search.where === "bank") out.where = search.where;
		return out;
	},
	beforeLoad: ({ context }) => {
		if (!context.token) throw redirect({ to: "/sign-in", search: { next: "/inventory" } });
	},
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(convexQuery(api.inventory.all, {})),
			context.queryClient.ensureQueryData(convexQuery(api.tracking.list, {})),
		]);
	},
	head: () => ({ meta: [{ title: "Inventory · Guildie" }] }),
	component: InventoryPage,
});

type Data = NonNullable<FunctionReturnType<typeof api.inventory.all>>;
type Character = Data["characters"][number];
type Item = Data["items"][number];

function InventoryPage() {
	const { data } = useSuspenseQuery(convexQuery(api.inventory.all, {}));
	const { data: tracking } = useQuery(convexQuery(api.tracking.list, {}));
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const set = (next: Partial<Search>) =>
		navigate({ search: (prev) => ({ ...prev, ...next }), replace: true, resetScroll: false });

	if (!data) return null;
	const characters = data.characters;
	const trackedCount = tracking?.crafts.length ?? 0;
	return (
		<>
			<PageHeader
				title="Inventory"
				description="Your characters' bags and banks, as the Guildie addon last read them. Only you can see this."
			/>
			<Page className="max-w-4xl space-y-4">
				<PageTabs>
					<PageTabButton active={search.tab !== "tracked"} onClick={() => set({ tab: undefined })}>
						Items
					</PageTabButton>
					<PageTabButton
						active={search.tab === "tracked"}
						onClick={() => set({ tab: "tracked" })}
						count={trackedCount || undefined}
					>
						Tracked crafts
					</PageTabButton>
				</PageTabs>
				{search.tab === "tracked" ? (
					<TrackedCrafts />
				) : characters.length === 0 ? (
					<p className="text-[0.8125rem] text-muted-foreground">
						No characters yet.{" "}
						<Link to="/settings" className="text-foreground underline underline-offset-4">
							Claim your characters
						</Link>{" "}
						to see their bags and banks here.
					</p>
				) : (
					<Items
						data={data}
						search={search}
						set={set}
						need={new Map(tracking?.reagents.map((r) => [r.itemId, r.need]))}
					/>
				)}
			</Page>
		</>
	);
}

function Items({
	data,
	search,
	set,
	need,
}: {
	data: Data;
	search: Search;
	set: (next: Partial<Search>) => void;
	need: Map<number, number>;
}) {
	const [q, setQ] = useState("");
	const characters = data.characters;
	const selected = characters.find((c) => c.slug === search.character);
	const nameOf = useMemo(() => new Map(characters.map((c) => [c.key, c])), [characters]);

	// Items with the character and bags-or-bank filters applied, and the search.
	const filter = (opts: { character?: Character; where?: Where }) => {
		const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
		const out: Item[] = [];
		for (const item of data.items) {
			const where = item.where.filter(
				(w) => (!opts.character || w.key === opts.character.key) && (!opts.where || w.part === opts.where),
			);
			if (!where.length) continue;
			const text = `${item.name ?? ""} ${item.kind ?? ""}`.toLowerCase();
			if (!words.every((w) => text.includes(w))) continue;
			out.push({ ...item, where, total: where.reduce((sum, w) => sum + w.count, 0) });
		}
		return out;
	};
	const current = { character: selected, where: search.where };
	const shown = filter(current);
	const listed = selected ? [selected] : characters;
	const anyRead = listed.some((c) => c.bags || c.bank);
	// One character: "Bags 37 · Bank 20" without the name.
	const single = selected ?? (characters.length === 1 ? characters[0] : undefined);
	const list = search.view === "list";

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<SearchInput
					id="inventory-search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Where's my…?"
					autoComplete="off"
					className="h-9"
					wrapperClassName="flex-1 basis-56"
				/>
				<FilterMenu
					value={selected?.slug ?? ""}
					onChange={(v) => set({ character: v || undefined })}
					className="h-9"
					options={[
						{ value: "", label: "All characters", count: filter({ ...current, character: undefined }).length },
						...characters.map((c, i) => ({
							value: c.slug,
							// Inline color: the menu's highlight restyles text color through classes.
							label: (
								<span className="flex min-w-0 flex-col">
									<span style={{ color: CLASSES[c.classId]?.color }}>{c.name}</span>
									<span className="text-xs text-muted-foreground">{readLine(c)}</span>
								</span>
							),
							count: filter({ ...current, character: c }).length,
							separate: i === 0,
						})),
					]}
				/>
				<FilterMenu
					value={search.where ?? ""}
					onChange={(v) => set({ where: (v || undefined) as Where | undefined })}
					className="h-9"
					options={[
						{ value: "", label: "Bags and bank", count: filter({ ...current, where: undefined }).length },
						{ value: "bags", label: "Bags", count: filter({ ...current, where: "bags" }).length, separate: true },
						{ value: "bank", label: "Bank", count: filter({ ...current, where: "bank" }).length },
					]}
				/>
				<ViewToggle list={list} onChange={(l) => set({ view: l ? "list" : undefined })} />
			</div>
			<ReadStatus characters={listed} selected={!!selected} tracked={need.size > 0} />

			{!anyRead ? (
				<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-balance text-muted-foreground">
					Nothing read yet. With the Guildie app running, log in to WoW and /reload; open your bank once to add it.
				</p>
			) : shown.length === 0 ? (
				<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground">
					{q.trim()
						? `No ${q.trim()} in ${selected ? `${selected.name}'s` : "your"} ${search.where === "bank" ? "bank" : search.where === "bags" ? "bags" : "bags or banks"}.`
						: "Empty."}
				</p>
			) : list ? (
				<ItemList items={shown} single={!!single} nameOf={nameOf} need={need} />
			) : (
				<Categories items={shown} need={need} />
			)}
		</div>
	);
}

/** "Bags 1 hr ago · Bank yesterday", or what hasn't been read. */
function readLine(c: Character) {
	if (!c.bags && !c.bank) return "Not read yet";
	return [
		c.bags ? `Bags ${ago(c.bags.capturedAt)}` : "No bags",
		c.bank ? `Bank ${ago(c.bank.capturedAt)}` : "No bank",
	].join(" · ");
}

/** When the addon last read them: one character's bags and bank, or a summary of all of them. */
function ReadStatus({
	characters,
	selected,
	tracked,
}: {
	characters: Character[];
	selected: boolean;
	tracked: boolean;
}) {
	const key = tracked ? (
		<span className="ml-auto inline-flex items-center gap-1.5">
			<span className="inline-block size-2.5 rounded-[3px] ring-2 ring-highlight/80" />
			Tracked reagents, have/need
		</span>
	) : null;
	if (selected && characters[0])
		return (
			<p className="flex flex-wrap gap-x-3 px-1 text-xs text-muted-foreground">
				{readLine(characters[0])}
				{key}
			</p>
		);
	const read = characters.filter((c) => c.bags || c.bank);
	const unread = characters.filter((c) => !c.bags && !c.bank);
	const latest = Math.max(0, ...read.flatMap((c) => [c.bags?.capturedAt ?? 0, c.bank?.capturedAt ?? 0]));
	return (
		<p className="flex flex-wrap gap-x-3 px-1 text-xs text-muted-foreground">
			<span>
				{read.length ? (
					<>
						{read.length === characters.length ? "All" : read.length} of {characters.length} characters read, last{" "}
						{ago(latest)}
					</>
				) : (
					"No characters read yet"
				)}
				{unread.length && read.length ? (
					<>
						{" · Not yet: "}
						{unread.map((c, i) => (
							<span key={c.key}>
								{i > 0 ? ", " : null}
								<ClassText classId={c.classId}>{c.name}</ClassText>
							</span>
						))}
					</>
				) : null}
			</span>
			{key}
		</p>
	);
}

function ViewToggle({ list, onChange }: { list: boolean; onChange: (list: boolean) => void }) {
	const option = (on: boolean, icon: typeof GridViewIcon, label: string, value: boolean) => (
		<button
			type="button"
			aria-pressed={on}
			aria-label={label}
			title={label}
			onClick={() => onChange(value)}
			className={cn(
				"inline-flex h-7 w-8 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground",
				on && "bg-accent text-foreground",
			)}
		>
			<HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} />
		</button>
	);
	return (
		<span className="ml-auto inline-flex h-9 items-center gap-0.5 rounded-md border border-input bg-well p-0.5">
			{option(!list, GridViewIcon, "Categories", false)}
			{option(list, ListViewIcon, "List", true)}
		</span>
	);
}

/** Items as icons under their category, like the game's bag addons; the count in the corner. */
function Categories({ items, need }: { items: Item[]; need: Map<number, number> }) {
	return (
		<div className="surface-card space-y-5 p-4">
			{ITEM_CATEGORIES.map(({ key, label }) => {
				const list = items.filter((i) => i.category === key);
				if (!list.length) return null;
				return (
					<section key={key}>
						<h3 className="mb-2 text-xs font-semibold text-muted-foreground">
							{label} <span className="num font-normal">{list.length}</span>
						</h3>
						<ul className="flex flex-wrap gap-1.5">
							{list.map((item) => {
								const wanted = need.get(item.itemId);
								return (
									<li key={item.itemId}>
										<ItemHover
											item={{
												itemId: item.itemId,
												name: item.name ?? `Item ${item.itemId}`,
												quality: item.quality,
												icon: item.icon,
											}}
											className={cn(
												"relative block rounded-[5px]",
												wanted && "ring-2 ring-highlight/80 ring-offset-2 ring-offset-card",
											)}
										>
											<ItemIcon icon={item.icon} quality={item.quality} size={40} className="block" />
											{item.total > 1 || wanted ? (
												<span className="num pointer-events-none absolute right-0.5 bottom-0 text-[11px] leading-none font-semibold text-white [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_1px_#000]">
													{item.total}
													{wanted ? <span className="text-white/70">/{wanted}</span> : null}
												</span>
											) : null}
										</ItemHover>
									</li>
								);
							})}
						</ul>
					</section>
				);
			})}
		</div>
	);
}

/** Items as rows: where each is ("Lich bags 37 · Isai bank 20"), recipe items with who could learn them. */
function ItemList({
	items,
	single,
	nameOf,
	need,
}: {
	items: Item[];
	single: boolean;
	nameOf: Map<string, Character>;
	need: Map<number, number>;
}) {
	return (
		<ul className="surface-card card-clip">
			{items.map((item) => {
				const name = item.name ?? `Item ${item.itemId}`;
				const wanted = need.get(item.itemId);
				return (
					<li
						key={item.itemId}
						className={cn(
							"border-b border-border last:border-b-0",
							wanted && "shadow-[inset_2px_0_0_var(--highlight)]",
						)}
					>
						<ItemHover
							item={{ itemId: item.itemId, name, quality: item.quality, icon: item.icon }}
							className="flex items-center gap-2.5 px-3 py-1.5 text-[0.8125rem] transition-colors hover:bg-[var(--row-hover)]"
						>
							<ItemIcon icon={item.icon} quality={item.quality} size={28} />
							<span className="min-w-0 flex-1">
								<span className="block truncate" style={{ color: QUALITY_COLORS[item.quality] }}>
									{name}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{item.where.map((w, i) => {
										const c = nameOf.get(w.key);
										return (
											<span key={`${w.key}:${w.part}`}>
												{i > 0 && " · "}
												{!single && c && <ClassText classId={c.classId}>{c.name}</ClassText>}
												{!single ? ` ${w.part}` : w.part === "bags" ? "Bags" : "Bank"}{" "}
												<span className="num">{w.count}</span>
											</span>
										);
									})}
								</span>
							</span>
							<span className="num text-muted-foreground">
								×{item.total}
								{wanted ? <span className="text-xs text-foreground/85"> · need {wanted}</span> : null}
							</span>
						</ItemHover>
						{item.recipe ? (
							<p className="-mt-1 truncate pr-3 pb-1.5 pl-[3.125rem] text-xs">
								<LearnerSummary
									who={item.recipe.who}
									region={item.recipe.who[0]?.region ?? "us"}
									profession={item.recipe.profession}
								/>
							</p>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
