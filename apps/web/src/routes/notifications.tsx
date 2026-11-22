import { api } from "@convex/_generated/api";
import { NO_ACTOR, type NotificationKind, notificationEvent, SINCE_LABEL } from "@convex/shared/notifications";
import { convexQuery } from "@convex-dev/react-query";
import {
	Cancel01Icon,
	Clock01Icon,
	Hammer01Icon,
	Mail01Icon,
	Notification01Icon,
	SentIcon,
	Tick02Icon,
	UnavailableIcon,
	Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef } from "react";
import { ClassText } from "@/components/class-name";
import { ENCHANT_ICON, ItemIcon } from "@/components/item";
import { Page, PageHeader } from "@/components/page-header";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

// Personal → Notifications: what happened to your requests, newest first
// (convex/notifications.ts). Opening it reads them all; the ones that were
// new keep their mark until you leave. The Windows app shows some as system
// notifications, and the addon prints some in game at login.

export const Route = createFileRoute("/notifications")({
	beforeLoad: ({ context }) => {
		if (!context.token) throw redirect({ to: "/sign-in", search: { next: "/notifications" } });
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.notifications.list, {}));
	},
	head: () => ({ meta: [{ title: "Notifications · Guildie" }] }),
	component: NotificationsPage,
});

function NotificationsPage() {
	const { data } = useSuspenseQuery(convexQuery(api.notifications.list, {}));
	const markAllRead = useMutation(api.notifications.markAllRead);
	const rows = data ?? [];
	// What was unread when the page opened stays marked while you're here.
	const fresh = useRef<Set<string> | null>(null);
	if (fresh.current === null && data) fresh.current = new Set(rows.filter((n) => !n.read).map((n) => n._id));
	const hasUnread = rows.some((n) => !n.read);
	useEffect(() => {
		if (hasUnread) void markAllRead({});
	}, [hasUnread, markAllRead]);

	return (
		<>
			<PageHeader title="Notifications" description="What happened to your requests." />
			<Page width="medium">
				{rows.length === 0 ? (
					<p className="text-[0.8125rem] text-muted-foreground">
						Nothing yet. When someone asks you to craft something, answers your ask, or one of your requests completes
						or expires, it shows here.
					</p>
				) : (
					<div className="space-y-4">
						{groups(rows).map((group) => (
							<section key={group.label}>
								<h2 className="mb-1 text-xs font-semibold text-muted-foreground">{group.label}</h2>
								<ul>
									{group.rows.map((n) => (
										<li key={n._id}>
											<NotificationRow n={n} isNew={!!fresh.current?.has(n._id)} />
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				)}
			</Page>
		</>
	);
}

type Row = NonNullable<FunctionReturnType<typeof api.notifications.list>>[number];

/** Today's, then the rest. */
function groups(rows: Row[]) {
	const midnight = new Date().setHours(0, 0, 0, 0);
	const today = rows.filter((n) => n.at >= midnight);
	const earlier = rows.filter((n) => n.at < midnight);
	return [
		{ label: "Today", rows: today },
		{ label: "Earlier", rows: earlier },
	].filter((g) => g.rows.length > 0);
}

/** Each kind's mark on the item icon, and its tone: done (gold), ended badly (red), news, or plain. */
const KIND_ICON: Record<NotificationKind, { icon: typeof Tick02Icon; tone: "done" | "off" | "news" | "plain" }> = {
	craftAsked: { icon: Hammer01Icon, tone: "news" },
	craftAccepted: { icon: Tick02Icon, tone: "news" },
	craftClaimed: { icon: Tick02Icon, tone: "news" },
	craftSent: { icon: SentIcon, tone: "news" },
	itemsMailed: { icon: Mail01Icon, tone: "plain" },
	requestDone: { icon: Tick02Icon, tone: "done" },
	requestExpired: { icon: Clock01Icon, tone: "plain" },
	askLapsed: { icon: Clock01Icon, tone: "plain" },
	craftDeclined: { icon: UnavailableIcon, tone: "off" },
	craftWithdrawn: { icon: Cancel01Icon, tone: "off" },
	craftBackedOut: { icon: Undo02Icon, tone: "off" },
};

const TONE = {
	done: "text-done",
	off: "text-destructive",
	news: "text-foreground",
	plain: "text-muted-foreground",
};

function NotificationRow({ n, isNew }: { n: Row; isNew: boolean }) {
	const mark = KIND_ICON[n.kind];
	const item = n.item;
	const amount = item?.quantity;
	const event = notificationEvent(n.kind, { since: !!n.since, mailed: n.mailed });
	return (
		<Link
			to="/g/$region/$slug/requests"
			params={{ region: n.guild.region, slug: n.guild.slug }}
			search={{ view: n.view }}
			className="group flex items-center gap-3 rounded-md py-2"
		>
			<span aria-hidden className={cn("size-1.5 flex-none rounded-full", isNew && "bg-highlight")} />
			{isNew && <span className="sr-only">New: </span>}
			<span className={cn("relative flex-none", n.since && "opacity-55")}>
				{item ? (
					<ItemIcon icon={item.icon ?? (item.enchant ? ENCHANT_ICON : undefined)} quality={item.quality} size={32} />
				) : (
					<span className="grid size-8 place-items-center rounded-[4px] bg-secondary text-muted-foreground">
						<HugeiconsIcon icon={Notification01Icon} size={16} strokeWidth={1.75} />
					</span>
				)}
				<span
					aria-hidden
					className={cn(
						"absolute -right-1.5 -bottom-1.5 grid size-[18px] place-items-center rounded-full bg-background",
						TONE[mark.tone],
					)}
				>
					<HugeiconsIcon icon={mark.icon} size={12} strokeWidth={2} />
				</span>
			</span>
			<span className="min-w-0 flex-1">
				{item ? (
					<>
						<span className="flex items-baseline gap-2">
							<span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", n.since && "opacity-60")}>
								{amount && item.prefix ? `${amount} ` : ""}
								<ClassText quality={item.quality}>{item.name}</ClassText>
								{amount && !item.prefix ? ` ×${amount}` : ""}
							</span>
							<span className="flex-none text-xs text-muted-foreground sm:hidden">{ago(n.at)}</span>
						</span>
						<span className="block truncate text-[0.8125rem] text-muted-foreground group-hover:underline">
							{!NO_ACTOR.has(n.kind) &&
								(n.actor ? <ClassText classId={n.actor.classId}>{n.actor.name}</ClassText> : "Someone")}{" "}
							<span className={cn(!n.since && "text-foreground/85")}>{event}</span>
						</span>
					</>
				) : (
					<span className="block text-sm group-hover:underline">{n.text}</span>
				)}
			</span>
			{n.since && (
				<span className="flex-none rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
					{SINCE_LABEL[n.since]}
				</span>
			)}
			<span className="flex-none text-right text-xs text-muted-foreground max-sm:hidden">
				{n.guild.name} · {ago(n.at)}
			</span>
		</Link>
	);
}
