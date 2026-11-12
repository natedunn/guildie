import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DEFAULT_ONGOING_DAYS, matsLabel, type OngoingDays, REQUEST_LIMITS } from "@convex/shared/requests";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { type ReactNode, useEffect, useState } from "react";
import { ClassText } from "@/components/class-name";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ago, shortDate, timeLeft } from "@/lib/format";
import { cn } from "@/lib/utils";

// Guild requests on the site (rules: convex/shared/requests.ts): the form
// that makes one, the requester's mats check, and a request as a row with
// what the viewer can do to it.

export type RequestView = NonNullable<
	Extract<FunctionReturnType<typeof api.requests.list>, { member: true }>
>["requests"][number];
type Character = { slug: string; name: string; classId: number };

const errorText = (error: unknown, fallback: string) => (error instanceof ConvexError ? String(error.data) : fallback);

// ---- The mats check (the requester only) ---------------------------------------

type MatsCheck = {
	reagents: { itemId: number; name: string; need: number; have: number }[];
	scanned: boolean;
	bagsAt?: number;
	bankAt?: number;
	covered: boolean;
};

/**
 * "Bags checked 10 min ago · bank 2 days ago". The addon reads bags and bank
 * in game, but Guildie only gets them when the game saves (a /reload or
 * logout) and the Guildie app uploads that: never live.
 */
export function ScanTimes({ check }: { check: Pick<MatsCheck, "scanned" | "bagsAt" | "bankAt"> }) {
	if (!check.scanned)
		return <p className="text-xs text-muted-foreground">No bag data yet (needs the Guildie app; /reload in WoW).</p>;
	return (
		<p className="text-xs text-muted-foreground">
			{check.bagsAt ? `Bags checked ${ago(check.bagsAt)}` : "Bags not checked yet"}
			{" · "}
			{check.bankAt ? `bank ${ago(check.bankAt)}` : "bank not opened since"}
			<span className="block">Bought the mats since? /reload in WoW; this updates once the app uploads.</span>
		</p>
	);
}

/** Have/need per reagent from the player's last uploaded bags and bank. */
export function MatsList({ check }: { check: MatsCheck }) {
	return (
		<div className="space-y-1.5">
			{check.scanned && (
				<ul className="space-y-0.5 text-[13px]">
					{check.reagents.map((r) => (
						<li key={r.itemId} className="flex items-baseline gap-2">
							<span className="min-w-0 flex-1 truncate">{r.name}</span>
							<span className={cn("num text-xs", r.have >= r.need ? "text-foreground" : "text-muted-foreground")}>
								{Math.min(r.have, 9999)}/{r.need}
							</span>
						</li>
					))}
				</ul>
			)}
			<ScanTimes check={check} />
		</div>
	);
}

// ---- Making a request -------------------------------------------------------------

export type RequestTarget =
	| { kind: "item"; itemId: number; name: string; quality?: string; icon?: string }
	| {
			kind: "craft";
			recipeId: number;
			name: string;
			itemId?: number;
			quality?: string;
			icon?: string;
			/** Who in the guild knows it (shown in the form). */
			crafters?: Character[];
	  };

/** The viewer's own active request for this item (one per item): the form changes it instead. */
export type ExistingRequest = {
	requestId: string;
	status: "open" | "claimed" | "done" | "cancelled" | "expired";
	ongoing: boolean;
	quantity: number;
	until?: number;
	note?: string;
};

