import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { PageTab, PageTabs } from "@/components/page-tabs";

// Admin: pages for maintainers (convex/maintainers.ts), one tab each. Anyone
// else gets "not found", and each tab's query returns null for them too.
export const Route = createFileRoute("/admin")({
	beforeLoad: ({ context }) => {
		if (!context.token) throw redirect({ to: "/sign-in" });
	},
	loader: async ({ context }) => {
		if (!(await context.queryClient.ensureQueryData(convexQuery(api.maintainers.me, {})))) throw notFound();
	},
	head: () => ({ meta: [{ title: "Admin · Guildie" }] }),
	component: AdminLayout,
});

function AdminLayout() {
	return (
		<div className="flex min-h-full flex-col">
			<PageHeader
				title="Admin"
				description="For maintainers. Everything here is across all of Guildie."
				className="pb-0"
			>
				<PageTabs className="mt-4">
					<PageTab to="/admin">Learn levels</PageTab>
				</PageTabs>
			</PageHeader>
			<div className="pt-6">
				<Outlet />
			</div>
		</div>
	);
}
