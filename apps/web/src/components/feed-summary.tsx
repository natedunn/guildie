import { api } from "@convex/_generated/api";
import { DUNGEON_BY_KEY, dungeonArtUrl } from "@convex/shared/dungeons";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import {
	ArrowDown01Icon,
	ArrowUpDoubleIcon,
	Castle01Icon,
	DeliveryBox01Icon,
	InformationCircleIcon,
	ScrollTextIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useState } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { ItemHover, ItemIcon } from "@/components/item";
import { cn } from "@/lib/utils";

// The Feed's day summary (convex/feed.ts summary): the day's totals, then
// what's behind them: the items sent and who sent the most, who leveled and
// how far, who turned in the most quests, and first dungeon clears with who
// made them. Beside the feed on wide panes; above it on narrow ones, folded
// to the totals until opened. The day is the page's (its day picker):
// today when it shows the latest.

type Summary = NonNullable<FunctionReturnType<typeof api.feed.summary>>;
type Who = Summary["leveled"]["list"][number]["who"];

/** Rows in each list before "Show N more". */
const SHOWN = 3;

export function FeedSummary({
	region,
	slug,
	since,
	until,
	label,
	date,
	folded = false,
}: {
	region: string;
	slug: string;
	/** The feed day: 4am to 4am, the viewer's time. */
	since: number;
	until: number;
	/** "Today", "Yesterday" or the date. */
	label: string;
	/** The date under a "Today"/"Yesterday" label. */
	date?: string;
	/** Narrow panes: the totals only, until "Details". */
	folded?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const { data } = useQuery({
		...convexQuery(api.feed.summary, { region: region as Region, slug, since, until }),
		placeholderData: keepPreviousData,
	});
	if (!data) return null;
	const quiet = !data.items && !data.levels && !data.quests && !data.dungeons.length;
	const details = !folded || open;
	const totals = [
		{ value: data.items, label: "Items sent" },
		{ value: data.levels, label: data.levels === 1 ? "Level" : "Levels" },
		{ value: data.quests, label: data.quests === 1 ? "Quest" : "Quests" },
	];

	return (
		<section className="surface-card card-clip">
			<div className="flex items-baseline gap-2 px-4 pt-3 pb-2.5">
				<h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{label}</h2>
				{date && <span className="truncate text-xs text-muted-foreground">{date}</span>}
			</div>
			<dl className="grid grid-cols-3 border-t border-border">
				{totals.map((t, i) => (
					<div key={t.label} className={cn("px-4 pt-2.5 pb-3", i > 0 && "border-l border-border")}>
						<dd className={cn("num text-xl leading-tight font-semibold", !t.value && "text-muted-foreground")}>
							{t.value.toLocaleString()}
						</dd>
						<dt className="mt-0.5 truncate text-xs text-muted-foreground">{t.label}</dt>
					</div>
				))}
			</dl>

			{folded && !quiet && (
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-expanded={open}
					className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					{data.dungeons.length > 0 && (
						<>
							<HugeiconsIcon icon={Castle01Icon} size={14} strokeWidth={2} className="opacity-70" />
							<span className="num">
								{data.dungeons.length} first {data.dungeons.length === 1 ? "clear" : "clears"}
							</span>
						</>
					)}
					<span className="ml-auto font-medium text-foreground">{open ? "Less" : "Details"}</span>
					<HugeiconsIcon
						icon={ArrowDown01Icon}
						size={14}
						strokeWidth={2}
						className={cn("text-foreground transition-transform", open && "rotate-180")}
					/>
				</button>
			)}

			{details && quiet && (
				<p className="border-t border-border px-4 py-4 text-[0.8125rem] text-muted-foreground">Nothing yet.</p>
			)}

			{details && data.items > 0 && (
				<Section
					icon={DeliveryBox01Icon}
					title="Sent"
					aside={
						<>
							<span className="num">{data.sent.kinds}</span> {data.sent.kinds === 1 ? "item" : "items"}
							{data.sent.senderCount > 0 && (
								<>
									{" · "}
									<span className="num">{data.sent.senderCount}</span>{" "}
									{data.sent.senderCount === 1 ? "player" : "players"}
								</>
							)}
						</>
					}
				>
					<div className="mb-2.5 flex flex-wrap gap-1">
						{data.sent.items.map((item) => (
							<ItemHover key={item.itemId} item={item} side="left" className="relative block">
								<ItemIcon icon={item.icon} quality={item.quality} size={34} />
								{item.quantity > 1 && (
									<span className="num pointer-events-none absolute right-0.5 bottom-0 text-[0.6875rem] font-semibold text-white [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]">
										{item.quantity}
									</span>
								)}
							</ItemHover>
						))}
					</div>
					<More
						list={data.sent.senders}
						total={data.sent.senderCount}
						row={(s) => (
							<PersonRow key={s.who.slug ?? s.who.name} who={s.who} region={region}>
								<b className="font-semibold text-foreground">{s.quantity}</b>{" "}
								{s.to ? `to ${s.to}` : `to ${s.recipients} players`}
							</PersonRow>
						)}
					/>
				</Section>
			)}

			{details && data.leveled.count > 0 && (
				<Section
					icon={ArrowUpDoubleIcon}
					title="Levels"
					aside={
						<>
							<span className="num">{data.leveled.count}</span> {data.leveled.count === 1 ? "player" : "players"}
						</>
					}
				>
					<More
						list={data.leveled.list}
						total={data.leveled.count}
						row={(l) => (
							<PersonRow key={l.who.slug} who={l.who} region={region}>
								{l.from}
								<span className="mx-1 text-muted-foreground/60">→</span>
								<b className="font-semibold text-foreground">{l.to}</b>
							</PersonRow>
						)}
					/>
				</Section>
			)}

			{details && data.questers.count > 0 && (
				<Section
					icon={ScrollTextIcon}
					title="Most quests"
					aside={
						<>
							<span className="num">{data.questers.count}</span> {data.questers.count === 1 ? "player" : "players"}
						</>
					}
				>
					<More
						list={data.questers.list}
						total={data.questers.count}
						row={(q) => (
							<PersonRow
								key={q.who.slug}
								who={q.who}
								region={region}
								bar={q.count / (data.questers.list[0]?.count || 1)}
							>
								<b className="font-semibold text-foreground">{q.count}</b>
							</PersonRow>
						)}
					/>
				</Section>
			)}

			{details && data.dungeons.length > 0 && (
				<Section icon={Castle01Icon} title="First clears">
					<ul className="space-y-1.5">
						{data.dungeons.map((d) => {
							const dungeon = DUNGEON_BY_KEY.get(d.key);
							return (
								<li key={d.key}>
									<Link
										to="/g/$region/$slug/dungeons/$dungeon"
										params={{ region, slug, dungeon: d.key }}
										disabled={!dungeon}
										className="relative isolate flex h-11 items-center gap-2.5 overflow-hidden rounded-md border border-border px-2.5 transition-colors hover:border-(--border-strong)"
									>
										<img
											src={dungeonArtUrl(d.key)}
											alt=""
											loading="lazy"
											draggable={false}
											className="pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-[70%] object-cover opacity-75 [mask-image:linear-gradient(90deg,transparent,#000_55%)]"
										/>
										<span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
											{dungeon?.name ?? d.key}
										</span>
										<span className="flex" title={d.people.map((p) => p.name).join(", ")}>
											{d.people.slice(0, 3).map((p) => (
												<CharacterAvatar
													key={p.slug}
													url={p.avatarUrl}
													size={22}
													className="-ml-1.5 rounded-full ring-2 ring-surface"
												/>
											))}
											{d.people.length > 3 && (
												<span className="num -ml-1.5 grid size-[22px] place-items-center rounded-full bg-secondary text-[9px] font-semibold ring-2 ring-surface">
													+{d.people.length - 3}
												</span>
											)}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</Section>
			)}

			{details && (
				<p className="flex items-start gap-1.5 border-t border-border px-4 py-2.5 text-xs leading-snug text-muted-foreground">
					<HugeiconsIcon
						icon={InformationCircleIcon}
						size={13}
						strokeWidth={2}
						className="mt-px flex-none opacity-70"
					/>
					Quests count after logging out, once Blizzard's data catches up.
				</p>
			)}
		</section>
	);
}

function Section({
	icon,
	title,
	aside,
	children,
}: {
	icon: typeof Castle01Icon;
	title: string;
	aside?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="border-t border-border px-4 pt-3 pb-3.5">
			<div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
				<HugeiconsIcon icon={icon} size={14} strokeWidth={2} className="opacity-70" />
				<span className="flex-1">{title}</span>
				{aside && <span className="text-muted-foreground/75">{aside}</span>}
			</div>
			{children}
		</div>
	);
}

/** The first few rows, then "Show N more" for the rest (the server sends up to 20; `total` is all of them). */
function More<T>({ list, total, row }: { list: T[]; total: number; row: (item: T) => ReactNode }) {
	const [all, setAll] = useState(false);
	const shown = all ? list : list.slice(0, SHOWN);
	const hidden = total - shown.length;
	return (
		<>
			{shown.map(row)}
			{hidden > 0 && (
				<button
					type="button"
					onClick={() => setAll(true)}
					disabled={all}
					className="mt-1 text-xs text-muted-foreground enabled:hover:text-foreground"
				>
					{all ? `and ${hidden} more` : `Show ${hidden} more`}
				</button>
			)}
		</>
	);
}

/** A player in a list: portrait, class-colored name, then the number(s); `bar`: 0–1 under the row. */
function PersonRow({ who, region, bar, children }: { who: Who; region: string; bar?: number; children: ReactNode }) {
	const name = <ClassText classId={who.classId ?? 0}>{who.name}</ClassText>;
	return (
		<div className="relative flex min-h-7 items-center gap-2 py-0.5">
			<CharacterAvatar url={who.avatarUrl} size={22} className="rounded-full" />
			{who.slug ? (
				<Link
					to="/c/$region/$slug"
					params={{ region, slug: who.slug }}
					className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium underline-offset-4 hover:underline"
				>
					{name}
				</Link>
			) : (
				<span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{name}</span>
			)}
			<span className="num flex-none text-xs text-muted-foreground">{children}</span>
			{bar !== undefined && (
				<span className="absolute right-0 -bottom-px left-[30px] h-0.5 rounded-full bg-secondary">
					<span className="block h-full rounded-full bg-foreground/25" style={{ width: `${Math.round(bar * 100)}%` }} />
				</span>
			)}
		</div>
	);
}
