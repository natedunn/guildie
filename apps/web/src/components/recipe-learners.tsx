import { RECIPE_STATES, type RecipeState } from "@convex/shared/recipeStatus";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { ClassText } from "@/components/class-name";
import { cn } from "@/lib/utils";

// Is a recipe item (pattern, plans, formula...) worth sending someone? Who in
// the guild has its profession and where they stand: can learn it now, can
// later (skill too low), already has one unlearned, or knows it
// (convex/shared/recipeStatus.ts; the addon's tooltips say the same).

export type Learner = {
	name: string;
	slug: string;
	classId: number;
	state: RecipeState;
	skill?: number;
	/** One of the viewer's own characters. */
	mine?: boolean;
	/** When it isn't the page's (Inventory spans the player's guilds). */
	region?: string;
};

const LABELS: Record<RecipeState, string> = {
	now: "Can learn",
	later: "Later",
	has: "Has one",
	knows: "Knows it",
};

/** What each state means, for hovers. */
const HINTS: Record<RecipeState, string> = {
	now: "Has the profession and the skill: could learn it today",
	later: "Has the profession, but not the skill it needs yet",
	has: "Already has one in their bags or bank, not learned yet",
	knows: "Already knows this recipe",
};

/**
 * One line per recipe item: "Can learn Brenna, Todd · Later Miller 90 ·
 * Knows it 3". Names in class colors; past `max` per group, "+N".
 */
export function LearnerSummary({
	who,
	region,
	profession,
	max = 3,
	className,
}: {
	who: Learner[];
	region: string;
	profession: string;
	max?: number;
	className?: string;
}) {
	if (who.length === 0) {
		return <span className={cn("text-muted-foreground", className)}>Nobody in the guild has {profession}.</span>;
	}
	const groups = RECIPE_STATES.map((state) => ({ state, list: who.filter((w) => w.state === state) })).filter(
		(g) => g.list.length > 0,
	);
	return (
		<span className={cn("min-w-0", className)}>
			{groups.map(({ state, list }, gi) => (
				<Fragment key={state}>
					{gi > 0 ? <span className="text-muted-foreground"> · </span> : null}
					<span className="text-muted-foreground" title={HINTS[state]}>
						{LABELS[state]}{" "}
					</span>
					{state === "knows" && list.length > max ? (
						<span className="num text-muted-foreground">{list.length}</span>
					) : (
						<>
							{list.slice(0, max).map((w, i) => (
								<Fragment key={w.slug}>
									{i > 0 ? <span className="text-muted-foreground">, </span> : null}
									<Name who={w} region={region} profession={profession} />
									{state === "later" && w.skill !== undefined ? (
										<span className="num text-xs text-muted-foreground"> {w.skill}</span>
									) : null}
								</Fragment>
							))}
							{list.length > max ? (
								<span className="num text-xs text-muted-foreground"> +{list.length - max}</span>
							) : null}
						</>
					)}
				</Fragment>
			))}
		</span>
	);
}

/** The item panel's list: one row per character, most useful first. */
export function LearnerList({
	who,
	region,
	profession,
	need,
}: {
	who: Learner[];
	region: string;
	profession: string;
	need?: number;
}) {
	return (
		<ul className="surface-card divide-y divide-border">
			{who.map((w) => (
				<li key={w.slug} className="flex items-baseline gap-2 px-3 py-1.5 text-[13px]">
					<Name who={w} region={region} profession={profession} className="font-medium" />
					{w.mine ? <span className="text-xs text-muted-foreground">you</span> : null}
					{w.skill !== undefined ? (
						<span className="text-xs text-muted-foreground">
							{profession} <span className="num">{w.skill}</span>
						</span>
					) : null}
					<span
						title={HINTS[w.state]}
						className={cn("pill ml-auto flex-none px-2 py-0", w.state === "now" && "text-foreground")}
					>
						{w.state === "later" && need !== undefined ? `Requires lvl ${need}` : LABELS[w.state]}
					</span>
				</li>
			))}
		</ul>
	);
}

function Name({
	who,
	region,
	profession,
	className,
}: {
	who: Learner;
	region: string;
	profession: string;
	className?: string;
}) {
	return (
		<Link
			to="/c/$region/$slug/professions"
			params={{ region: who.region ?? region, slug: who.slug }}
			search={{ profession }}
			className={cn("whitespace-nowrap hover:underline", className)}
		>
			<ClassText classId={who.classId}>{who.name}</ClassText>
		</Link>
	);
}
