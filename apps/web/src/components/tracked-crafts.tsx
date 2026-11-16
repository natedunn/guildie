import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ClassText } from "@/components/class-name";
import { ENCHANT_ICON, ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { cn } from "@/lib/utils";

// Inventory's Tracked crafts (tracking.ts): what you're gathering reagents
// for, and the reagents together: what you have across your characters'
// bags and banks against what you need, and where to get the rest (a
// vendor, or a guildmate who makes it). Tracked from Crafting or an item's
// panel; the reagents' tooltips in game say the same.

type Data = NonNullable<FunctionReturnType<typeof api.tracking.list>>;
type Craft = Data["crafts"][number];
type Reagent = Data["reagents"][number];
type Person = Craft["crafters"][number];

/**
 * Reagent table columns: reagent, still needed, where you have them, where to
 * get more. On a phone: the icon, one column of text (where and more from
 * under the name), and the number on the right.
 */
const COLS = "sm:grid sm:grid-cols-[minmax(0,1.2fr)_5.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-x-4";

export function TrackedCrafts() {
	const { data } = useQuery(convexQuery(api.tracking.list, {}));
	if (!data) return null;
	if (data.crafts.length === 0) {
		return (
			<p className="text-[0.8125rem] text-muted-foreground">
				Gathering for a craft? <span className="text-foreground">Track</span> it from a guild's Crafting page or an
				item's panel, and its reagents show here with what you still need, and on their tooltips in game.
			</p>
		);
	}
	return (
		<section className="space-y-3">
			<ul className="surface-card divide-y divide-border/60">
				{data.crafts.map((c) => (
					<CraftRow key={c.recipeId} craft={c} />
				))}
			</ul>
			<div className="surface-card overflow-hidden text-[0.8125rem]">
				<div
					className={cn(COLS, "border-b border-border/60 px-3 pt-2 pb-1.5 text-xs text-muted-foreground max-sm:hidden")}
				>
					<span>Reagent</span>
					<span className="text-right">Still need</span>
					<span>Where</span>
					<span>More from</span>
				</div>
				<ul className="divide-y divide-border/60">
					{data.reagents.map((r) => (
						<ReagentRow key={r.itemId} reagent={r} />
					))}
				</ul>
			</div>
			<p className="px-1 text-xs text-muted-foreground">
				Counts are your characters' bags and banks as the Guildie addon last read them. In game, a reagent's tooltip
				says how many more you need, counting the character you're on live.
			</p>
		</section>
	);
}

function CraftRow({ craft: c }: { craft: Craft }) {
	const track = useMutation(api.tracking.track).withOptimisticUpdate((store, { recipeId, quantity }) => {
		const current = store.getQuery(api.tracking.list, {});
		if (!current) return;
		store.setQuery(
			api.tracking.list,
			{},
			{
				...current,
				crafts: current.crafts.map((x) => (x.recipeId === recipeId ? { ...x, quantity: quantity ?? x.quantity } : x)),
			},
		);
	});
	const untrack = useMutation(api.tracking.untrack).withOptimisticUpdate((store, { recipeId }) => {
		const current = store.getQuery(api.tracking.list, {});
		if (current)
			store.setQuery(
				api.tracking.list,
				{},
				{ ...current, crafts: current.crafts.filter((x) => x.recipeId !== recipeId) },
			);
	});
	const set = (n: number) => void track({ recipeId: c.recipeId, quantity: Math.max(1, Math.min(999, n)) });
	const name = c.item?.name ?? c.name;
	return (
		<li className="flex items-start gap-3 px-3 py-2.5 text-[0.8125rem]">
			<span className="flex min-w-0 flex-1 items-start gap-2.5">
				{c.item ? (
					<ItemHover item={c.item} className="flex-none">
						<ItemIcon icon={c.item.icon} quality={c.item.quality} size={32} className="block" />
					</ItemHover>
				) : (
					<ItemIcon icon={ENCHANT_ICON} size={32} className="block flex-none" />
				)}
				<span className="min-w-0">
					<span className="block leading-snug" style={{ color: c.item ? QUALITY_COLORS[c.item.quality] : undefined }}>
						{name}
					</span>
					<span className="mt-0.5 block text-xs text-muted-foreground">
						{c.short === 0 ? (
							<span className="text-foreground/85">You have everything for it</span>
						) : (
							<>
								{c.short} {c.short === 1 ? "reagent" : "reagents"} short
							</>
						)}
						{" · "}
						<MadeBy who={c.crafters} profession={c.profession} />
					</span>
				</span>
			</span>
			<span className="flex flex-none flex-col items-end gap-1 sm:flex-row sm:items-center">
				<span className="inline-flex h-7 items-center rounded-md border border-input bg-well">
					<button
						type="button"
						onClick={() => set(c.quantity - 1)}
						disabled={c.quantity <= 1}
						className="h-full px-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
						aria-label="One fewer"
					>
						−
					</button>
					<span className="num min-w-6 text-center">{c.quantity}</span>
					<button
						type="button"
						onClick={() => set(c.quantity + 1)}
						className="h-full px-2 text-muted-foreground hover:text-foreground"
						aria-label="One more"
					>
						+
					</button>
				</span>
				<button
					type="button"
					onClick={() => void untrack({ recipeId: c.recipeId })}
					className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
					title="Stop tracking: crafted it, or changed your mind"
				>
					Done
				</button>
			</span>
		</li>
	);
}

/** "You make it (Wren)", "Maren makes it", "Maren, Joren +2 make it", or nobody in your guilds yet. */
function MadeBy({ who, profession }: { who: Person[]; profession: string }) {
	const yours = who.filter((w) => w.mine);
	if (yours.length) {
		return (
			<>
				You make it (<Names who={yours} profession={profession} />)
			</>
		);
	}
	if (who.length === 0) return <>Nobody in your guilds knows it</>;
	return (
		<>
			<Names who={who} profession={profession} /> {who.length === 1 ? "makes" : "make"} it
		</>
	);
}

function Names({ who, profession, max = 2 }: { who: Person[]; profession: string; max?: number }) {
	return (
		<>
			{who.slice(0, max).map((w, i) => (
				<span key={`${w.region}/${w.slug}`}>
					{i > 0 ? ", " : null}
					<Link
						to="/c/$region/$slug/professions"
						params={{ region: w.region, slug: w.slug }}
						search={{ profession }}
						className="hover:underline"
					>
						<ClassText classId={w.classId}>{w.name}</ClassText>
					</Link>
				</span>
			))}
			{who.length > max ? <span className="num"> +{who.length - max}</span> : null}
		</>
	);
}

function ReagentRow({ reagent: r }: { reagent: Reagent }) {
	const missing = Math.max(0, r.need - r.have);
	const item = { itemId: r.itemId, name: r.name, quality: r.quality, icon: r.icon };
	const where =
		r.where.length === 0
			? "None on your characters"
			: r.where.map((w, i) => (
					<span key={`${w.name}:${w.part}`}>
						{i > 0 ? " · " : null}
						<ClassText classId={w.classId}>{w.name}</ClassText> {w.part} <span className="num">{w.count}</span>
					</span>
				));
	const more =
		missing === 0 ? null : r.vendor ? (
			"Vendors sell it"
		) : r.madeBy ? (
			<MadeBy who={r.madeBy.crafters} profession={r.madeBy.profession} />
		) : (
			"Gather, buy or ask the guild"
		);
	return (
		<li className={cn(COLS, "flex items-start gap-3 px-3 py-2.5")}>
			<span className="flex min-w-0 flex-1 items-start gap-2.5">
				<ItemHover item={item} className="flex-none">
					<ItemIcon icon={r.icon} quality={r.quality} size={28} className="block" />
				</ItemHover>
				<span className="min-w-0">
					<ItemHover item={item} className="block leading-snug hover:underline">
						<span style={{ color: QUALITY_COLORS[r.quality] }}>{r.name}</span>
					</ItemHover>
					<span className="block text-xs text-muted-foreground">For {r.for.join(", ")}</span>
					{/* Phones: where and more from under the name, in the same column. */}
					<span className="mt-1 block text-xs text-muted-foreground sm:hidden">{where}</span>
					{more ? <span className="block text-xs text-muted-foreground sm:hidden">{more}</span> : null}
				</span>
			</span>
			<Need missing={missing} have={r.have} need={r.need} />
			<span className="truncate text-xs text-muted-foreground max-sm:hidden">{where}</span>
			<span className="truncate text-xs text-muted-foreground max-sm:hidden">{more ?? "Nothing, you have enough"}</span>
		</li>
	);
}

/** "5 more" over "have 4 of 9", or "Enough". */
function Need({ missing, have, need }: { missing: number; have: number; need: number }) {
	return (
		<span className="flex-none text-right leading-snug" title={`You have ${have}; your tracked crafts use ${need}`}>
			{missing === 0 ? (
				<span className="text-foreground/85">Enough</span>
			) : (
				<span className="num text-foreground">{missing} more</span>
			)}
			<span className="num block text-xs text-muted-foreground">
				{missing === 0 ? `have ${have}` : `have ${have} of ${need}`}
			</span>
		</span>
	);
}
