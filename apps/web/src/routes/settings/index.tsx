import { api } from "@convex/_generated/api";
import { className } from "@convex/shared/wow";
import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { AddonShareControl } from "@/components/addon-list";
import { AiConnections } from "@/components/ai-connections";
import { ClassText } from "@/components/class-name";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { startClaim } from "@/lib/claim";
import { desktop, useInDesktopApp } from "@/lib/desktop";
import { ago } from "@/lib/format";

// Settings → Account: who you are, your characters, privacy, sign out.
export const Route = createFileRoute("/settings/")({
	component: Account,
});

function Account() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) return null;
	return (
		<div className="max-w-3xl pb-12">
			<section id="characters" className="scroll-mt-4">
				<SectionTitle>Your characters</SectionTitle>
				<p className="mt-1 text-[0.8125rem] text-muted-foreground">
					Read from your Battle.net account each time you sign in, in every region. It proves which guild members are
					yours, so guildmates can find you and, later, so we can notify you.
				</p>
				{viewer.characters.length > 0 && (
					<div className="surface-card mt-3 overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Class</TableHead>
									<TableHead className="text-right">Level</TableHead>
									<TableHead className="text-right">Region</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{viewer.characters.map((c) => (
									<TableRow key={c._id}>
										<TableCell>
											<Link
												to="/c/$region/$slug"
												params={{ region: c.region, slug: c.slug }}
												className="font-medium hover:underline underline-offset-4"
											>
												<ClassText classId={c.classId}>{c.name}</ClassText>
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">{c.classId ? className(c.classId) : ""}</TableCell>
										<TableCell className="num text-right">{c.level ?? ""}</TableCell>
										<TableCell className="text-right text-muted-foreground">{c.region.toUpperCase()}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
				<ClaimCharacters />
			</section>

			<section id="privacy" className="mt-10 scroll-mt-4">
				<SectionTitle>Privacy</SectionTitle>
				<BattletagSetting hidden={!!viewer.hideBattletag} />
				<AddonsSetting />
			</section>

			<AiConnections />

			<section
				id="sign-out"
				className="mt-10 flex scroll-mt-4 flex-wrap items-center justify-between gap-4 border-t border-border pt-6"
			>
				<SignOutButton />
				<p className="flex gap-4 text-xs text-muted-foreground">
					<Link to="/data" className="hover:text-foreground">
						Where the data comes from
					</Link>
					<a
						href="https://github.com/natedunn/guildie"
						target="_blank"
						rel="noreferrer"
						className="hover:text-foreground"
					>
						Source on GitHub
					</a>
				</p>
			</section>
		</div>
	);
}

function ClaimCharacters() {
	const start = useMutation(api.claims.start);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	// The claim is a trip to Battle.net that has to happen in the browser you signed in with.
	if (useInDesktopApp()) {
		return (
			<p className="mt-4 text-[0.8125rem] text-muted-foreground">
				Your characters refresh every time you sign in. To refresh them now, use "Refresh my characters" on guildie.club
				in your browser.
			</p>
		);
	}
	return (
		<div className="mt-4">
			<Button
				variant="outline"
				disabled={pending}
				onClick={async () => {
					setError(null);
					setPending(true);
					try {
						await startClaim(start, "/settings");
					} catch (err) {
						setPending(false);
						setError(err instanceof ConvexError ? String(err.data) : "Couldn't start. Try again.");
					}
				}}
			>
				{pending ? "Heading to Battle.net…" : "Refresh my characters"}
			</Button>
			{error && <p className="mt-2 text-sm text-destructive">{error}</p>}
		</div>
	);
}

/** Guildmates see your BattleTag when they hover your characters on the roster, unless you hide it. */
function BattletagSetting({ hidden }: { hidden: boolean }) {
	const setHide = useMutation(api.users.setHideBattletag);
	return (
		<label className="surface-card mt-3 flex items-start gap-3 px-3.5 py-3 text-[0.8125rem]">
			<Switch className="mt-0.5" checked={hidden} onCheckedChange={(hide) => void setHide({ hide })} />
			<span>
				Hide my BattleTag from guildmates
				<span className="block text-muted-foreground">
					On Guildie, your guildmates can see your BattleTag on the roster next to each character you've claimed. People
					outside your guilds never see it.
				</span>
			</span>
		</label>
	);
}

/** Who sees the addons I run in game (convex/addons.ts): nobody until I choose. */
function AddonsSetting() {
	const { data } = useQuery(convexQuery(api.addons.mine, {}));
	if (!data) return null;
	return (
		<div className="surface-card mt-3 px-3.5 py-3 text-[0.8125rem]">
			Share my addons
			<span className="block text-muted-foreground">
				The addons you have turned on in game, read by the Guildie addon and shown on each of your characters and on
				your guilds' Addons page. Disabled addons aren't included.
				{data.count !== undefined && ` ${data.count} addons as of ${ago(data.capturedAt) ?? "the last sync"}.`}
			</span>
			<AddonShareControl share={data.share} className="mt-2.5" />
		</div>
	);
}

function SignOutButton() {
	const { signOut } = useAuthActions();
	const router = useRouter();
	const navigate = useNavigate();
	return (
		<Button
			variant="outline"
			onClick={async () => {
				await signOut();
				// Inside the desktop app, signing out here signs it out too.
				await desktop()
					?.signOut()
					.catch(() => {});
				await router.invalidate();
				await navigate({ to: "/" });
			}}
		>
			Sign out
		</Button>
	);
}
