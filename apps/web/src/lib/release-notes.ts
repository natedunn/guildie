import { useQuery } from "@tanstack/react-query";

// The app's release notes: each GitHub release's notes, which the release
// workflow takes from CHANGELOG.md. Read from GitHub's public API (no token;
// cached an hour), so notes written after a release still show up.

export type ReleaseNote = {
	/** Where the change lives: "Web", "App", "Addon" (CHANGELOG.md's "**Web, App:**" prefix). */
	pillars: string[];
	text: string;
};

export type ReleaseNotes = {
	version: string;
	date: string;
	sections: { title: string; items: ReleaseNote[] }[];
};

/** "**Web, App:** Text" into its pillars and text (older notes have none). */
export function parseNote(line: string): ReleaseNote {
	const m = /^\*\*([A-Za-z]+(?:, [A-Za-z]+)*):\*\*\s*(.*)$/.exec(line);
	return m ? { pillars: m[1].split(", "), text: m[2] } : { pillars: [], text: line };
}

/** "### New\n- a\n- b" into sections; anything else is ignored. */
export function parseNotes(body: string): ReleaseNotes["sections"] {
	const sections: ReleaseNotes["sections"] = [];
	for (const line of body.split(/\r?\n/)) {
		const heading = /^###\s+(.+)$/.exec(line);
		if (heading) sections.push({ title: heading[1].trim(), items: [] });
		const item = /^[-*]\s+(.+)$/.exec(line);
		if (item) {
			if (!sections.length) sections.push({ title: "Changes", items: [] });
			sections[sections.length - 1].items.push(parseNote(item[1].trim()));
		}
	}
	return sections;
}

type GithubRelease = {
	tag_name: string;
	published_at: string;
	body: string | null;
	draft: boolean;
	prerelease: boolean;
};

export function useReleaseNotes() {
	return useQuery({
		queryKey: ["release-notes"],
		staleTime: 60 * 60_000,
		queryFn: async (): Promise<ReleaseNotes[]> => {
			const res = await fetch("https://api.github.com/repos/natedunn/guildie/releases?per_page=20", {
				headers: { Accept: "application/vnd.github+json" },
			});
			if (!res.ok) throw new Error(`GitHub ${res.status}`);
			const releases = (await res.json()) as GithubRelease[];
			return releases
				.filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith("desktop-v"))
				.map((r) => ({
					version: r.tag_name.replace(/^desktop-v/, ""),
					date: r.published_at,
					sections: parseNotes(r.body ?? ""),
				}));
		},
	});
}

const SEEN_KEY = "guildie:whats-new-seen";

/** The app version whose notes the player has seen (per computer). */
export function seenVersion(): string | null {
	try {
		return localStorage.getItem(SEEN_KEY);
	} catch {
		return null;
	}
}

export function markSeen(version: string) {
	try {
		localStorage.setItem(SEEN_KEY, version);
	} catch {}
	window.dispatchEvent(new Event("guildie:whats-new-seen"));
}
