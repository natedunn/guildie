import { Combobox } from "@base-ui/react/combobox";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { cn } from "@/lib/utils";

// Shared by the Dungeons cards and a dungeon's page: the art, "View as" (whose
// progress the page shows, `?as=<character slug>`), and the done mark.

/** Someone "View as" can pick. */
export type Viewable = {
	key: string;
	name: string;
	classId: number;
	avatarUrl?: string;
	level: number;
	mine: boolean;
};

/** `?as=<character slug>` on the Dungeons pages. */
export type ViewAsSearch = { as?: string };

export const viewAsSearch = (search: Record<string, unknown>): ViewAsSearch =>
	typeof search.as === "string" && search.as ? { as: search.as } : {};

/** `?as=` if it's someone here, else your highest character here, else the guild's highest. */
export function viewerKey(people: Viewable[], as: string | undefined) {
	if (as && people.some((p) => p.key === as)) return as;
	const byLevel = [...people].sort((a, b) => b.level - a.level);
	return (byLevel.find((p) => p.mine) ?? byLevel[0])?.key;
}

/** Done: a tick in a ring on a faint disc, all in the done color. */
export function DoneMark({
	label,
	className,
	iconSize = 10,
}: {
	label: string;
	className?: string;
	iconSize?: number;
}) {
	return (
		<span
			role="img"
			aria-label={label}
			className={cn(
				"grid size-4 flex-none place-items-center rounded-full border border-done bg-done/15 text-done",
				className,
			)}
		>
			<HugeiconsIcon icon={Tick02Icon} size={iconSize} strokeWidth={2.5} />
		</span>
	);
}

/**
 * Pick a character, with a search: "View as" on the Dungeons pages, the
 * character on Quests (`label`, `placeholder`; `align` the menu to the
 * trigger's start or end).
 */
export function ViewAs({
	people,
	value,
	onChange,
	label: title = "View as",
	placeholder = "Search the guild",
	align = "end",
	combinedLabel,
}: {
	people: Viewable[];
	value: string | undefined;
	onChange: (key: string) => void;
	label?: string;
	placeholder?: string;
	align?: "start" | "end";
	combinedLabel?: string;
}) {
	const byKey = new Map(people.map((p) => [p.key, p]));
	const keys = [...people].sort((a, b) => Number(b.mine) - Number(a.mine) || b.level - a.level).map((p) => p.key);
	const combinedKey = "__all__";
	if (combinedLabel) keys.unshift(combinedKey);
	const label = (key: string) => (key === combinedKey ? (combinedLabel ?? key) : (byKey.get(key)?.name ?? key));
	return (
		<Combobox.Root
			items={keys}
			value={value ?? (combinedLabel ? combinedKey : null)}
			onValueChange={(key) => key && onChange(key)}
			itemToStringLabel={label}
			autoHighlight
		>
			<Combobox.Trigger className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground">
				{title}{" "}
				<span className="font-medium">
					{value && byKey.get(value) ? (
						<ClassText classId={byKey.get(value)?.classId ?? 0}>{label(value)}</ClassText>
					) : (
						(combinedLabel ?? "someone")
					)}
				</span>
				<HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} />
			</Combobox.Trigger>
			<Combobox.Portal>
				<Combobox.Positioner align={align} sideOffset={4} className="isolate z-50 outline-none">
					<Combobox.Popup className="w-60 overflow-hidden rounded-md border border-border-strong bg-popover bg-(image:--card-sheen) text-popover-foreground shadow-(--popover-shadow) outline-none">
						<Combobox.Input
							placeholder={placeholder}
							className="h-8 w-full border-b border-border bg-transparent px-2.5 text-[0.8125rem] outline-none placeholder:text-muted-foreground"
						/>
						<Combobox.Empty className="px-2.5 py-2 text-xs text-muted-foreground empty:hidden">
							Nobody by that name.
						</Combobox.Empty>
						<Combobox.List className="max-h-72 overflow-y-auto p-1 empty:hidden">
							{(key: string) => {
								const p = byKey.get(key);
								if (!p)
									return combinedLabel && key === combinedKey ? (
										<Combobox.Item
											value={key}
											className="cursor-default rounded-sm px-2 py-1.5 text-[0.8125rem] outline-none data-highlighted:bg-accent"
										>
											{combinedLabel}
										</Combobox.Item>
									) : null;
								return (
									<Combobox.Item
										key={key}
										value={key}
										className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-[0.8125rem] outline-none select-none data-highlighted:bg-accent"
									>
										<CharacterAvatar url={p.avatarUrl} size={18} className="rounded-full" />
										<ClassText classId={p.classId} className="truncate">
											{p.name}
										</ClassText>
										{p.mine && <span className="text-xs text-muted-foreground">You</span>}
										<span className="num ml-auto text-xs text-muted-foreground">{p.level}</span>
									</Combobox.Item>
								);
							}}
						</Combobox.List>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	);
}

/** A dungeon's loading-screen art (game art is the decoration); a plain panel if it doesn't load. */
export function DungeonArt({ src, className }: { src: string; className?: string }) {
	const [failed, setFailed] = useState(false);
	return (
		<div className={cn("overflow-hidden bg-muted/40", className)}>
			{!failed && (
				<img
					src={src}
					alt=""
					loading="lazy"
					draggable={false}
					onError={() => setFailed(true)}
					className="size-full object-cover"
				/>
			)}
		</div>
	);
}

export function MembersOnly() {
	return (
		<p className="surface-card mb-12 max-w-xl px-4 py-6 text-[0.8125rem] text-muted-foreground">
			Only the guild's members see who's ready for which dungeon.{" "}
			<Link to="/settings" className="text-foreground underline underline-offset-4">
				Claim your characters
			</Link>{" "}
			if you're one of them.
		</p>
	);
}