/** A button that opens the request form for an item or a craft in this guild. */
export function RequestButton({
	guild,
	target,
	characters,
	existing,
	ongoing,
	label,
	size = "sm",
	variant = "outline",
	className,
}: {
	guild: { region: Region; slug: string };
	target: RequestTarget;
	/** The viewer's characters in this guild (to ask as). */
	characters: Character[];
	/** Items: the viewer's request for it already, to change. */
	existing?: ExistingRequest;
	/** Items: open on the Ongoing tab (the page's Ongoing view). */
	ongoing?: boolean;
	label?: string;
	size?: "sm" | "xs";
	variant?: "outline" | "ghost";
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger render={<Button variant={variant} size={size} className={className} />}>
				{label ??
					(existing && target.kind === "item"
						? "Change request"
						: target.kind === "craft"
							? "Request a craft"
							: "Request this")}
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="fixed top-1/2 left-1/2 z-[70] max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-(--card-radius) border border-border-strong bg-popover bg-(image:--card-sheen) shadow-(--popover-shadow) transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
					{open &&
						(target.kind === "item" ? (
							<ItemRequestForm
								guild={guild}
								target={target}
								characters={characters}
								existing={existing}
								startOngoing={existing ? existing.ongoing : !!ongoing}
								onDone={() => setOpen(false)}
							/>
						) : (
							<CraftRequestForm guild={guild} target={target} characters={characters} onDone={() => setOpen(false)} />
						))}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function CloseButton() {
	return (
		<Dialog.Close
			className="grid size-7 flex-none place-items-center rounded-md text-muted-foreground pointer-coarse:size-9 hover:bg-hover hover:text-foreground"
			aria-label="Close"
		>
			<HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.75} />
		</Dialog.Close>
	);
}

function AskingAs({
	characters,
	value,
	onChange,
}: {
	characters: Character[];
	value: string | undefined;
	onChange: (slug: string) => void;
}) {
	if (characters.length < 2) return null;
	return (
		<Field label="Asking as">
			<div className="flex flex-wrap gap-1">
				{characters.map((c) => (
					<button
						key={c.slug}
						type="button"
						className="chip"
						data-active={value === c.slug}
						aria-pressed={value === c.slug}
						onClick={() => onChange(c.slug)}
					>
						<ClassText classId={c.classId}>{c.name}</ClassText>
					</button>
				))}
			</div>
		</Field>
	);
}

const DURATIONS: { days: OngoingDays; label: string }[] = [
	{ days: 14, label: "2 weeks" },
	{ days: 30, label: "1 month" },
	{ days: 90, label: "3 months" },
];

/**
 * Items: a fixed amount (someone claims it, sends it, you mark it done) or
 * ongoing (send me any you have, for 2 weeks to 3 months). One request per
 * item: with `existing`, this changes that one, switching kinds included.
 */
function ItemRequestForm({
	guild,
	target,
	characters,
	existing,
	startOngoing,
	onDone,
}: {
	guild: { region: Region; slug: string };
	target: Extract<RequestTarget, { kind: "item" }>;
	characters: Character[];
	existing?: ExistingRequest;
	startOngoing: boolean;
	onDone: () => void;
}) {
	const create = useMutation(api.requests.create);
	const update = useMutation(api.requests.update);
	const act = useMutation(api.requests.act);
	const [ongoing, setOngoing] = useState(startOngoing);
	const [quantity, setQuantity] = useState(existing && !existing.ongoing ? String(existing.quantity) : "20");
	// Changing an ongoing request: no duration picked keeps its end date.
	const [days, setDays] = useState<OngoingDays | undefined>(existing?.ongoing ? undefined : DEFAULT_ONGOING_DAYS);
	const [note, setNote] = useState(existing?.note ?? "");
	const [character, setCharacter] = useState(characters[0]?.slug);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const claimed = existing && existing.status !== "open";
	const switching = !!existing && existing.ongoing !== ongoing;
	const q = Math.floor(Number(quantity)) || 0;

	const run = async (fn: () => Promise<unknown>, fallback: string) => {
		setBusy(true);
		setError(null);
		try {
			await fn();
			onDone();
		} catch (err) {
			setError(errorText(err, fallback));
		} finally {
			setBusy(false);
		}
	};
	const submit = () =>
		run(
			() =>
				existing
					? update({
							requestId: existing.requestId as Id<"requests">,
							ongoing,
							quantity: ongoing ? undefined : Number(quantity),
							days: ongoing ? (switching ? (days ?? DEFAULT_ONGOING_DAYS) : days) : undefined,
							note: note.trim() || undefined,
						})
					: create({
							region: guild.region,
							slug: guild.slug,
							kind: "item",
							itemId: target.itemId,
							quantity: ongoing ? 0 : Number(quantity),
							ongoing: ongoing || undefined,
							days: ongoing ? (days ?? DEFAULT_ONGOING_DAYS) : undefined,
							note: note.trim() || undefined,
							character,
						}),
			existing ? "Couldn't change the request." : "Couldn't post the request.",
		);
	const stop = () =>
		existing &&
		run(() => act({ requestId: existing.requestId as Id<"requests">, action: "cancel" }), "Couldn't stop it.");

	return (
		<form
			className="space-y-4 p-4"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div className="-mx-4 -mt-4 flex items-center justify-between border-b border-border pr-2.5 pl-1.5">
				<Tabs value={ongoing ? "ongoing" : "fixed"} onValueChange={(v) => setOngoing(v === "ongoing")}>
					<TabsList className="h-10 border-b-0">
						<TabsTrigger value="fixed">Fixed amount</TabsTrigger>
						<TabsTrigger value="ongoing" disabled={claimed}>
							Ongoing
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<CloseButton />
			</div>

			<div className="flex items-center gap-3">
				<ItemIcon icon={target.icon} quality={target.quality} size={36} empty={!target.icon} />
				<Dialog.Title
					className="min-w-0 flex-1 truncate text-sm font-medium"
					style={{ color: QUALITY_COLORS[target.quality ?? "COMMON"] }}
				>
					{target.name}
				</Dialog.Title>
			</div>

			{claimed ? (
				<p className="text-[13px] text-muted-foreground">
					Someone already claimed your request for this. Mark it done, or release the claim, on the Requests page.
				</p>
			) : (
				<>
					{!existing && <AskingAs characters={characters} value={character} onChange={setCharacter} />}

					{ongoing ? (
						<>
							<Field label="For" as="div">
								<div className="flex flex-wrap gap-1">
									{DURATIONS.map((d) => (
										<button
											key={d.days}
											type="button"
											className="chip"
											data-active={days === d.days}
											aria-pressed={days === d.days}
											onClick={() => setDays(existing?.ongoing && days === d.days ? undefined : d.days)}
										>
											{d.label}
										</button>
									))}
								</div>
								{existing?.ongoing && existing.until && (
									<span className="block pt-0.5 text-xs text-muted-foreground">
										{days
											? `Ends ${shortDate(Date.now() + days * 86_400_000)} instead of ${shortDate(existing.until)}.`
											: `Ends ${shortDate(existing.until)}. Pick one to start it again from today.`}
									</span>
								)}
							</Field>
							<Field label="Note (optional)">
								<Input
									value={note}
									maxLength={REQUEST_LIMITS.note}
									onChange={(e) => setNote(e.target.value)}
									placeholder="Leveling tailoring"
								/>
							</Field>
						</>
					) : (
						<div className="grid grid-cols-[6rem_1fr] gap-3">
							<Field label="Quantity">
								<Input
									type="number"
									min={1}
									max={REQUEST_LIMITS.quantity}
									value={quantity}
									onChange={(e) => setQuantity(e.target.value)}
									className="num"
								/>
							</Field>
							<Field label="Note (optional)">
								<Input
									value={note}
									maxLength={REQUEST_LIMITS.note}
									onChange={(e) => setNote(e.target.value)}
									placeholder="For my alt's tailoring"
								/>
							</Field>
						</div>
					)}

					{switching ? (
						<p className="rounded-md border border-border bg-muted px-3 py-2 text-xs">
							This replaces your {existing?.ongoing ? "ongoing request" : `request for ${existing?.quantity}`}. You can
							have one request per item.
						</p>
					) : (
						<p className="text-xs text-muted-foreground">
							{ongoing
								? "Guildmates send any they have, whenever. Their tooltips in game show you want it."
								: "Someone claims it, sends it, and you mark it done."}
						</p>
					)}
				</>
			)}

			{error && <p className="text-[13px] text-destructive">{error}</p>}
			<div className="flex items-center gap-2">
				{existing && !claimed && (
					<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void stop()}>
						{existing.ongoing ? "Stop request" : "Cancel request"}
					</Button>
				)}
				<span className="flex-1" />
				{claimed ? (
					<Dialog.Close render={<Button type="button" variant="outline" size="sm" />}>Close</Dialog.Close>
				) : (
					<>
						{!existing && (
							<Dialog.Close render={<Button type="button" variant="ghost" size="sm" />}>Cancel</Dialog.Close>
						)}
						<Button type="submit" size="sm" disabled={busy || (!ongoing && q < 1)}>
							{busy
								? existing
									? "Saving…"
									: "Posting…"
								: !existing
									? "Post request"
									: switching
										? ongoing
											? "Switch to ongoing"
											: `Switch to ${q || "fixed"}`
										: "Save"}
						</Button>
					</>
				)}
			</div>
		</form>
	);
}

