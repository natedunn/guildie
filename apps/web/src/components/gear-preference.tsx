import { api } from "@convex/_generated/api";
import { CLASS_RULES, PROFICIENCY_TYPES, type ProficiencyType, unlockLevel } from "@convex/shared/proficiencies";
import { canPrefer, type GearChoice } from "@convex/shared/upgrades";
import type { Region } from "@convex/shared/wow";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Panel, panelAction } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Gear types: the armor and weapon type a character prefers, if the player
// who claimed them chose. Gear suggestions count other types less, or with
// "Only this type", not at all (convex/shared/upgrades.ts gearPrefs).

type Kind = "armor" | "weapon";
type Pick = { type: number; strict: boolean } | null;

/** The types a class can ever use of a kind, in the "Can use" panel's order. */
function options(classId: number, kind: Kind) {
	return PROFICIENCY_TYPES.filter(
		(t) => t.kind === kind && t.subclass !== undefined && canPrefer(CLASS_RULES[classId], kind, t.subclass),
	);
}

const nameOf = (kind: Kind, type: number) =>
	PROFICIENCY_TYPES.find((t) => t.kind === kind && t.subclass === type)?.name ?? "?";

/** "Best you can wear (from 40)" / "Any" when unset. */
const AUTO: Record<Kind, string> = { armor: "Best you can wear", weapon: "Any" };
const TITLES: Record<Kind, string> = { armor: "Armor", weapon: "Weapon" };

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
	// Others only see it when the player chose something.
	if (!canEdit && !preference?.armor && !preference?.weapon) return null;
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
					const p = preference?.[kind];
					return (
						<div key={kind} className="contents">
							<dt className="text-muted-foreground">{TITLES[kind]}</dt>
							<dd>
								{p ? nameOf(kind, p.type) : AUTO[kind]}
								{p ? (
									<span className="text-xs text-muted-foreground">{p.strict ? ", only this" : ", preferred"}</span>
								) : null}
							</dd>
						</div>
					);
				})}
			</dl>
		</Panel>
	);
}

/**
 * Preferences: the armor and weapon type the character prefers, each from
 * every type the class can ever use (with the level it unlocks at), and
 * whether others still count. Saved with Save.
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
	const [armor, setArmor] = useState<Pick>(preference?.armor ?? null);
	const [weapon, setWeapon] = useState<Pick>(preference?.weapon ?? null);
	const [error, setError] = useState<string>();
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const changed = !samePick(armor, preference?.armor) || !samePick(weapon, preference?.weapon);

	const save = async () => {
		setSaving(true);
		setError(undefined);
		try {
			await set({ region: region as Region, slug, armor, weapon });
			setSaved(true);
		} catch (err) {
			setError(err instanceof ConvexError ? String(err.data) : "Couldn't save. Try again.");
		} finally {
			setSaving(false);
		}
	};
	const edit = (fn: (p: Pick) => void) => (p: Pick) => {
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
					{saved && !changed
						? "Saved."
						: changed
							? "Not saved yet."
							: "A weapon type counts among melee or ranged weapons, not both."}
				</span>
			</div>
		</div>
	);
}

/** Same type and strictness (field order differs between the editor and the database). */
const samePick = (a: Pick | undefined, b: Pick | undefined) =>
	(a?.type ?? null) === (b?.type ?? null) && (a?.strict ?? false) === (b?.strict ?? false);

/** One kind's choices as radio rows ("No preference" first), and how strictly. */
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
	value: Pick;
	onChange: (p: Pick) => void;
}) {
	const types = options(classId, kind);
	const rows: { type: number | null; name: string; note?: string }[] = [
		{
			type: null,
			name: kind === "armor" ? "No preference" : "Any",
			note: kind === "armor" ? "The best you can wear" : undefined,
		},
		...types.map((t) => {
			const from = unlockLevel(classId, t);
			return {
				type: t.subclass as number,
				name: t.name,
				note: from !== undefined && from > level ? `From level ${from}` : undefined,
			};
		}),
	];
	return (
		<fieldset className="min-w-0">
			<legend className="mb-2 text-[0.8125rem] font-semibold">{TITLES[kind]}</legend>
			<div
				role="radiogroup"
				aria-label={TITLES[kind]}
				className="divide-y divide-border rounded-md border border-border"
			>
				{rows.map((r) => {
					const active = (value?.type ?? null) === r.type;
					return (
						<button
							key={r.type ?? "none"}
							type="button"
							role="radio"
							aria-checked={active}
							onClick={() => onChange(r.type === null ? null : { type: r.type, strict: value?.strict ?? false })}
							className={cn(
								"flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[0.8125rem] transition-colors first:rounded-t-md last:rounded-b-md hover:bg-hover pointer-coarse:py-2.5",
								active && "bg-selected hover:bg-selected",
							)}
						>
							<span
								aria-hidden
								className={cn(
									"flex size-3.5 flex-none items-center justify-center rounded-full border border-border-strong",
									active && "border-foreground",
								)}
							>
								{active && <span className="size-1.5 rounded-full bg-foreground" />}
							</span>
							<span className={cn("flex-1", active && "font-semibold")}>{r.name}</span>
							{r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
						</button>
					);
				})}
			</div>
			<div className="mt-2.5">
				<Strictness
					disabled={!value}
					strict={value?.strict ?? false}
					onChange={(strict) => value && onChange({ ...value, strict })}
				/>
			</div>
		</fieldset>
	);
}

/** Preferred / Only this type: a segmented control like the steepness one. */
function Strictness({
	strict,
	disabled,
	onChange,
}: {
	strict: boolean;
	disabled: boolean;
	onChange: (s: boolean) => void;
}) {
	const options = [
		{ strict: false, name: "Preferred", hint: "Others count less" },
		{ strict: true, name: "Only this type", hint: "Others aren't suggested" },
	];
	return (
		<div>
			<div role="radiogroup" aria-label="How strictly" className="flex rounded-md border border-border bg-well p-0.5">
				{options.map((o) => (
					<button
						key={o.name}
						type="button"
						role="radio"
						aria-checked={!disabled && strict === o.strict}
						disabled={disabled}
						onClick={() => onChange(o.strict)}
						className={cn(
							"flex-1 rounded-[4px] py-1 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:text-muted-foreground",
							!disabled && strict === o.strict && "bg-selected text-foreground",
						)}
					>
						{o.name}
					</button>
				))}
			</div>
			<p className="mt-1.5 text-xs text-muted-foreground">
				{disabled ? "Pick a type first." : options.find((o) => o.strict === strict)?.hint}
			</p>
		</div>
	);
}
