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

/** Reagent table columns: reagent, have/need, where you have them, where to get more. Stacked when narrow. */
const COLS =
	"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1.2fr)_4.5rem_minmax(0,1fr)_minmax(0,1fr)]";

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
					<span className="text-right">Have</span>
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
		<li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-[0.8125rem]">
			<span className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
				{c.item ? (
					<ItemHover item={c.item} className="flex-none">
						<ItemIcon icon={c.item.icon} quality={c.item.quality} size={32} className="block" />
					</ItemHover>
				) : (
					<ItemIcon icon={ENCHANT_ICON} size={32} className="block flex-none" />
				)}
				<span className="min-w-0">
					<span className="block truncate" style={{ color: c.item ? QUALITY_COLORS[c.item.quality] : undefined }}>
						{name}
					</span>
					<span className="block truncate text-xs text-muted-foreground">
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
			<span className="flex flex-none items-center gap-1">
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
	const done = r.have >= r.need;
	return (
		<li className={cn(COLS, "px-3 py-2")}>
			<ItemHover
				item={{ itemId: r.itemId, name: r.name, quality: r.quality, icon: r.icon }}
				className="flex min-w-0 items-center gap-2.5"
			>
				<ItemIcon icon={r.icon} quality={r.quality} size={28} className="block flex-none" />
				<span className="min-w-0">
					<span className="block truncate hover:underline" style={{ color: QUALITY_COLORS[r.quality] }}>
						{r.name}
					</span>
					<span className="block truncate text-xs text-muted-foreground" title={r.for.join(", ")}>
						For {r.for.join(", ")}
					</span>
				</span>
			</ItemHover>
			<span className={cn("num text-right whitespace-nowrap", done ? "text-foreground/85" : "text-foreground")}>
				{r.have}
				<span className="text-muted-foreground"> / {r.need}</span>
			</span>
			<span className="col-span-2 truncate text-xs text-muted-foreground sm:col-span-1">
				{r.where.length === 0
					? "None on your characters"
					: r.where.map((w, i) => (
							<span key={`${w.name}:${w.part}`}>
								{i > 0 ? " · " : null}
								<ClassText classId={w.classId}>{w.name}</ClassText> {w.part} <span className="num">{w.count}</span>
							</span>
						))}
			</span>
			<span className="col-span-2 truncate text-xs text-muted-foreground sm:col-span-1">
				{done ? (
					"Enough"
				) : r.vendor ? (
					"Vendors sell it"
				) : r.madeBy ? (
					<MadeBy who={r.madeBy.crafters} profession={r.madeBy.profession} />
				) : (
					"Gather, buy or ask the guild"
				)}
			</span>
		</li>
	);
}
