import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/format";

/** Settings → App: computers whose Guildie app is connected to this account (they upload the addon's data). */
export function HelperTokens() {
	const tokens = useQuery(api.helper.listTokens);
	const revoke = useMutation(api.helper.revokeToken);
	return (
		<div>
			<p className="mt-1 text-[0.8125rem] text-muted-foreground">
				Computers signed in with the Guildie app, which upload your addon's data. Disconnect one you no longer use.
			</p>
			{tokens && tokens.length === 0 && (
				<p className="mt-3 rounded-[var(--card-radius)] border border-dashed border-border px-3.5 py-3 text-[0.8125rem] text-muted-foreground">
					None yet. Sign in inside the app to connect it.
				</p>
			)}
			{tokens && tokens.length > 0 && (
				<ul className="surface-card mt-3 divide-y divide-border text-[0.8125rem]">
					{tokens.map((t) => (
						<li key={t._id} className="flex min-h-10 items-center justify-between gap-4 py-1.5 pr-1.5 pl-3.5">
							<span className="min-w-0 truncate">{t.label}</span>
							<span className="num flex shrink-0 items-center gap-4 text-muted-foreground">
								{t.lastUsedAt ? `used ${ago(t.lastUsedAt)}` : `connected ${ago(t.createdAt)}`}
								<Button
									variant="ghost"
									size="xs"
									className="hover:text-destructive"
									onClick={() => revoke({ tokenId: t._id })}
								>
									Disconnect
								</Button>
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