function CraftRequestForm({
	guild,
	target,
	characters,
	onDone,
}: {
	guild: { region: Region; slug: string };
	target: Extract<RequestTarget, { kind: "craft" }>;
	characters: Character[];
	onDone: () => void;
}) {
	const create = useMutation(api.requests.create);
	const [quantity, setQuantity] = useState("1");
	const [note, setNote] = useState("");
	const [character, setCharacter] = useState(characters[0]?.slug);
	const [declared, setDeclared] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const q = Math.max(1, Math.min(REQUEST_LIMITS.quantity, Math.floor(Number(quantity)) || 1));
	const { data: mats } = useQuery(convexQuery(api.requests.matsPreview, { recipeId: target.recipeId, quantity: q }));

	const submit = async () => {
		setBusy(true);
		setError(null);
		try {
			await create({
				region: guild.region,
				slug: guild.slug,
				kind: "craft",
				recipeId: target.recipeId,
				quantity: Number(quantity),
				note: note.trim() || undefined,
				character,
				declared,
			});
			onDone();
		} catch (err) {
			setError(errorText(err, "Couldn't post the request."));
		} finally {
			setBusy(false);
		}
	};

	return (
		<form
			className="space-y-4 p-4"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div className="flex items-start gap-3">
				<ItemIcon icon={target.icon} quality={target.quality} size={36} empty={!target.icon} />
				<div className="min-w-0 flex-1">
					<Dialog.Title className="text-sm font-semibold">Request a craft</Dialog.Title>
					<p className="truncate text-[13px]" style={{ color: QUALITY_COLORS[target.quality ?? "COMMON"] }}>
						{target.name}
					</p>
				</div>
				<CloseButton />
			</div>

			{target.crafters && target.crafters.length > 0 && (
				<p className="text-[13px] text-muted-foreground">
					Can make it:{" "}
					{target.crafters.slice(0, 5).map((c, i) => (
						<span key={c.slug}>
							{i > 0 && ", "}
							<ClassText classId={c.classId}>{c.name}</ClassText>
						</span>
					))}
					{target.crafters.length > 5 && ` +${target.crafters.length - 5}`}
				</p>
			)}

			<AskingAs characters={characters} value={character} onChange={setCharacter} />

			<div className="grid grid-cols-[6rem_1fr] gap-3">
				<Field label="How many">
					<Input
						type="number"
						min={1}
						max={REQUEST_LIMITS.quantity}
						value={quantity}
						onChange={(e) => setQuantity(e.target.value)}
						className="num"
					/>
				</Field>
				<Field label="Note (optional)">
					<Input
						value={note}
						maxLength={REQUEST_LIMITS.note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="I'll mail the mats"
					/>
				</Field>
			</div>

			<div className="surface-card space-y-2 p-3">
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-xs font-medium text-muted-foreground">Your mats</span>
					{mats && (
						<span className="text-xs">
							{mats.covered ? "All there" : mats.scanned ? "Not all there" : "Not checked"}
						</span>
					)}
				</div>
				{mats ? <MatsList check={mats} /> : <p className="text-xs text-muted-foreground">Checking…</p>}
				{!mats?.covered && (
					<label className="flex items-center gap-2 pt-1 text-[13px]">
						<Switch size="sm" checked={declared} onCheckedChange={setDeclared} />I have the mats
					</label>
				)}
				<p className="text-xs text-muted-foreground">
					Sending the mats to whoever claims it is on you. Guildmates see "
					{matsLabel(mats?.covered ? "inventory" : declared ? "declared" : "missing")}", never what's in your bags.
				</p>
			</div>

			{error && <p className="text-[13px] text-destructive">{error}</p>}
			<div className="flex justify-end gap-2">
				<Dialog.Close render={<Button type="button" variant="ghost" size="sm" />}>Cancel</Dialog.Close>
				<Button type="submit" size="sm" disabled={busy}>
					{busy ? "Posting…" : "Post request"}
				</Button>
			</div>
		</form>
	);
}

function Field({ label, children, as = "label" }: { label: string; children: ReactNode; as?: "label" | "div" }) {
	const Tag = as;
	return (
		<Tag className="block space-y-1">
			<span className="block text-xs text-muted-foreground">{label}</span>
			{children}
		</Tag>
	);
}

// ---- A request ----------------------------------------------------------------------

/** Re-renders every minute, for ages. */
export function useNow() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(t);
	}, []);
	return now;
}

