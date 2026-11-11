import { api } from "@convex/_generated/api";
import { CLASS_RULES, PROFICIENCY_TYPES, type ProficiencyType, unlockLevel } from "@convex/shared/proficiencies";
import { canPrefer, type GearChoice } from "@convex/shared/upgrades";
import type { Region } from "@convex/shared/wow";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Panel, panelAction } from "@/components/panel";
import { Button } from "@/components/ui/button";

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

export function GearPreferenceSection({
	region,
	slug,
	classId,
	level,
	preference,
	canEdit,
	className,
}: {
	region: string;
	slug: string;
	classId: number;
	level: number;
	preference: GearChoice | undefined;
	canEdit: boolean;
	className?: string;
}) {
	const [editing, setEditing] = useState(false);
	// Others only see it when the player chose something.
	if (!canEdit && !preference?.armor && !preference?.weapon) return null;
	return (
		<Panel
			title="Gear types"
			className={className}
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
				<GearPicker
					region={region}
					slug={slug}
					classId={classId}
					level={level}
					preference={preference}
					onDone={() => setEditing(false)}
				/>
			) : (
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
			)}
		</Panel>
	);
}

function GearPicker({
	region,
	slug,
	classId,
	level,
	preference,
	onDone,
}: {
	region: string;
	slug: string;
	classId: number;
	level: number;
	preference: GearChoice | undefined;
	onDone: () => void;
}) {
	const set = useMutation(api.statPriority.setGear);
	const [armor, setArmor] = useState<Pick>(preference?.armor ?? null);
	const [weapon, setWeapon] = useState<Pick>(preference?.weapon ?? null);
	const [error, setError] = useState<string>();
	const [saving, setSaving] = useState(false);

	const save = async () => {
		setSaving(true);
		setError(undefined);
		try {
			await set({ region: region as Region, slug, armor, weapon });
			onDone();
		} catch (err) {
			setError(err instanceof ConvexError ? String(err.data) : "Couldn't save. Try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-3">
			<TypeRow kind="armor" classId={classId} level={level} value={armor} onChange={setArmor} />
			<TypeRow kind="weapon" classId={classId} level={level} value={weapon} onChange={setWeapon} />
			<p className="text-xs text-muted-foreground">
				Gear suggestions count other types less, or with "Only this type", leave them out. A weapon type counts among
				melee or ranged weapons, not both.
			</p>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<div className="flex gap-2 border-t border-border pt-3">
				<Button size="sm" onClick={save} disabled={saving}>
					Save
				</Button>
				<Button size="sm" variant="ghost" onClick={onDone} disabled={saving}>
					Cancel
				</Button>
			</div>
		</div>
	);
}

function TypeRow({
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
	const at = (t: ProficiencyType) => {
		const from = unlockLevel(classId, t);
		return from !== undefined && from > level ? ` (at ${from})` : "";
	};
	return (
		<div className="space-y-1.5">
			<label className="flex items-center gap-2.5 text-[0.8125rem]">
				<span className="w-14 flex-none text-muted-foreground">{TITLES[kind]}</span>
				<select
					aria-label={TITLES[kind]}
					value={value?.type ?? ""}
					onChange={(e) =>
						onChange(e.target.value === "" ? null : { type: Number(e.target.value), strict: value?.strict ?? false })
					}
					className="h-8 min-w-0 flex-1 rounded-md border bg-well px-1.5 text-[0.8125rem] pointer-coarse:h-10 pointer-coarse:text-base"
				>
					<option value="">{kind === "armor" ? "Best you can wear (from 40)" : "Any"}</option>
					{types.map((t) => (
						<option key={t.subclass} value={t.subclass}>
							{t.name}
							{at(t)}
						</option>
					))}
				</select>
			</label>
			<label className="flex items-center gap-2 pl-[4.125rem] text-xs text-muted-foreground">
				<input
					type="checkbox"
					checked={value?.strict ?? false}
					disabled={!value}
					onChange={(e) => value && onChange({ ...value, strict: e.target.checked })}
				/>
				Only this type
			</label>
		</div>
	);
}
