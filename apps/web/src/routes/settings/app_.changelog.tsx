import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NotesError, ReleaseList } from "@/components/whats-new";
import { desktop } from "@/lib/desktop";
import { useReleaseNotes } from "@/lib/release-notes";

// Settings → App → Releases: every release's notes, ten to a page (?page=),
// from GitHub (lib/release-notes.ts). The App tab shows the latest three.

const PER_PAGE = 10;

export const Route = createFileRoute("/settings/app_/changelog")({
	validateSearch: (search: Record<string, unknown>): { page?: number } => {
		const page = Number(search.page);
		return Number.isInteger(page) && page > 1 ? { page } : {};
	},
	head: () => ({ meta: [{ title: "Releases · Settings · Guildie" }] }),
	component: Changelog,
});

function Changelog() {
	const page = Route.useSearch().page ?? 1;
	const { data, isPending, isError } = useReleaseNotes(page, PER_PAGE);
	return (
		<div className="max-w-3xl pb-12">
			<SectionTitle>Releases</SectionTitle>
			{isPending ? (
				<p className="mt-2 text-[0.8125rem] text-muted-foreground">Loading…</p>
			) : isError || !data ? (
				<NotesError />
			) : data.releases.length === 0 ? (
				<p className="mt-2 text-[0.8125rem] text-muted-foreground">No releases on this page.</p>
			) : (
				<ReleaseList releases={data.releases} current={desktop()?.version} />
			)}
			{page > 1 || data?.more ? (
				<nav aria-label="Pages" className="mt-3 flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						render={page > 1 ? <Link to="/settings/app/changelog" search={{ page: page - 1 }} /> : undefined}
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.75} />
						Newer
					</Button>
					<span className="num px-1 text-xs text-muted-foreground">Page {page}</span>
					<Button
						variant="outline"
						size="sm"
						disabled={!data?.more}
						render={data?.more ? <Link to="/settings/app/changelog" search={{ page: page + 1 }} /> : undefined}
					>
						Older
						<HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.75} />
					</Button>
				</nav>
			) : null}
		</div>
	);
}
