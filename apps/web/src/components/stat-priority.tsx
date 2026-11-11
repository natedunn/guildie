import { api } from "@convex/_generated/api";
import {
	MAX_STATS,
	MIN_STATS,
	PRIORITY_STATS,
	type StatPriority,
	type Steepness,
	statPriority,
	steepnessOf,
	TIER_PRESETS,
} from "@convex/shared/statPriority";
import { CLASS_TOKENS, SPECS } from "@convex/shared/weights";
import { className, type Region } from "@convex/shared/wow";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type DragEvent, type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { Panel, panelAction } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Stat priority: the stats a character looks for on gear, first to last
// (convex/shared/statPriority.ts), and how much each counts next to the
// first. From their main talent tree unless the player who claimed them
// chose otherwise: another tree, or their own three to five with a
// steepness (Even, Balanced, Steep, or their own shares). Pages show the
// first three; the rest count behind the scenes.

const label = (stat: string) => PRIORITY_STATS[stat] ?? stat;

/** Stats pages show; a player's fourth and fifth count in suggestions only. */
export const SHOWN_STATS = 3;

/** What each stat does, in a few words (Classic's rules). */
const STAT_HINTS: Record<string, string> = {
	STRENGTH: "Melee attack power",
	AGILITY: "Crit, dodge and armor",
	STAMINA: "Health",
	INTELLECT: "Mana and spell crit",
	SPIRIT: "Health and mana regen",
	ATTACK_POWER: "Weapon damage",
	SPELL_DAMAGE_DONE: "Damage from spells",
	SPELL_HEALING_DONE: "Healing from spells",
	CRIT_RATING: "Chance of a critical hit",
	HIT_RATING: "Fewer misses",
	DEFENSE_SKILL_RATING: "Fewer hits and crits taken",
	MANA_REGENERATION: "Mana while casting",
	ARMOR: "Less physical damage",
};

export const STEEPNESS: { key: Exclude<Steepness, "custom">; name: string }[] = [
	{ key: "even", name: "Even" },
	{ key: "balanced", name: "Balanced" },
	{ key: "steep", name: "Steep" },
];

const STEEPNESS_NAMES: Record<Steepness, string> = {
	even: "Even",
	balanced: "Balanced",
	steep: "Steep",
	custom: "Custom",
};

/** Shares for `n` stats from a preset. */
export const presetTiers = (key: Exclude<Steepness, "custom">, n: number) => TIER_PRESETS[key].slice(0, n);

/** The choice to save for the player's own stats (Balanced is the default, so left out). */
export function ownChoice(stats: string[], tiers: number[]) {
	return steepnessOf(tiers) === "balanced" ? { stats } : { stats, tiers };
}

