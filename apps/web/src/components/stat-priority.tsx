import { api } from "@convex/_generated/api";
import { PRIORITY_STATS, type StatPriority, statPriority } from "@convex/shared/statPriority";
import { CLASS_TOKENS, SPECS } from "@convex/shared/weights";
import { className, type Region } from "@convex/shared/wow";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type ReactNode, useState } from "react";
import { Panel, panelAction } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Stat priority: the three stats a character looks for on gear, first to
// third (convex/shared/statPriority.ts). From their main talent tree unless
// the player who claimed them chose otherwise.

const label = (stat: string) => PRIORITY_STATS[stat] ?? stat;

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

const RANK =
	"num flex size-6 flex-none items-center justify-center rounded-md border border-border bg-well text-xs text-muted-foreground";

/** Ranked rows: number, stat, what it does. The character page's panel. */
function RankedStats({ stats }: { stats: string[] }) {
	return (
		<ol className="space-y-1.5">
			{stats.map((s, i) => (
				<li key={s} className="flex items-center gap-2.5">
					<span className={RANK}>{i + 1}</span>
					<span className="min-w-0 leading-tight">
						<span className={cn("block text-[0.8125rem]", i === 0 && "font-semibold")}>{label(s)}</span>
						{STAT_HINTS[s] && <span className="block truncate text-xs text-muted-foreground">{STAT_HINTS[s]}</span>}
					</span>
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
	return p.tree ? `${p.tree}, set by the player` : "Set by the player";
}

type Choice = { tree: number } | { stats: string[] } | null;

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
					fromTalents={statPriority(classId, talentTrees)?.stats ?? []}
					onDone={() => setEditing(false)}
				/>
			) : (
				<>
					<RankedStats stats={priority.stats} />
					<div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
						<span className="min-w-0 truncate" title="A general guide for leveling and dungeons">
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
	fromTalents: string[];
	onDone: () => void;
}) {
	const trees = SPECS[CLASS_TOKENS[classId] ?? ""] ?? [];
	const set = useMutation(api.statPriority.set);
	// What the picker starts on: the current choice, if any.
	const startTree = priority.chosen && priority.tree ? trees.findIndex((t) => t.name === priority.tree) : -1;
	const [mode, setMode] = useState<"talents" | "own" | number>(
		!priority.chosen ? "talents" : startTree >= 0 ? startTree : "own",
	);
	const [own, setOwn] = useState<string[]>(priority.stats);
	const [error, setError] = useState<string>();
	const [saving, setSaving] = useState(false);

	const save = async () => {
		const choice: Choice = mode === "talents" ? null : mode === "own" ? { stats: own } : { tree: mode };
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
	const duplicate = mode === "own" && new Set(own).size < 3;

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
				<div className="space-y-1.5">
					{[0, 1, 2].map((i) => (
						<label key={i} className="flex items-center gap-2.5 text-[0.8125rem]">
							<span className={RANK}>{i + 1}</span>
							<select
								aria-label={`Stat ${i + 1}`}
								value={own[i]}
								onChange={(e) => setOwn((o) => o.map((s, j) => (j === i ? e.target.value : s)))}
								className="h-8 min-w-0 flex-1 rounded-md border bg-well px-1.5 text-[0.8125rem] pointer-coarse:h-10 pointer-coarse:text-base"
							>
								{Object.entries(PRIORITY_STATS).map(([key, name]) => (
									<option key={key} value={key}>
										{name}
									</option>
								))}
							</select>
						</label>
					))}
				</div>
			) : (
				<RankedStats stats={mode === "talents" ? fromTalents : (trees[mode]?.stats ?? [])} />
			)}
			{duplicate && <p className="text-xs text-muted-foreground">Pick three different stats.</p>}
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
