import { GAME_BUILD, OVERRIDES, type ProficiencyType, proficienciesOf, typeOf } from "@convex/shared/proficiencies";
import { className } from "@convex/shared/wow";
import { SectionTitle } from "@/components/page-header";
import { cn } from "@/lib/utils";

// Who can wear and wield what, from WoW: Forever's game data
// (convex/shared/proficiencies.ts): a character's "Can use" and the note
// saying where the rules come from.

export const GROUPS: { key: ProficiencyType["group"]; label: string }[] = [
	{ key: "armor", label: "Armor" },
	{ key: "offHand", label: "Off hand" },
	{ key: "melee", label: "Melee" },
	{ key: "ranged", label: "Ranged" },
];

/** What a class can use at a level: each group's types, later ones as "Mail at 40". */
export function CanUse({ classId, level, className: cls }: { classId: number; level: number; className?: string }) {
	const all = proficienciesOf(classId);
	if (!all.length) return null;
	return (
		<section className={cls}>
			<SectionTitle>Can use</SectionTitle>
			<dl className="mt-2 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.8125rem]">
				{GROUPS.map((g) => {
					const list = all.filter((p) => p.type.group === g.key);
					if (!list.length) return null;
					return (
						<div key={g.key} className="contents">
							<dt className="text-muted-foreground">{g.label}</dt>
							<dd>
								{list.map((p, i) => (
									<span key={p.type.key}>
										{i > 0 && <span className="text-muted-foreground">, </span>}
										<span className={cn("whitespace-nowrap", p.from > level && "text-muted-foreground")}>
											{p.type.name}
											{p.from > level && <span className="num"> at {p.from}</span>}
										</span>
									</span>
								))}
							</dd>
						</div>
					);
				})}
			</dl>
		</section>
	);
}

/** Where the rules come from, for under the tables. */
export function RulesSource({ className: cls }: { className?: string }) {
	const left = OVERRIDES.filter((o) => o.level === null).map((o) => `${className(o.classId)} ${typeOf(o)?.name}`);
	return (
		<p className={cn("text-xs text-muted-foreground", cls)}>
			From WoW: Forever's game data, build <span className="num">{GAME_BUILD.version}</span>, checked daily for changes.
			Weapon skills still need a trainer.
			{left.length > 0 && <> The data also lists {left.join(" and ")}; they aren't counted until seen in game.</>}
		</p>
	);
}