const RANK =
	"num flex size-6 flex-none items-center justify-center rounded-md border border-border bg-well text-xs text-muted-foreground";

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** A share as a bar (armor has none: it's counted per point of armor, not as a stat). */
function ShareBar({ stat, share }: { stat: string; share: number }) {
	if (stat === "ARMOR") return <span className="w-[7.5rem] flex-none" />;
	return (
		<span className="flex w-[7.5rem] flex-none items-center gap-2" title={`Counts ${pct(share)} as much as the first`}>
			<span className="relative h-1.5 flex-1 overflow-hidden rounded-full border border-border bg-well">
				<span className="absolute inset-y-0 left-0 rounded-full bg-foreground/70" style={{ width: pct(share) }} />
			</span>
			<span className="num w-8 text-right text-xs text-muted-foreground">{pct(share)}</span>
		</span>
	);
}

/** Ranked rows: number, stat, what it does, how much it counts. The first three only. */
function RankedStats({ stats, shares }: { stats: string[]; shares: number[] }) {
	return (
		<ol className="space-y-1.5">
			{stats.slice(0, SHOWN_STATS).map((s, i) => (
				<li key={s} className="flex items-center gap-2.5">
					<span className={RANK}>{i + 1}</span>
					<span className="min-w-0 flex-1 leading-tight">
						<span className={cn("block text-[0.8125rem]", i === 0 && "font-semibold")}>{label(s)}</span>
						{STAT_HINTS[s] && <span className="block truncate text-xs text-muted-foreground">{STAT_HINTS[s]}</span>}
					</span>
					<ShareBar stat={s} share={shares[i] ?? 1} />
				</li>
			))}
		</ol>
	);
}

/** Wowhead's guides for the class (Classic Era's; Forever plays like it). */
const wowheadGuides = (classId: number) =>
	`https://www.wowhead.com/classic/guides/classes/${className(classId).toLowerCase()}`;

/** Where the priority comes from, in a few words. */
function sourceText(p: StatPriority) {
	if (!p.chosen) return `From ${p.tree} talents`;
	if (p.tree) return `${p.tree}, set by the player`;
	return `Set by the player${p.steepness ? ` · ${STEEPNESS_NAMES[p.steepness]}` : ""}`;
}

type Choice = { tree: number } | { stats: string[]; tiers?: number[] } | null;

/** The character page's panel, with the claimant's picker. */
export function StatPrioritySection({
	region,
	slug,
	classId,
	priority,
	talentTrees,
	canEdit,
	className: cls,
}: {
	region: string;
	slug: string;
	classId: number;
	priority: StatPriority | undefined;
	talentTrees: Parameters<typeof statPriority>[1];
	canEdit: boolean;
	className?: string;
}) {
	const [editing, setEditing] = useState(false);
	if (!priority) return null;
	const more = priority.stats.slice(SHOWN_STATS);
	return (
		<Panel
			title="Stats to look for"
			className={cls}
			action={
				canEdit &&
				!editing && (
					<button type="button" onClick={() => setEditing(true)} className={panelAction}>
						Change
					</button>
				)
			}
		>
			{editing ? (
				<StatPicker
					region={region}
					slug={slug}
					classId={classId}
					priority={priority}
					fromTalents={statPriority(classId, talentTrees)}
					onDone={() => setEditing(false)}
				/>
			) : (
				<>
					<RankedStats stats={priority.stats} shares={priority.shares} />
					{canEdit && more.length > 0 && (
						<p className="mt-2 text-xs text-muted-foreground">Also counted: {more.map(label).join(", ")}</p>
					)}
					<div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
						<span
							className="min-w-0 truncate"
							title="A general guide for leveling and dungeons. Gear suggestions use it too."
						>
							{sourceText(priority)}
						</span>
						<a
							href={wowheadGuides(classId)}
							target="_blank"
							rel="noreferrer"
							className="flex-none text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
						>
							Wowhead
						</a>
					</div>
				</>
			)}
		</Panel>
	);
}

/** "1.25", "1.7", "3": how many of a stat one point of the first is worth. */
const times = (n: number) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 100) / 100));

/**
 * What the shares mean in plain words: "1 Strength counts as much as 1.25
 * Intellect or 1.7 Agility", and a trade that shows the steepness.
 */
function SharesInWords({ stats, tiers }: { stats: string[]; tiers: number[] }) {
	const shown = stats
		.slice(0, SHOWN_STATS)
		.map((s, i) => ({ s, t: tiers[i] }))
		.filter((x) => x.s !== "ARMOR");
	const [first, ...rest] = shown;
	if (!first || rest.length === 0 || first.s !== stats[0]) return null;
	const last = rest[rest.length - 1];
	// Give up 4 of the first for 8 of the last: worth it when the last counts more than half.
	const worth = 8 * last.t > 4;
	return (
		<div className="space-y-1 text-xs text-muted-foreground">
			<p>
				1 <span className="text-foreground">{label(first.s)}</span> counts as much as{" "}
				{rest.map((x, i) => (
					<span key={x.s}>
						{i > 0 ? " or " : null}
						<span className="text-foreground">
							{times(1 / x.t)} {label(x.s)}
						</span>
					</span>
				))}
				. Stats you didn't list count less than the last.
			</p>
			<p>
				Giving up 4 {label(first.s)} for 8 {label(last.s)}:{" "}
				<span className="text-foreground">{worth ? "worth it" : "not worth it"}</span>. Such items show as trade-offs,
				never as plain upgrades.
			</p>
		</div>
	);
}

