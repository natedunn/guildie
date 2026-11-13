import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import { ADDON_SHARES, type AddonRow, type AddonShare } from "@convex/shared/addons";
import { Cancel01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type ReactNode, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The addons a player runs in game (convex/addons.ts), with what CurseForge
// says about them (convex/addonCatalog.ts), and the control for who sees
// them: on a character's Addons tab, the guild's Addons page and in
// Settings → Account.

/** The addon's CurseForge logo, else its initial on a quiet tile. */
export function AddonIcon({ addon, size = 32 }: { addon: Pick<AddonRow, "logo" | "title">; size?: number }) {
	const [failed, setFailed] = useState(false);
	const box = { width: size, height: size };
	if (addon.logo && !failed) {
		return (
			<img
				src={addon.logo}
				alt=""
				loading="lazy"
				referrerPolicy="no-referrer"
				onError={() => setFailed(true)}
				style={box}
				className="flex-none rounded-md border border-border bg-muted object-cover"
			/>
		);
	}
	return (
		<span
			aria-hidden
			style={{ ...box, fontSize: Math.round(size * 0.42) }}
			className="grid flex-none place-items-center rounded-md border border-border bg-muted font-semibold text-muted-foreground uppercase"
		>
			{addon.title.replace(/[^\p{L}\p{N}]/gu, "").charAt(0) || "?"}
		</span>
	);
}

/** Icon, title and one line of description; `aside` on the right. */
export function AddonLine({ addon, aside, compact }: { addon: AddonRow; aside?: ReactNode; compact?: boolean }) {
	return (
		<div className={cn("flex items-center gap-3", compact ? "py-1.5" : "py-2.5")}>
			<AddonIcon addon={addon} size={compact ? 20 : 32} />
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium">{addon.title}</div>
				{!compact && addon.summary && (
					<div className="truncate text-xs text-muted-foreground" title={addon.summary}>
						{addon.summary}
					</div>
				)}
			</div>
			{aside}
		</div>
	);
}

/** A link to the addon's CurseForge page. */
export function CurseForgeLink({ url, className }: { url: string; className?: string }) {
	return (
		<a
			href={url}
			target="_blank"
			rel="noreferrer"
			className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5", className)}
		>
			CurseForge
			<HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.75} />
		</a>
	);
}

/** One player's addons, one per row (modules folded into their addon). */
export function AddonList({ addons, className }: { addons: AddonRow[]; className?: string }) {
	return (
		<ul className={cn("surface-card card-clip divide-y divide-border text-[0.8125rem]", className)}>
			{addons.map((a) => (
				<li key={a.key} className="px-3.5">
					<AddonLine
						addon={a}
						aside={
							<div className="flex flex-none items-center gap-3">
								{a.users[0]?.version && (
									<span className="num hidden max-w-32 truncate text-xs text-muted-foreground sm:inline">
										{a.users[0].version}
									</span>
								)}
								{a.url ? (
									<a
										href={a.url}
										target="_blank"
										rel="noreferrer"
										aria-label={`${a.title} on CurseForge`}
										title="CurseForge"
										className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
									>
										<HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.75} />
									</a>
								) : (
									<span aria-hidden className="size-7" />
								)}
							</div>
						}
					/>
				</li>
			))}
		</ul>
	);
}

/** A centered popup with a title row and a close button. */
export function AddonDialog({
	open,
	onOpenChange,
	header,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	header: ReactNode;
	children: ReactNode;
}) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 flex max-h-[min(640px,calc(100dvh-2rem))] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col bg-background text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
					<div className="flex flex-none items-start gap-3 border-b border-border p-4">
						<div className="min-w-0 flex-1">{header}</div>
						<Dialog.Close
							className="grid size-8 flex-none place-items-center rounded-md text-muted-foreground pointer-coarse:size-10 hover:bg-hover hover:text-foreground"
							aria-label="Close"
						>
							<HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
						</Dialog.Close>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

export const AddonDialogTitle = Dialog.Title;

/** No one / Guild / Public, saved as soon as it's picked. */
export function AddonShareControl({ share, className }: { share: AddonShare; className?: string }) {
	const setShare = useMutation(api.addons.setShare);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState<AddonShare | null>(null);
	const current = pending ?? share;
	return (
		<div className={className}>
			<div role="radiogroup" aria-label="Who can see your addons" className="flex flex-wrap gap-1">
				{ADDON_SHARES.map((option) => (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={current === option.value}
						data-active={current === option.value}
						title={option.note}
						className="chip"
						onClick={async () => {
							if (option.value === current) return;
							setError(null);
							setPending(option.value);
							try {
								await setShare({ share: option.value });
							} catch (err) {
								setError(err instanceof ConvexError ? String(err.data) : "Couldn't change it. Try again.");
							} finally {
								setPending(null);
							}
						}}
					>
						{option.label}
					</button>
				))}
			</div>
			<p className="mt-1.5 text-xs text-muted-foreground">{ADDON_SHARES.find((o) => o.value === current)?.note}</p>
			{error && <p className="mt-1 text-xs text-destructive">{error}</p>}
		</div>
	);
}
