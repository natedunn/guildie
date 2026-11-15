import { Popover } from "@base-ui/react/popover";
import type { api } from "@convex/_generated/api";
import { ArrowUpDoubleIcon, DeliveryBox01Icon, ScrollTextIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { cn } from "@/lib/utils";

// The Feed's daily stat cards (convex/feed.ts days), at the top of each day:
// items members sent each other, levels gained, quests completed. Hovering a
// card (tapping, on touch) shows its leaders. Plain cards like the app's
// others (.surface-card: one hairline); the hover is a popover, no arrow,
// like the app's tooltips.

export type DayStatsData = NonNullable<FunctionReturnType<typeof api.feed.days>>[number];
type Who = DayStatsData["levels"]["leaders"][number]["who"];

export function DayStats({ day, label }: { day: DayStatsData; label: string }) {
	const when = label === "Today" ? "today" : label === "Yesterday" ? "yesterday" : `on ${label}`;
	return (
		<div className="mb-2 grid grid-cols-3 gap-2">
			<StatCard
				icon={DeliveryBox01Icon}
				total={day.items.total}
				label="Items sent"
				title={`Most items sent ${when}`}
				players={day.items.players}
				leaders={day.items.leaders.map((l) => ({
					who: l.who,
					share: l.quantity / (day.items.leaders[0]?.quantity || 1),
					value: <b className="font-semibold text-foreground">{l.quantity.toLocaleString()}</b>,
				}))}
			/>
			<StatCard
				icon={ArrowUpDoubleIcon}
				total={day.levels.total}
				label="Levels gained"
				title={`Most levels ${when}`}
				players={day.levels.players}
				leaders={day.levels.leaders.map((l) => {
					const top = day.levels.leaders[0];
					return {
						who: l.who,
						share: (l.to - l.from) / (top ? top.to - top.from || 1 : 1),
						value: (
							<>
								{l.from}
								<span className="mx-1 text-muted-foreground/60">→</span>
								<b className="font-semibold text-foreground">{l.to}</b>
							</>
						),
					};
				})}
			/>
			<StatCard
				icon={ScrollTextIcon}
				total={day.quests.total}
				label="Quests completed"
				title={`Most quests ${when}`}
				players={day.quests.players}
				note="Counted after logging out, once Blizzard's data catches up."
				leaders={day.quests.leaders.map((l) => ({
					who: l.who,
					share: l.count / (day.quests.leaders[0]?.count || 1),
					value: <b className="font-semibold text-foreground">{l.count.toLocaleString()}</b>,
				}))}
			/>
		</div>
	);
}

function StatCard({
	icon,
	total,
	label,
	title,
	players,
	leaders,
	note,
}: {
	icon: typeof ScrollTextIcon;
	total: number;
	label: string;
	/** The hover's heading. */
	title: string;
	/** Everyone behind the total (the hover lists the first few). */
	players: number;
	leaders: { who: Who; share: number; value: ReactNode }[];
	note?: string;
}) {
	const card = (
		<>
			<span
				className={cn(
					"grid size-8 flex-none place-items-center rounded-[7px] bg-linear-to-b from-white/12 to-white/3 text-foreground shadow-[inset_0_1px_0_rgb(255_240_215/0.25),inset_0_0_0_1px_rgb(255_240_215/0.08)]",
					!total && "opacity-50",
				)}
			>
				<HugeiconsIcon icon={icon} size={16} strokeWidth={2} className="opacity-85" />
			</span>
			<span className="min-w-0 flex-1 text-left">
				<span
					className={cn(
						"num block text-lg leading-tight font-semibold tracking-[-0.02em]",
						!total && "text-muted-foreground/70",
					)}
				>
					{total.toLocaleString()}
				</span>
				<span className="block truncate text-xs text-muted-foreground">{label}</span>
			</span>
			{/* Who's behind it, as a hint there's more on hover; not on narrow cards. */}
			{leaders.length > 0 && (
				<span className="hidden flex-none pl-1.5 @md:flex">
					{leaders.slice(0, 3).map((l) => (
						<CharacterAvatar
							key={l.who.slug ?? l.who.name}
							url={l.who.avatarUrl}
							size={20}
							className="-ml-1.5 rounded-full ring-2 ring-surface"
						/>
					))}
				</span>
			)}
		</>
	);
	const box = "surface-card flex items-center gap-2.5 px-3 py-2.5 @max-md:flex-col @max-md:items-start @max-md:gap-2";
	if (!leaders.length) return <div className={box}>{card}</div>;
	return (
		<Popover.Root>
			<Popover.Trigger
				openOnHover
				delay={120}
				closeDelay={80}
				className={cn(box, "w-full data-popup-open:bg-[color-mix(in_oklab,var(--card-fill),rgb(255_240_215)_3%)]")}
			>
				{card}
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner side="bottom" sideOffset={6} className="isolate z-50">
					<Popover.Popup className="w-60 origin-(--transform-origin) rounded-md border border-(--border-strong) bg-popover bg-(image:--card-sheen) px-3 pt-2.5 pb-2 text-[0.8125rem] text-popover-foreground shadow-(--popover-shadow) outline-none duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0">
						<div className="mb-1.5 text-xs text-muted-foreground">{title}</div>
						{leaders.map((l) => (
							<div key={l.who.slug ?? l.who.name} className="relative flex h-7 items-center gap-2">
								<CharacterAvatar url={l.who.avatarUrl} size={22} className="rounded-full" />
								<span className="min-w-0 flex-1 truncate font-medium">
									<ClassText classId={l.who.classId ?? 0}>{l.who.name}</ClassText>
								</span>
								<span className="num flex-none text-xs text-muted-foreground">{l.value}</span>
								<span className="absolute right-0 bottom-0 left-[30px] h-0.5 rounded-full bg-secondary">
									<span
										className="block h-full rounded-full bg-foreground/25"
										style={{ width: `${Math.round(Math.min(Math.max(l.share, 0), 1) * 100)}%` }}
									/>
								</span>
							</div>
						))}
						{players > leaders.length && (
							<div className="num mt-1.5 text-xs text-muted-foreground/75">and {players - leaders.length} more</div>
						)}
						{note && <div className="mt-1.5 text-xs leading-snug text-muted-foreground/75">{note}</div>}
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