/** Even / Balanced / Steep (/ Custom): a segmented control. */
export function SteepnessControl({
	value,
	onChange,
	custom,
	disabled,
	size = "md",
}: {
	value: Steepness | undefined;
	onChange: (s: Steepness) => void;
	/** Offer Custom (the editor); elsewhere it only shows when it's set. */
	custom?: boolean;
	disabled?: boolean;
	size?: "sm" | "md";
}) {
	const options: { key: Steepness; name: string }[] = [
		...STEEPNESS,
		...(custom || value === "custom" ? [{ key: "custom" as const, name: "Custom" }] : []),
	];
	return (
		<div
			role="radiogroup"
			aria-label="How much more the first stat counts"
			className={cn("flex rounded-md border border-border bg-well p-0.5", size === "sm" ? "w-auto" : "w-full")}
		>
			{options.map((o) => (
				<button
					key={o.key}
					type="button"
					role="radio"
					aria-checked={value === o.key}
					disabled={disabled || (o.key === "custom" && !custom)}
					onClick={() => onChange(o.key)}
					className={cn(
						"rounded-[4px] text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground",
						size === "sm" ? "px-2.5 py-0.5" : "flex-1 py-1",
						value === o.key && "bg-selected text-foreground disabled:hover:text-foreground",
					)}
				>
					{o.name}
				</button>
			))}
		</div>
	);
}

/** Moves item `from` to `to`. */
export function moved<T>(list: T[], from: number, to: number) {
	const out = [...list];
	const [x] = out.splice(from, 1);
	out.splice(to, 0, x);
	return out;
}

/**
 * Drag to reorder (and Alt+arrow keys on the handle): `onMove(from, to)` as
 * the dragged row passes another.
 */
export function useReorder(onMove: (from: number, to: number) => void, onDrop?: () => void) {
	const [dragging, setDragging] = useState<number>();
	return {
		dragging,
		handle: (i: number, count: number, axis: "x" | "y") => ({
			draggable: true,
			onDragStart: (e: DragEvent) => {
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", String(i));
				setDragging(i);
			},
			onDragEnd: () => {
				setDragging(undefined);
				onDrop?.();
			},
			onKeyDown: (e: KeyboardEvent) => {
				const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
				const forward = axis === "x" ? "ArrowRight" : "ArrowDown";
				if (!e.altKey || (e.key !== back && e.key !== forward)) return;
				const to = e.key === back ? i - 1 : i + 1;
				if (to < 0 || to >= count) return;
				e.preventDefault();
				onMove(i, to);
				onDrop?.();
			},
		}),
		target: (i: number) => ({
			onDragOver: (e: DragEvent) => {
				if (dragging === undefined) return;
				e.preventDefault();
				if (dragging !== i) {
					onMove(dragging, i);
					setDragging(i);
				}
			},
		}),
	};
}

/** A two-dot grip, the handle rows and pills are dragged by. */
export function Grip() {
	return (
		<svg viewBox="0 0 6 10" aria-hidden className="h-2.5 w-1.5 fill-current">
			{[1, 5, 9].flatMap((y) => [
				<circle key={`a${y}`} cx="1" cy={y} r="1" />,
				<circle key={`b${y}`} cx="5" cy={y} r="1" />,
			])}
		</svg>
	);
}

