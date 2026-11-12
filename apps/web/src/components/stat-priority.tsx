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
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type DragEvent, type KeyboardEvent, useEffect, useState } from "react";
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
	custom: "Manual",
};

/** Shares for `n` stats from a preset. */
export const presetTiers = (key: Exclude<Steepness, "custom">, n: number) => TIER_PRESETS[key].slice(0, n);

/** The choice to save for the player's own stats (Balanced is the default, so left out). */
export function ownChoice(stats: string[], tiers: number[]) {
	return steepnessOf(tiers) === "balanced" ? { stats } : { stats, tiers };
}

const RANK =
	"num flex size-6 flex-none items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-xs text-muted-foreground";

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** A share as a bar (armor has none: it's counted per point of armor, not as a stat). */
function ShareBar({ stat, share }: { stat: string; share: number }) {
	if (stat === "ARMOR") return <span className="w-[7.5rem] flex-none" />;
	return (
		<span className="flex w-[7.5rem] flex-none items-center gap-2" title={`Counts ${pct(share)} as much as the first`}>
			<span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-well">
				<span className="absolute inset-y-0 left-0 rounded-full bg-foreground/70" style={{ width: pct(share) }} />
			</span>
			<span className="num w-8 text-right text-xs text-muted-foreground">{pct(share)}</span>
		</span>
	);
}

/**
 * Ranked rows, the first three: number, stat, what it does, and (the
 * player's own stats only) how much it counts. A tree's priority is a hand-written guide whose order
 * its weights don't always follow, so it gets no bars.
 */
function RankedStats({ stats, shares }: { stats: string[]; shares?: number[] }) {
	return (
		<ol className="space-y-1.5">
			{stats.slice(0, SHOWN_STATS).map((s, i) => (
				<li key={s} className="flex items-center gap-2.5">
					<span className={RANK}>{i + 1}</span>
					<span className="min-w-0 flex-1 leading-tight">
						<span className={cn("block text-[0.8125rem]", i === 0 && "font-semibold")}>{label(s)}</span>
						{STAT_HINTS[s] && <span className="block truncate text-xs text-muted-foreground">{STAT_HINTS[s]}</span>}
					</span>
					{shares ? <ShareBar stat={s} share={shares[i] ?? 1} /> : null}
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
	return `Custom${p.steepness ? ` · ${STEEPNESS_NAMES[p.steepness]}` : ""}`;
}

type Choice = { tree: number } | { stats: string[]; tiers?: number[] } | null;

/** The Gear tab's panel: what the character looks for. The claimant edits it on Preferences. */
export function StatPrioritySection({
	region,
	slug,
	classId,
	priority,
	canEdit,
	className: cls,
}: {
	region: string;
	slug: string;
	classId: number;
	priority: StatPriority | undefined;
	canEdit: boolean;
	className?: string;
}) {
	if (!priority) return null;
	const more = priority.stats.slice(SHOWN_STATS);
	return (
		<Panel
			title="Stats to look for"
			className={cls}
			action={
				canEdit && (
					<Link to="/c/$region/$slug/preferences" params={{ region, slug }} className={panelAction}>
						Edit
					</Link>
				)
			}
		>
			<RankedStats stats={priority.stats} shares={priority.chosen && !priority.tree ? priority.shares : undefined} />
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
		</Panel>
	);
}

/** "1.25", "1.7", "3": how many of a stat one point of the first is worth. */
const times = (n: number) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 100) / 100));

/** What each weighting does, in a few words. */
const WEIGHTING_HINTS: Record<Steepness, string> = {
	even: "Every stat counts nearly as much as the first",
	balanced: "Each stat counts a bit less than the one above",
	steep: "The first stat counts far more than the rest",
	custom: "You set how much each stat counts",
};

/** Even / Balanced / Steep / Manual, as a select. Balanced is the default. */
function WeightingSelect({ value, onChange }: { value: Steepness; onChange: (s: Steepness) => void }) {
	const options: { key: Steepness; name: string }[] = [...STEEPNESS, { key: "custom", name: STEEPNESS_NAMES.custom }];
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value as Steepness)}
			className="h-8 w-40 rounded-md border bg-well px-1.5 text-[0.8125rem] pointer-coarse:h-10 pointer-coarse:text-base"
		>
			{options.map((o) => (
				<option key={o.key} value={o.key}>
					{o.name}
					{o.key === "balanced" ? " (default)" : ""}
				</option>
			))}
		</select>
	);
}