const STATUS_LABEL: Record<RequestView["status"], string> = {
	open: "Not claimed yet",
	claimed: "Claimed",
	done: "Done",
	cancelled: "Cancelled",
	expired: "Expired",
};

/** One request with what the viewer can do: claim, release, mark sent; the requester's done, cancel, keep. */
export function RequestRow({ request: r, compact }: { request: RequestView; compact?: boolean }) {
	const act = useMutation(api.requests.act);
	const setDeclared = useMutation(api.requests.setDeclared);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [showMats, setShowMats] = useState(false);
	useNow();
	const active = r.status === "open" || r.status === "claimed";
	const run = async (fn: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await fn();
		} catch (err) {
			setError(errorText(err, "That didn't work."));
		} finally {
			setBusy(false);
		}
	};
	const doAct = (action: "claim" | "unclaim" | "markSent" | "complete" | "cancel" | "keep") =>
		run(() => act({ requestId: r._id as Id<"requests">, action }));

	const title = r.item?.name ?? r.recipe?.name ?? "Request";
	return (
		<li className={cn("space-y-1.5 py-2.5", !active && "opacity-60")}>
			<div className="flex items-start gap-2.5">
				{r.item ? (
					<ItemHover item={r.item} className="shrink-0">
						<ItemIcon icon={r.item.icon} quality={r.item.quality} size={32} className="block" />
					</ItemHover>
				) : (
					<ItemIcon size={32} empty className="block" />
				)}
				<div className="min-w-0 flex-1 space-y-0.5">
					<div className="flex flex-wrap items-baseline gap-x-2">
						{r.item ? (
							<ItemHover item={r.item} className="min-w-0 truncate text-sm hover:underline">
								<span style={{ color: QUALITY_COLORS[r.item.quality ?? "COMMON"] }}>{title}</span>
							</ItemHover>
						) : (
							<span className="truncate text-sm">{title}</span>
						)}
						{r.ongoing ? (
							<span className="text-xs text-muted-foreground">Ongoing · {timeLeft(r.until)}</span>
						) : (
							<span className="num text-[13px] text-muted-foreground">×{r.quantity}</span>
						)}
						{r.kind === "craft" && (
							<span className="text-xs text-muted-foreground">Craft · {r.recipe?.profession}</span>
						)}
					</div>
					<p className="text-[13px] text-muted-foreground">
						{r.mine ? (
							"You"
						) : (
							<ClassText classId={r.requester.classId} className="text-[13px]">
								{r.requester.name}
							</ClassText>
						)}
						{r.mine && <ClassText classId={r.requester.classId}> ({r.requester.name})</ClassText>}
						{" · "}
						{ago(r.createdAt)}
						{r.stale && <span className="text-foreground"> · no activity for over a week</span>}
						{r.kind === "craft" && active && (
							<>
								{" · "}
								<span className={r.mats?.state === "missing" ? undefined : "text-foreground"}>
									{matsLabel(r.mats?.state)}
								</span>
							</>
						)}
					</p>
					{r.note && <p className="text-[13px]">“{r.note}”</p>}
					<p className="text-[13px]">
						{r.ongoing && active ? (
							<span className="text-muted-foreground">
								{r.mine ? "Guildmates send any they have" : "Send any you have"}
								{r.have ? <span className="text-foreground"> · you have {r.have}</span> : null}
							</span>
						) : r.claim ? (
							<>
								<span className="text-muted-foreground">
									{r.status === "claimed" ? "Claimed by " : "Was claimed by "}
								</span>
								{r.claim.mine ? (
									"you"
								) : (
									<ClassText classId={r.claim.character.classId}>{r.claim.character.name}</ClassText>
								)}
								{r.claim.mine && <ClassText classId={r.claim.character.classId}> ({r.claim.character.name})</ClassText>}
								<span className="text-muted-foreground">
									{" "}
									{ago(r.claim.claimedAt)}
									{r.claim.sentAt && ` · marked sent ${ago(r.claim.sentAt)}`}
								</span>
							</>
						) : (
							<span className="text-muted-foreground">{STATUS_LABEL[r.status]}</span>
						)}
						{!active && r.closedAt && <span className="text-muted-foreground"> · {ago(r.closedAt)}</span>}
					</p>
				</div>
			</div>

			{r.matsCheck && (
				<div className={cn("space-y-2", !compact && "pl-[42px]")}>
					<button
						type="button"
						className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
						onClick={() => setShowMats((s) => !s)}
					>
						{r.matsCheck.covered
							? "Your bags and bank cover the mats"
							: r.matsCheck.scanned
								? "Your mats: not all there"
								: "Your mats: no bag data yet"}{" "}
						({showMats ? "hide" : "details"})
					</button>
					{showMats && (
						<div className="surface-card max-w-sm space-y-2 p-3">
							<MatsList check={r.matsCheck} />
							{!r.matsCheck.covered && (
								<label className="flex items-center gap-2 text-[13px]">
									<Switch
										size="sm"
										checked={!!r.mats?.declared}
										disabled={busy}
										onCheckedChange={(on) =>
											run(() => setDeclared({ requestId: r._id as Id<"requests">, declared: on }))
										}
									/>
									I have the mats
								</label>
							)}
						</div>
					)}
				</div>
			)}

			{active && (
				<div className={cn("flex flex-wrap items-center gap-1.5", !compact && "pl-[42px]")}>
					{r.canClaim && (
						<Button size="xs" variant="outline" disabled={busy} onClick={() => doAct("claim")}>
							Claim
						</Button>
					)}
					{r.claim?.mine && !r.claim.sentAt && (
						<Button size="xs" variant="outline" disabled={busy} onClick={() => doAct("markSent")}>
							Mark sent
						</Button>
					)}
					{r.claim && (r.claim.mine || r.mine) && (
						<Button size="xs" variant="ghost" disabled={busy} onClick={() => doAct("unclaim")}>
							{r.claim.mine ? "Unclaim" : "Release claim"}
						</Button>
					)}
					{r.mine && r.ongoing && (
						<Button size="xs" variant="ghost" disabled={busy} onClick={() => doAct("cancel")}>
							Stop request
						</Button>
					)}
					{r.mine && !r.ongoing && (
						<>
							<Button size="xs" variant="outline" disabled={busy} onClick={() => doAct("complete")}>
								{r.claim?.sentAt ? "Got it, mark done" : "Mark done"}
							</Button>
							{r.stale && (
								<Button size="xs" variant="outline" disabled={busy} onClick={() => doAct("keep")}>
									Still need it
								</Button>
							)}
							<Button size="xs" variant="ghost" disabled={busy} onClick={() => doAct("cancel")}>
								Cancel request
							</Button>
						</>
					)}
					{!r.canClaim && !r.mine && !r.claim?.mine && r.status === "open" && r.kind === "craft" && (
						<span className="text-xs text-muted-foreground">None of your characters knows this recipe.</span>
					)}
				</div>
			)}
			{error && <p className={cn("text-[13px] text-destructive", !compact && "pl-[42px]")}>{error}</p>}
		</li>
	);
}