function StatPicker({
	region,
	slug,
	classId,
	priority,
	fromTalents,
	onDone,
}: {
	region: string;
	slug: string;
	classId: number;
	priority: StatPriority;
	fromTalents: StatPriority | undefined;
	onDone: () => void;
}) {
	const trees = SPECS[CLASS_TOKENS[classId] ?? ""] ?? [];
	const set = useMutation(api.statPriority.set);
	// What the picker starts on: the current choice, if any.
	const startTree = priority.chosen && priority.tree ? trees.findIndex((t) => t.name === priority.tree) : -1;
	const isOwn = priority.chosen && !priority.tree;
	const [mode, setMode] = useState<"talents" | "own" | number>(
		!priority.chosen ? "talents" : startTree >= 0 ? startTree : "own",
	);
	const [own, setOwn] = useState<string[]>(priority.stats);
	const [steepness, setSteepness] = useState<Steepness>(isOwn ? (priority.steepness ?? "balanced") : "balanced");
	const [custom, setCustom] = useState<number[]>(
		isOwn ? priority.shares : presetTiers("balanced", priority.stats.length),
	);
	const [error, setError] = useState<string>();
	const [saving, setSaving] = useState(false);
	const reorder = useReorder((from, to) => {
		setOwn((o) => moved(o, from, to));
	});

	const tiers = steepness === "custom" ? custom : presetTiers(steepness, own.length);

	const resize = (stats: string[]) => {
		setOwn(stats);
		setCustom((c) => {
			const next = c.slice(0, stats.length);
			while (next.length < stats.length) next.push(Math.max(0.1, Math.round(((next.at(-1) ?? 1) - 0.1) * 100) / 100));
			return next;
		});
	};
	const setShare = (i: number, value: number) =>
		setCustom((c) => {
			const next = [...c];
			next[i] = value;
			// Never more than the one before; those after follow it down.
			for (let j = i + 1; j < next.length; j++) next[j] = Math.min(next[j], next[j - 1]);
			for (let j = i - 1; j >= 1; j--) next[j] = Math.max(next[j], next[j + 1]);
			return next;
		});

	const save = async () => {
		const choice: Choice = mode === "talents" ? null : mode === "own" ? ownChoice(own, tiers) : { tree: mode };
		setSaving(true);
		setError(undefined);
		try {
			await set({ region: region as Region, slug, choice });
			onDone();
		} catch (err) {
			setError(err instanceof ConvexError ? String(err.data) : "Couldn't save. Try again.");
		} finally {
			setSaving(false);
		}
	};
	const duplicate = mode === "own" && new Set(own).size < own.length;
	const preview =
		mode === "talents" ? fromTalents : typeof mode === "number" ? statPriority(classId, [], { tree: mode }) : undefined;

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap gap-1" role="group" aria-label="Stat priority from">
				<Chip active={mode === "talents"} onClick={() => setMode("talents")}>
					From talents
				</Chip>
				{trees.map((t, i) => (
					<Chip key={t.name} active={mode === i} onClick={() => setMode(i)}>
						{t.name}
					</Chip>
				))}
				<Chip active={mode === "own"} onClick={() => setMode("own")}>
					My own
				</Chip>
			</div>
			{mode === "own" ? (
				<>
					<ol className="space-y-1.5">
						{own.map((stat, i) => (
							<li
								key={stat}
								{...reorder.target(i)}
								className={cn("flex items-center gap-2", reorder.dragging === i && "opacity-50")}
							>
								<button
									type="button"
									aria-label={`Move ${label(stat)} (Alt+arrow keys)`}
									className="flex h-8 w-4 flex-none cursor-grab items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
									{...reorder.handle(i, own.length, "y")}
								>
									<Grip />
								</button>
								<span className={RANK}>{i + 1}</span>
								<select
									aria-label={`Stat ${i + 1}`}
									value={stat}
									onChange={(e) => setOwn((o) => o.map((s, j) => (j === i ? e.target.value : s)))}
									className="h-8 min-w-0 flex-1 rounded-md border bg-well px-1.5 text-[0.8125rem] pointer-coarse:h-10 pointer-coarse:text-base"
								>
									{Object.entries(PRIORITY_STATS).map(([key, name]) => (
										<option key={key} value={key} disabled={key !== stat && own.includes(key)}>
											{name}
										</option>
									))}
								</select>
								{own.length > MIN_STATS ? (
									<button
										type="button"
										aria-label={`Remove ${label(stat)}`}
										onClick={() => resize(own.filter((_, j) => j !== i))}
										className="flex size-8 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
									>
										×
									</button>
								) : null}
							</li>
						))}
					</ol>
					{own.length < MAX_STATS ? (
						<button
							type="button"
							onClick={() => {
								const next = Object.keys(PRIORITY_STATS).find((k) => !own.includes(k));
								if (next) resize([...own, next]);
							}}
							className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						>
							Add a stat ({own.length} of {MAX_STATS}; pages show the first {SHOWN_STATS})
						</button>
					) : null}
					<div className="space-y-2 border-t border-border pt-3">
						<p className="text-xs text-muted-foreground">How much more does your first stat count?</p>
						<SteepnessControl
							value={steepness}
							onChange={(next) => {
								// Custom starts from where the preset was.
								if (next === "custom" && steepness !== "custom") setCustom(presetTiers(steepness, own.length));
								setSteepness(next);
							}}
							custom
						/>
						{steepness === "custom" ? (
							<ol className="space-y-1.5 pt-1">
								{own.map((stat, i) => (
									<li key={stat} className="flex items-center gap-2.5 text-[0.8125rem]">
										<span className={RANK}>{i + 1}</span>
										<span className="min-w-0 flex-1 truncate">{label(stat)}</span>
										<input
											type="range"
											min={10}
											max={100}
											step={5}
											value={Math.round(custom[i] * 100)}
											disabled={i === 0}
											aria-label={`How much ${label(stat)} counts next to ${label(own[0])}`}
											onChange={(e) => setShare(i, Number(e.target.value) / 100)}
											className="w-24 flex-none accent-[var(--foreground)] disabled:opacity-60"
										/>
										<span className="num w-9 text-right text-xs text-muted-foreground">{pct(custom[i])}</span>
									</li>
								))}
							</ol>
						) : null}
						{!duplicate && <SharesInWords stats={own} tiers={tiers} />}
					</div>
				</>
			) : preview ? (
				<RankedStats stats={preview.stats} shares={preview.shares} />
			) : null}
			{duplicate && <p className="text-xs text-muted-foreground">Pick different stats.</p>}
			<p className="text-xs text-muted-foreground">
				Gear suggestions follow it: Upgrades for me and the item panel right away, guildmates' tooltips in game after
				their Guildie app's next refresh.
			</p>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<div className="flex gap-2 border-t border-border pt-3">
				<Button size="sm" onClick={save} disabled={saving || duplicate}>
					Save
				</Button>
				<Button size="sm" variant="ghost" onClick={onDone} disabled={saving}>
					Cancel
				</Button>
			</div>
		</div>
	);
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
	return (
		<button type="button" aria-pressed={active} className="chip" data-active={active} onClick={onClick}>
			{children}
		</button>
	);
}

