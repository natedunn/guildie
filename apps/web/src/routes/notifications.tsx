import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
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
						Nothing yet. When someone takes on or sends one of your crafts, or a request completes or expires, it shows
						here.
					</p>
				) : (
					<ul className="divide-y divide-border">
						{rows.map((n) => {
							const isNew = fresh.current?.has(n._id);
							return (
								<li key={n._id}>
									<Link
										to="/g/$region/$slug/requests"
										params={{ region: n.guild.region, slug: n.guild.slug }}
										search={{ view: "mine" }}
										className="group flex items-baseline gap-3 py-2.5"
									>
										<span
											aria-hidden
											className={cn("size-1.5 flex-none translate-y-[-1px] rounded-full", isNew && "bg-highlight")}
										/>
										{isNew && <span className="sr-only">New: </span>}
										<span
											className={cn("min-w-0 flex-1 text-sm group-hover:underline", !isNew && "text-muted-foreground")}
										>
											{n.text}
										</span>
										<span className="flex-none text-xs text-muted-foreground">
											{n.guild.name} · {ago(n.at)}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</Page>
		</>
	);
}
