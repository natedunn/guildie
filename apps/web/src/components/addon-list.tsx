import { api } from "@convex/_generated/api";
import { ADDON_SHARES, type AddonEntry, type AddonShare } from "@convex/shared/addons";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { cn } from "@/lib/utils";

// The addons a player runs in game (convex/addons.ts), and the control for who
// sees them: on a character's Addons tab and in Settings → Account.

/** One addon per row: its title, the folder name when it differs, its version. */
export function AddonList({ list, className }: { list: AddonEntry[]; className?: string }) {
	return (
		<ul className={cn("surface-card card-clip divide-y divide-border text-[0.8125rem]", className)}>
			{list.map((a) => (
				<li key={a.name} className="flex items-baseline gap-3 px-3.5 py-2">
					<span className="min-w-0 flex-1 truncate">
						<span className="font-medium">{a.title ?? a.name}</span>
						{a.title && <span className="ml-2 text-xs text-muted-foreground">{a.name}</span>}
					</span>
					{a.version && <span className="num shrink-0 text-xs text-muted-foreground">{a.version}</span>}
				</li>
			))}
		</ul>
	);
}

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