/**
 * "Upgrades for me": a character's first three stats, dragged into another
 * order, and the steepness, saved to the character right away (the same
 * choice as the character page; suggestions follow on the next query). A
 * tree's priority becomes the player's own on the first change.
 */
export function PriorityStrip({
	region,
	slug,
	name,
	priority,
}: {
	region: string;
	slug: string;
	name: ReactNode;
	priority: StatPriority;
}) {
	const set = useMutation(api.statPriority.set);
	const [order, setOrder] = useState<string[]>();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();
	const stats = order ?? priority.stats;
	const own = priority.chosen && !priority.tree;
	const tiers = own ? priority.shares : presetTiers("balanced", priority.stats.length);

	const save = async (next: string[], nextTiers: number[]) => {
		setSaving(true);
		setError(undefined);
		try {
			await set({ region: region as Region, slug, choice: ownChoice(next, nextTiers) });
		} catch (err) {
			setError(err instanceof ConvexError ? String(err.data) : "Couldn't save.");
		} finally {
			setSaving(false);
			setOrder(undefined);
		}
	};
	// The order while dragging (state for the render, a ref for the drop).
	const dragged = useRef<string[]>(undefined);
	const reorder = useReorder(
		(from, to) => {
			dragged.current = moved(dragged.current ?? priority.stats, from, to);
			setOrder(dragged.current);
		},
		() => {
			const o = dragged.current;
			dragged.current = undefined;
			if (o?.some((s, i) => s !== priority.stats[i])) void save(o, tiers);
			else setOrder(undefined);
		},
	);

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface px-3 py-2">
			<span className="text-[0.8125rem] font-medium">{name}</span>
			<ol className="flex flex-wrap items-center gap-1" aria-label="Stats to look for, first to third">
				{stats.slice(0, SHOWN_STATS).map((stat, i) => (
					<li key={stat} {...reorder.target(i)} className="flex items-center gap-1">
						{i > 0 ? <span className="text-xs text-muted-foreground/60">›</span> : null}
						<button
							type="button"
							disabled={saving}
							aria-label={`${i + 1}. ${label(stat)}: drag, or Alt+arrow keys, to move`}
							title="Drag to reorder"
							className={cn(
								"flex h-6 cursor-grab items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-well px-2 text-[0.8125rem] active:cursor-grabbing",
								reorder.dragging === i && "opacity-50",
							)}
							{...reorder.handle(i, SHOWN_STATS, "x")}
						>
							<span className="text-muted-foreground/60">
								<Grip />
							</span>
							{label(stat)}
						</button>
					</li>
				))}
			</ol>
			{!own ? (
				<span className="text-xs text-muted-foreground">
					{priority.chosen ? priority.tree : `From ${priority.tree} talents`}
				</span>
			) : null}
			{error ? <span className="text-xs text-destructive">{error}</span> : null}
			<span className="ml-auto">
				<SteepnessControl
					size="sm"
					value={own ? priority.steepness : undefined}
					disabled={saving}
					onChange={(s) => {
						if (s !== "custom") void save(stats, presetTiers(s, stats.length));
					}}
				/>
			</span>
		</div>
	);
}
