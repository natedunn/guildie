import { SectionTitle } from "@/components/page-header";

const REPO = "https://github.com/natedunn/guildie";

/**
 * Settings → Addon and → App: Guildie (site, app and addon) is open source;
 * where its code is, and where to report a bug or pitch in.
 */
export function OpenSourceNote({ part }: { part: "addon" | "app" }) {
	const folder = part === "addon" ? "apps/addon" : "apps/desktop";
	return (
		<section className="mt-10 max-w-3xl text-[0.8125rem]">
			<SectionTitle>Open source</SectionTitle>
			<p className="mt-1 text-muted-foreground">
				Guildie is open source under the MIT license: the {part === "addon" ? "addon" : "app"}, the site and everything
				else. Read the code, report a bug or help build it on GitHub.
			</p>
			<p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
				<a href={REPO} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
					github.com/natedunn/guildie
				</a>
				<a
					href={`${REPO}/tree/main/${folder}`}
					target="_blank"
					rel="noreferrer"
					className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
				>
					The {part === "addon" ? "addon's" : "app's"} code
				</a>
				<a
					href={`${REPO}/issues/new/choose`}
					target="_blank"
					rel="noreferrer"
					className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
				>
					Report a bug
				</a>
			</p>
		</section>
	);
}
