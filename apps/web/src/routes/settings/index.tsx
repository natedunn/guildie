import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import { className } from "@convex/shared/wow";
import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { PinIcon, PinOffIcon, StarIcon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { type ReactNode, useEffect, useState } from "react";
import { AddonShareControl } from "@/components/addon-list";
import { AiConnections } from "@/components/ai-connections";
import { ClassText } from "@/components/class-name";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
									<TableHead className="w-0">
										<span className="sr-only">Main, sidebar and hide</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{viewer.characters.map((c) => (
									<TableRow key={c._id}>
										<TableCell>
											{c.hidden ? (
												// No page while hidden.
												<span className="font-medium opacity-50">
													<ClassText classId={c.classId}>{c.name}</ClassText>
												</span>
											) : (
												<Link
													to="/c/$region/$slug"
													params={{ region: c.region, slug: c.slug }}
													className="font-medium hover:underline underline-offset-4"
												>
													<ClassText classId={c.classId}>{c.name}</ClassText>
												</Link>
											)}
											{c.hidden && <span className="ml-2 text-xs text-muted-foreground">Hidden</span>}
										</TableCell>
										<TableCell className={c.hidden ? "text-muted-foreground/50" : "text-muted-foreground"}>
											{c.classId ? className(c.classId) : ""}
										</TableCell>
										<TableCell className={`num text-right${c.hidden ? " text-muted-foreground/50" : ""}`}>
											{c.level ?? ""}
										</TableCell>
										<TableCell
											className={c.hidden ? "text-right text-muted-foreground/50" : "text-right text-muted-foreground"}
										>
											{c.region.toUpperCase()}
										</TableCell>
										<TableCell className="py-1">
											<CharacterToggles character={c} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
				{viewer.characters.length > 0 && (
					<p className="mt-2 text-xs text-muted-foreground">
						Star your main to mark it on the roster. Characters under level 5 stay out of the sidebar unless you pin
						them. Hide a character you don't play (a test or retired one) to take it off Guildie.
					</p>
				)}
				<ClaimCharacters />
				<UnclaimedCharacters />
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

type ViewerCharacter = NonNullable<FunctionReturnType<typeof api.users.viewer>>["characters"][number];

/** Per character: mark it as my main (one at most), and pin it to the sidebar or take it out. */
function CharacterToggles({ character: c }: { character: ViewerCharacter }) {
	const setMain = useMutation(api.users.setMain);
	const setInSidebar = useMutation(api.users.setInSidebar);
	const key = { region: c.region, slug: c.slug };
	return (
		<div className="flex justify-end gap-0.5">
			<Toggle
				pressed={c.isMain}
				label={c.isMain ? "Your main. Click to unmark" : "Mark as your main"}
				onClick={() => void setMain({ character: c.isMain ? null : key })}
			>
				<HugeiconsIcon
					icon={StarIcon}
					size={15}
					strokeWidth={1.75}
					className={c.isMain ? "fill-current text-highlight" : undefined}
				/>
			</Toggle>
			{!c.hidden && (
				<Toggle
					pressed={c.inSidebar}
					label={c.inSidebar ? "In your sidebar. Click to remove" : "Pin to your sidebar"}
					onClick={() => void setInSidebar({ ...key, shown: !c.inSidebar })}
				>
					<HugeiconsIcon icon={c.inSidebar ? PinIcon : PinOffIcon} size={15} strokeWidth={1.75} />
				</Toggle>
			)}
			{c.canHide && <HideToggle character={c} />}
		</div>
	);
}

/**
 * Take a character off Guildie (asks first), or put it back. While hidden it's
 * on no roster, feed, menu, search or page, its player's included; this list
 * is the one place it still shows.
 */
function HideToggle({ character: c }: { character: ViewerCharacter }) {
	const setHidden = useMutation(api.users.setHidden);
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const key = { region: c.region, slug: c.slug };
	const change = async (hidden: boolean) => {
		setError(null);
		setPending(true);
		try {
			await setHidden({ ...key, hidden });
			setOpen(false);
		} catch (err) {
			setError(err instanceof ConvexError ? String(err.data) : "Couldn't change it. Try again.");
		} finally {
			setPending(false);
		}
	};
	if (c.hidden) {
		return (
			<Toggle pressed label="Hidden from Guildie. Click to show it again" onClick={() => void change(false)}>
				<HugeiconsIcon icon={ViewOffSlashIcon} size={15} strokeWidth={1.75} />
			</Toggle>
		);
	}
	return (
		<>
			<Toggle pressed={false} label="Hide from Guildie" onClick={() => setOpen(true)}>
				<HugeiconsIcon icon={ViewIcon} size={15} strokeWidth={1.75} />
			</Toggle>
			<Dialog.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
				<Dialog.Portal>
					<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
					<Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 bg-background p-5 text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
						<Dialog.Title className="text-[15px] font-semibold">Hide {c.name} from Guildie?</Dialog.Title>
						<Dialog.Description className="mt-2 text-pretty text-muted-foreground">
							{c.name} disappears from Guildie, for you and your guild: the roster, the feed (past events too), the
							Dungeons page, crafting, search, your sidebar and personal pages, and its own page. It keeps syncing in
							the background, and you can show it again here at any time.
						</Dialog.Description>
						{error && <p className="mt-3 text-destructive">{error}</p>}
						<div className="mt-5 flex justify-end gap-2">
							<Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button disabled={pending} onClick={() => void change(true)}>
								{pending ? "Hiding…" : "Hide"}
							</Button>
						</div>
					</Dialog.Popup>
				</Dialog.Portal>
			</Dialog.Root>
		</>
	);
}

function Toggle({
	pressed,
	label,
	onClick,
	children,
}: {
	pressed: boolean;
	label: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-pressed={pressed}
						aria-label={label}
						className={pressed ? "text-foreground" : "text-muted-foreground/60"}
						onClick={onClick}
					/>
				}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
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

/**
 * Characters the addon uploads that aren't claimed (convex/unclaimed.ts): a
 * new one to add by refreshing, or a deleted one to forget so the app stops
 * asking. Shown only while there are any; the app's "not claimed" notice opens it.
 */
function UnclaimedCharacters() {
	const { data } = useQuery(convexQuery(api.unclaimed.mine, {}));
	const forget = useMutation(api.unclaimed.forget);
	const shown = !!data?.length;
	// The app's notice links here; the list loads after the page, so scroll once it's in.
	useEffect(() => {
		if (shown && window.location.hash === "#unclaimed") document.getElementById("unclaimed")?.scrollIntoView();
	}, [shown]);
	if (!data?.length) return null;
	return (
		<div id="unclaimed" className="mt-8 scroll-mt-4">
			<SectionTitle>The addon also saw</SectionTitle>
			<p className="mt-1 text-[0.8125rem] text-muted-foreground">
				Characters you played in game that aren't on your list above. If one is new, refresh your characters to add it.
				If you deleted it, forget it, and Guildie stops asking about it.
			</p>
			<div className="surface-card mt-3 overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Class</TableHead>
							<TableHead className="text-right">Level</TableHead>
							<TableHead>Last played</TableHead>
							<TableHead className="w-0">
								<span className="sr-only">Forget</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.map((c) => (
							<TableRow key={c.blizzardId}>
								<TableCell className="font-medium">
									<ClassText classId={c.classId}>{c.name}</ClassText>
								</TableCell>
								<TableCell className="text-muted-foreground">{c.classId ? className(c.classId) : ""}</TableCell>
								<TableCell className="num text-right">{c.level ?? ""}</TableCell>
								<TableCell className="text-muted-foreground">{ago(c.lastPlayedAt)}</TableCell>
								<TableCell className="py-1">
									<Button
										variant="ghost"
										size="sm"
										className="text-muted-foreground"
										onClick={() => void forget({ blizzardId: c.blizzardId })}
									>
										Forget
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
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
