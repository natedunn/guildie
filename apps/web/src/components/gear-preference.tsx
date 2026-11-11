import { api } from "@convex/_generated/api";
import { CLASS_RULES, PROFICIENCY_TYPES, type ProficiencyType, unlockLevel } from "@convex/shared/proficiencies";
import { canPrefer, type GearChoice, typesOf } from "@convex/shared/upgrades";
import type { Region } from "@convex/shared/wow";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Panel, panelAction } from "@/components/panel";
import { Grip, moved, useReorder } from "@/components/stat-priority";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Gear types: the armor and weapon types a character prefers, first to last,
// if the player who claimed them chose. Gear suggestions count other types
// less, or with "Only these", not at all; each type down the list counts a
// little less than the one above (convex/shared/upgrades.ts gearPrefs).

type Kind = "armor" | "weapon";
/** One kind's choice in the editor: types first to last (none: no preference) and strictness. */
type KindPick = { types: number[]; strict: boolean };

/** The types a class can ever use of a kind, in the "Can use" panel's order. */
function options(classId: number, kind: Kind) {
	return PROFICIENCY_TYPES.filter(
		(t) => t.kind === kind && t.subclass !== undefined && canPrefer(CLASS_RULES[classId], kind, t.subclass),
	);
}

const nameOf = (kind: Kind, type: number) =>
	PROFICIENCY_TYPES.find((t) => t.kind === kind && t.subclass === type)?.name ?? "?";

/** What no preference means, per kind. */
const AUTO: Record<Kind, string> = { armor: "Best you can wear", weapon: "Any" };
const TITLES: Record<Kind, string> = { armor: "Armor", weapon: "Weapons" };

/** "only these" / "only this" / "preferred", after the types. */
const strictness = (n: number, strict: boolean) => (strict ? (n > 1 ? "only these" : "only this") : "preferred");

/** The Gear tab's panel: the preferred types, if any. The claimant edits them on Preferences. */
export function GearPreferenceSection({
	region,
	slug,
	preference,
	canEdit,
	className,
}: {
	region: string;
	slug: string;
	preference: GearChoice | undefined;
	canEdit: boolean;
	className?: string;
}) {
	const armor = typesOf(preference?.armor);
	const weapon = typesOf(preference?.weapon);
	// Others only see it when the player chose something.
	if (!canEdit && !armor.length && !weapon.length) return null;
	return (
		<Panel
			title="Gear types"
			className={className}
			action={
				canEdit && (
					<Link to="/c/$region/$slug/preferences" params={{ region, slug }} className={panelAction}>
						Edit
					</Link>
				)
			}
		>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.8125rem]">
				{(["armor", "weapon"] as const).map((kind) => {
					const types = kind === "armor" ? armor : weapon;
					return (
						<div key={kind} className="contents">
							<dt className="text-muted-foreground">{TITLES[kind]}</dt>
							<dd>
								{types.length ? types.map((t) => nameOf(kind, t)).join(", ") : AUTO[kind]}
								{types.length ? (
									<span className="text-xs text-muted-foreground">
										, {strictness(types.length, !!preference?.[kind]?.strict)}
									</span>
								) : null}
							</dd>
						</div>
					);
				})}
			</dl>
		</Panel>
	);
}

const pickOf = (choice: GearChoice[Kind]): KindPick => ({ types: typesOf(choice), strict: choice?.strict ?? false });
const samePick = (a: KindPick, b: KindPick) =>
	a.types.length === b.types.length &&
	a.types.every((t, i) => t === b.types[i]) &&
	(a.strict === b.strict || a.types.length === 0);

/**
 * Preferences: the armor and weapon types the character prefers, first to
 * last, from every type the class can ever use (with the level it unlocks
 * at), and whether others still count. Saved with Save.
 */
export function GearPreferenceEditor({
	region,
	slug,
	classId,
	level,
	preference,
}: {
	region: string;
	slug: string;
	classId: number;
	level: number;
	preference: GearChoice | undefined;
}) {
	const set = useMutation(api.statPriority.setGear);
	const [armor, setArmor] = useState<KindPick>(pickOf(preference?.armor));
	const [weapon, setWeapon] = useState<KindPick>(pickOf(preference?.weapon));
	const [error, setError] = useState<string>();
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const changed = !samePick(armor, pickOf(preference?.armor)) || !samePick(weapon, pickOf(preference?.weapon));

	const save = async () => {
		setSaving(true);
		setError(undefined);
		const arg = (p: KindPick) => (p.types.length ? p : null);
		try {
			await set({ region: region as Region, slug, armor: arg(armor), weapon: arg(weapon) });
			setSaved(true);
		} catch (err) {
			setError(err instanceof ConvexError ? String(err.data) : "Couldn't save. Try again.");
		} finally {
			setSaving(false);
		}
	};
	const edit = (fn: (p: KindPick) => void) => (p: KindPick) => {
		setSaved(false);
		fn(p);
	};

	return (
		<div className="space-y-5">
			<div className="grid gap-5 @2xl:grid-cols-2">
				<TypeList kind="armor" classId={classId} level={level} value={armor} onChange={edit(setArmor)} />
				<TypeList kind="weapon" classId={classId} level={level} value={weapon} onChange={edit(setWeapon)} />
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<div className="flex items-center gap-3 border-t border-border pt-4">
				<Button onClick={save} disabled={saving || !changed}>
					{saving ? "Saving…" : "Save"}
				</Button>
				<span className="text-xs text-muted-foreground">
					{saved && !changed ? "Saved." : changed ? "Not saved yet." : null}
				</span>
			</div>
		</div>
	);
}

