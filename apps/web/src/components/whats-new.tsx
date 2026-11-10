import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { desktop } from "@/lib/desktop";
import { markSeen, type ReleaseNotes, seenVersion, useReleaseNotes } from "@/lib/release-notes";
import { compareVersions } from "@/lib/versions";

const formatDate = (iso: string) =>
	new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

/** Release notes, newest first: up to `upTo` (the app's version) when given. */
export function WhatsNew({ upTo }: { upTo?: string }) {
	const { data, isPending, isError } = useReleaseNotes();
	if (isPending) return <p className="mt-2 text-[0.8125rem] text-muted-foreground">Loading…</p>;
	if (isError || !data)
		return <p className="mt-2 text-[0.8125rem] text-muted-foreground">Couldn't load the release notes right now.</p>;
	const shown = data.filter((r) => !upTo || compareVersions(r.version, upTo) <= 0).slice(0, 6);
	return (
		<div className="mt-3 space-y-6">
			{shown.map((r) => (
				<Release key={r.version} release={r} current={r.version === upTo} />
			))}
		</div>
	);
}

function Release({ release, current }: { release: ReleaseNotes; current: boolean }) {
	return (
		<article className="text-[0.8125rem]">
			<h3 className="flex items-baseline gap-2">
				<span className="num font-semibold">{release.version}</span>
				<span className="text-xs text-muted-foreground">{formatDate(release.date)}</span>
				{current && <span className="text-xs text-muted-foreground">· this version</span>}
			</h3>
			{release.sections.map((s) => (
				<div key={s.title} className="mt-2">
					<p className="text-xs font-medium text-muted-foreground">{s.title}</p>
					<ul className="mt-1 list-disc space-y-0.5 pl-5">
						{s.items.map((item) => (
							<li key={item.text}>
								{item.pillars.length > 0 && (
									<span className="mr-1.5 text-xs font-medium text-muted-foreground">{item.pillars.join(" · ")}</span>
								)}
								{item.text}
							</li>
						))}
					</ul>
				</div>
			))}
		</article>
	);
}

/**
 * Bottom of the sidebar, in the app, right after it updated: "Updated to
 * 0.3.4 · What's new". Gone once you open the notes or dismiss it. The first
 * run of an app (nothing seen yet) just records the version.
 */
export function UpdatedNotice() {
	const [state, setState] = useState<{ version: string; show: boolean } | null>(null);
	useEffect(() => {
		const version = desktop()?.version;
		if (!version) return;
		const check = () => {
			const seen = seenVersion();
			if (!seen) {
				markSeen(version);
				setState({ version, show: false });
			} else setState({ version, show: compareVersions(version, seen) > 0 });
		};
		check();
		window.addEventListener("guildie:whats-new-seen", check);
		return () => window.removeEventListener("guildie:whats-new-seen", check);
	}, []);
	if (!state?.show) return null;
	return (
		<div className="mx-0.5 mb-2 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[0.8125rem]">
			<Link to="/settings/app" hash="whats-new" className="min-w-0 flex-1" onClick={() => markSeen(state.version)}>
				<span className="block font-medium">Updated to {state.version}</span>
				<span className="block text-xs text-muted-foreground underline-offset-2 hover:underline">See what's new</span>
			</Link>
			<button
				type="button"
				aria-label="Dismiss"
				className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-hover hover:text-foreground"
				onClick={() => markSeen(state.version)}
			>
				×
			</button>
		</div>
	);
}
