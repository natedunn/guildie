import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { SectionTitle } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { ago } from "@/lib/format";

// A character's bags and bank, for its own player only (inventory:mine
// returns null to anyone else, and the tab only shows for the owner). As the
// addon last read them: bags at the last /reload or logout, the bank as of the
// last time it was open.

export const Route = createFileRoute("/c/$region/$slug/inventory")({
	head: () => ({ meta: [{ title: "Inventory · Guildie" }] }),
	component: Inventory,
});

type Part = { capturedAt: number; items: Item[] } | null;
type Item = { itemId: number; count: number; name?: string; quality: string; icon?: string; kind?: string };

function Inventory() {
	const params = Route.useParams();
	const { data, isPending } = useQuery(
		convexQuery(api.inventory.mine, { region: params.region as Region, slug: params.slug }),
	);
	const [q, setQ] = useState("");
	if (isPending) return null;
	if (!data) {
		return <p className="text-[13px] text-muted-foreground">Only this character's player can see its bags and bank.</p>;
	}
	return (
		<div className="max-w-3xl space-y-8 pb-12">
			<p className="text-[13px] text-muted-foreground">
				Only you can see this. The Guildie addon reads your bags in game, and your bank whenever you open it; Guildie
				gets them through the Guildie app when you /reload or log out.
			</p>
			<Input
				value={q}
				onChange={(e) => setQ(e.target.value)}
				placeholder="Filter items"
				autoComplete="off"
				className="max-w-sm"
			/>
			<Section
				title="Bags"
				part={data.bags}
				filter={q}
				empty="No bag data yet. With the Guildie app running, /reload in WoW."
			/>
			<Section
				title="Bank"
				part={data.bank}
				filter={q}
				empty="No bank data yet. Open your bank in game, then /reload."
			/>
		</div>
	);
}

function Section({ title, part, filter, empty }: { title: string; part: Part; filter: string; empty: string }) {
	const shown = useMemo(() => {
		const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
		if (!part) return [];
		if (!words.length) return part.items;
		return part.items.filter((i) => {
			const text = `${i.name ?? ""} ${i.kind ?? ""}`.toLowerCase();
			return words.every((w) => text.includes(w));
		});
	}, [part, filter]);
	return (
		<section>
			<div className="flex items-baseline justify-between gap-3">
				<SectionTitle>{title}</SectionTitle>
				{part && (
					<span className="text-xs text-muted-foreground">
						{part.items.length} {part.items.length === 1 ? "item" : "items"} · read {ago(part.capturedAt)}
					</span>
				)}
			</div>
			{!part ? (
				<p className="mt-2 text-[13px] text-muted-foreground">{empty}</p>
			) : shown.length === 0 ? (
				<p className="mt-2 text-[13px] text-muted-foreground">{part.items.length ? "Nothing matches." : "Empty."}</p>
			) : (
				<ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
					{shown.map((item) => (
						<li key={item.itemId} className="border-b border-border">
							<ItemHover
								item={{
									itemId: item.itemId,
									name: item.name ?? `Item ${item.itemId}`,
									quality: item.quality,
									icon: item.icon,
								}}
								className="flex items-center gap-2.5 py-1.5 text-[13px]"
							>
								<ItemIcon icon={item.icon} quality={item.quality} size={28} />
								<span className="min-w-0 flex-1 truncate" style={{ color: QUALITY_COLORS[item.quality] }}>
									{item.name ?? `Item ${item.itemId}`}
								</span>
								<span className="num text-muted-foreground">×{item.count}</span>
							</ItemHover>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