/** One kind: the chosen types in order (drag to reorder), a way to add one, and how strictly. */
function TypeList({
	kind,
	classId,
	level,
	value,
	onChange,
}: {
	kind: Kind;
	classId: number;
	level: number;
	value: KindPick;
	onChange: (p: KindPick) => void;
}) {
	const all = options(classId, kind);
	const note = (t: ProficiencyType) => {
		const from = unlockLevel(classId, t);
		return from !== undefined && from > level ? `From level ${from}` : undefined;
	};
	const byType = new Map(all.map((t) => [t.subclass as number, t]));
	const left = all.filter((t) => !value.types.includes(t.subclass as number));
	const reorder = useReorder((from, to) => onChange({ ...value, types: moved(value.types, from, to) }));
	const n = value.types.length;

	return (
		<fieldset className="min-w-0">
			<div className="mb-2 flex items-center justify-between gap-3">
				<legend className="text-[0.8125rem] font-semibold">{TITLES[kind]}</legend>
				{n > 0 && (
					<select
						aria-label={`${TITLES[kind]}: how strictly`}
						value={value.strict ? "only" : "prefer"}
						onChange={(e) => onChange({ ...value, strict: e.target.value === "only" })}
						className="h-7 rounded-md border bg-well px-1.5 text-xs pointer-coarse:h-9 pointer-coarse:text-base"
					>
						<option value="prefer">{n > 1 ? "Prefer these" : "Prefer this"}</option>
						<option value="only">{n > 1 ? "Only these" : "Only this"}</option>
					</select>
				)}
			</div>
			{n > 0 ? (
				<ol className="divide-y divide-border rounded-md border border-border">
					{value.types.map((type, i) => {
						const t = byType.get(type);
						return (
							<li
								key={type}
								{...reorder.target(i)}
								className={cn("flex items-center gap-2.5 px-2 py-1", reorder.dragging === i && "opacity-50")}
							>
								<button
									type="button"
									aria-label={`Move ${nameOf(kind, type)} (Alt+arrow keys)`}
									disabled={n < 2}
									className="flex h-7 w-4 flex-none cursor-grab items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing disabled:invisible"
									{...reorder.handle(i, n, "y")}
								>
									<Grip />
								</button>
								<span className="num w-4 flex-none text-center text-xs text-muted-foreground">{i + 1}</span>
								<span className={cn("min-w-0 flex-1 truncate text-[0.8125rem]", i === 0 && "font-semibold")}>
									{nameOf(kind, type)}
								</span>
								{t && note(t) && <span className="text-xs text-muted-foreground">{note(t)}</span>}
								<button
									type="button"
									aria-label={`Remove ${nameOf(kind, type)}`}
									onClick={() => onChange({ ...value, types: value.types.filter((x) => x !== type) })}
									className="flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
								>
									×
								</button>
							</li>
						);
					})}
				</ol>
			) : (
				<p className="rounded-md border border-dashed border-border px-3 py-2 text-[0.8125rem] text-muted-foreground">
					No preference: {AUTO[kind].toLowerCase()}
				</p>
			)}
			{left.length > 0 && (
				<select
					aria-label={`Add a ${kind} type`}
					value=""
					onChange={(e) => {
						if (e.target.value) onChange({ ...value, types: [...value.types, Number(e.target.value)] });
					}}
					className="mt-2 h-8 w-full rounded-md border bg-well px-1.5 text-[0.8125rem] text-muted-foreground pointer-coarse:h-10 pointer-coarse:text-base"
				>
					<option value="">Add a type…</option>
					{left.map((t) => (
						<option key={t.subclass} value={t.subclass}>
							{t.name}
							{note(t) ? ` (${note(t)?.toLowerCase()})` : ""}
						</option>
					))}
				</select>
			)}
		</fieldset>
	);
}