/**
 * "How does this work?": every stat the player listed (up to five) with how
 * much it counts and what one point of the first is worth in it, then a
 * trade that shows what the weighting means for items.
 */
function HowWeightingWorks({ stats, tiers }: { stats: string[]; tiers: number[] }) {
	const first = stats[0];
	const firstIsStat = first !== "ARMOR";
	const last = stats
		.map((s, i) => ({ s, t: tiers[i] }))
		.slice(1)
		.filter((x) => x.s !== "ARMOR")
		.at(-1);
	// Give up 4 of the first for 8 of the last: worth it when the last counts more than half.
	const worth = last && 8 * last.t > 4;
	return (
		<details className="group surface-card text-[0.8125rem]">
			<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
				<HugeiconsIcon
					icon={ArrowRight01Icon}
					size={13}
					strokeWidth={2}
					className="transition-transform group-open:rotate-90"
				/>
				How does this work?
			</summary>
			<div className="space-y-3 border-t border-border px-3 pt-2.5 pb-3">
				<p className="text-xs text-muted-foreground">
					Gear suggestions add up an item's stats, each point times how much that stat counts. Your first stat counts
					fully; the weighting sets how much each one after it counts.
				</p>
				<table className="w-full text-left">
					<thead className="text-xs text-muted-foreground">
						<tr>
							<th className="w-8 py-1 font-normal">#</th>
							<th className="py-1 font-normal">Stat</th>
							<th className="py-1 text-right font-normal">Counts</th>
							{firstIsStat && <th className="py-1 pl-4 text-right font-normal">1 {label(first)} is worth</th>}
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{stats.map((s, i) => (
							<tr key={s}>
								<td className="num py-1.5 text-muted-foreground">{i + 1}</td>
								<td className={cn("py-1.5", i === 0 && "font-semibold")}>{label(s)}</td>
								{s === "ARMOR" ? (
									<td colSpan={firstIsStat ? 2 : 1} className="py-1.5 text-right text-xs text-muted-foreground">
										By points of armor, more the higher it's listed
									</td>
								) : (
									<>
										<td className="num py-1.5 text-right">{pct(tiers[i] ?? 1)}</td>
										{firstIsStat && (
											<td className="num py-1.5 pl-4 text-right">
												{times(1 / (tiers[i] ?? 1))} {label(s)}
											</td>
										)}
									</>
								)}
							</tr>
						))}
					</tbody>
				</table>
				<div className="space-y-1 text-xs text-muted-foreground">
					<p>Stats you didn't list still count, but less than your last one.</p>
					{firstIsStat && last && (
						<p>
							Say an item gives 4 less {label(first)} and 8 more {label(last.s)}:{" "}
							<span className="text-foreground">{worth ? "worth it" : "not worth it"}</span>. Items like that show as
							trade-offs, never as plain upgrades.
						</p>
					)}
				</div>
			</div>
		</details>
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

/** The choice a priority stands for, to tell whether the editor changed it. */
function choiceOf(p: StatPriority, trees: { name: string }[]): Choice {
	if (!p.chosen) return null;
	if (p.tree) return { tree: trees.findIndex((t) => t.name === p.tree) };
	return ownChoice(p.stats, p.shares);
}

/** The first three stats, "Strength, Agility, Stamina". */
const topStats = (p: StatPriority | undefined) => p?.stats.slice(0, SHOWN_STATS).map(label).join(", ");

/**
 * Preferences: where the stats to look for come from (talents, a tree, or the
 * player's own), and for their own: which, in what order, and how much each
 * counts. Saved with Save; gear suggestions follow.
 */
export function StatPriorityEditor({
	region,
	slug,
	classId,
	priority,
	talentTrees,
	onDirtyChange,
}: {
	region: string;
	slug: string;
	classId: number;
	priority: StatPriority;
	talentTrees: Parameters<typeof statPriority>[1];
	/** Told whether there are changes that aren't saved (the page asks before leaving). */
	onDirtyChange?: (dirty: boolean) => void;
}) {
	const trees = SPECS[CLASS_TOKENS[classId] ?? ""] ?? [];
	const fromTalents = statPriority(classId, talentTrees);
	const set = useMutation(api.statPriority.set);
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
	const [saved, setSaved] = useState(false);
	const reorder = useReorder((from, to) => setOwn((o) => moved(o, from, to)));

	const tiers = steepness === "custom" ? custom : presetTiers(steepness, own.length);
	const choice: Choice = mode === "talents" ? null : mode === "own" ? ownChoice(own, tiers) : { tree: mode };
	const changed = JSON.stringify(choice) !== JSON.stringify(choiceOf(priority, trees));
	const duplicate = mode === "own" && new Set(own).size < own.length;
	useEffect(() => onDirtyChange?.(changed), [changed, onDirtyChange]);

	const edit =
		<T,>(fn: (v: T) => void) =>
		(v: T) => {
			setSaved(false);
			fn(v);
		};
	const pick = (m: "talents" | "own" | number) => {
		setSaved(false);
		setMode(m);
	};
	const resize = (stats: string[]) => {
		setSaved(false);
		setOwn(stats);
		setCustom((c) => {
			const next = c.slice(0, stats.length);
			while (next.length < stats.length) next.push(Math.max(0.1, Math.round(((next.at(-1) ?? 1) - 0.1) * 100) / 100));
			return next;
		});
	};
	const setShare = (i: number, value: number) => {
		setSaved(false);
		setCustom((c) => {
			const next = [...c];
			next[i] = value;
			// Never more than the one before; those after follow it down.
			for (let j = i + 1; j < next.length; j++) next[j] = Math.min(next[j], next[j - 1]);
			for (let j = i - 1; j >= 1; j--) next[j] = Math.max(next[j], next[j + 1]);
			return next;
		});
	};
	const save = async () => {
		setSaving(true);
		setError(undefined);
		try {
			await set({ region: region as Region, slug, choice });
			setSaved(true);
		} catch (err) {
			setError(err instanceof ConvexError ? String(err.data) : "Couldn't save. Try again.");
		} finally {
			setSaving(false);
		}
	};
	const preview =
		mode === "talents" ? fromTalents : typeof mode === "number" ? statPriority(classId, [], { tree: mode }) : undefined;

	return (
		<div className="space-y-5">
			<div role="radiogroup" aria-label="Where the stats come from" className="grid gap-2 @xl:grid-cols-2">
				<OptionCard
					active={mode === "talents"}
					onClick={() => pick("talents")}
					title="From talents"
					detail={fromTalents ? `${fromTalents.tree}: ${topStats(fromTalents)}` : "Follows their main tree"}
				/>
				{trees.map((t, i) => (
					<OptionCard
						key={t.name}
						active={mode === i}
						onClick={() => pick(i)}
						title={t.name}
						detail={topStats(statPriority(classId, [], { tree: i }))}
					/>
				))}
				<OptionCard
					active={mode === "own"}
					onClick={() => pick("own")}
					title="Custom"
					detail={`Pick ${MIN_STATS} to ${MAX_STATS} stats and how much each counts`}
				/>
			</div>

			{mode === "own" ? (
				<div className="space-y-4">
					<ol className="surface-card divide-y divide-border">
						{own.map((stat, i) => (
							<li
								key={stat}
								{...reorder.target(i)}
								className={cn("flex items-center gap-2.5 px-2 py-1.5", reorder.dragging === i && "opacity-50")}
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
									onChange={(e) => edit(setOwn)(own.map((s, j) => (j === i ? e.target.value : s)))}
									className="h-8 w-40 min-w-0 flex-none rounded-md border bg-well px-1.5 text-[0.8125rem] pointer-coarse:h-10 pointer-coarse:text-base @max-md:w-auto @max-md:flex-1"
								>
									{Object.entries(PRIORITY_STATS).map(([key, name]) => (
										<option key={key} value={key} disabled={key !== stat && own.includes(key)}>
											{name}
										</option>
									))}
								</select>
								<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground @max-md:hidden">
									{STAT_HINTS[stat]}
									{i >= SHOWN_STATS && " · not shown"}
								</span>
								{steepness === "custom" && i > 0 && stat !== "ARMOR" ? (
									<span className="flex w-[7.5rem] flex-none items-center gap-2 @max-md:w-24">
										<input
											type="range"
											min={10}
											max={100}
											step={5}
											value={Math.round(custom[i] * 100)}
											aria-label={`How much ${label(stat)} counts next to ${label(own[0])}`}
											onChange={(e) => setShare(i, Number(e.target.value) / 100)}
											className="min-w-0 flex-1 accent-[var(--foreground)]"
										/>
										<span className="num w-8 text-right text-xs text-muted-foreground">{pct(custom[i])}</span>
									</span>
								) : (
									<ShareBar stat={stat} share={tiers[i] ?? 1} />
								)}
								{own.length > MIN_STATS ? (
									<button
										type="button"
										aria-label={`Remove ${label(stat)}`}
										onClick={() => resize(own.filter((_, j) => j !== i))}
										className="flex size-8 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
									>
										×
									</button>
								) : (
									<span className="size-8 flex-none" />
								)}
							</li>
						))}
					</ol>
					{own.length < MAX_STATS ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								const next = Object.keys(PRIORITY_STATS).find((k) => !own.includes(k));
								if (next) resize([...own, next]);
							}}
						>
							Add a stat
						</Button>
					) : null}
					{duplicate && <p className="text-xs text-muted-foreground">Pick different stats.</p>}

					<div className="space-y-2.5">
						<label className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
							<span className="text-[0.8125rem] font-medium">Weighting</span>
							<WeightingSelect
								value={steepness}
								onChange={edit((next: Steepness) => {
									// Manual starts from where the preset was.
									if (next === "custom" && steepness !== "custom") setCustom(presetTiers(steepness, own.length));
									setSteepness(next);
								})}
							/>
							<span className="text-xs text-muted-foreground">{WEIGHTING_HINTS[steepness]}</span>
						</label>
						{steepness === "custom" && (
							<p className="text-xs text-muted-foreground">
								Drag each stat's slider. A stat can count at most as much as the one above it.
							</p>
						)}
						{!duplicate && <HowWeightingWorks stats={own} tiers={tiers} />}
					</div>
				</div>
			) : preview ? (
				<div className="surface-card px-3 py-2.5">
					<RankedStats stats={preview.stats} />
				</div>
			) : null}

			{error && <p className="text-sm text-destructive">{error}</p>}
			<div className="flex items-center gap-3 border-t border-border pt-4">
				<Button onClick={save} disabled={saving || duplicate || !changed}>
					{saving ? "Saving…" : "Save"}
				</Button>
				<span className="text-xs text-muted-foreground">
					{saved && !changed
						? "Saved. Gear suggestions follow it now; guildmates' addons after their next refresh."
						: changed
							? "Not saved yet."
							: "Gear suggestions follow these: Upgrades for me, the item panel and the addon."}
				</span>
			</div>
		</div>
	);
}

/** One choice of where the stats come from: a name and what it means. */
function OptionCard({
	active,
	onClick,
	title,
	detail,
}: {
	active: boolean;
	onClick: () => void;
	title: string;
	detail?: string;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={active}
			onClick={onClick}
			className={cn(
				"surface-card px-3 py-2 text-left",
				// The chosen one: warm fill and an amber edge, like an active chip.
				active && "bg-selected shadow-[inset_0_0_0_1px_rgb(255_176_96/0.28)] hover:bg-selected",
			)}
		>
			<span className={cn("block text-[0.8125rem]", active && "font-semibold")}>{title}</span>
			{detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
		</button>
	);
}
