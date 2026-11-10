import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { Cancel01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ClassText } from "@/components/class-name";
import { ItemIcon, ItemTooltipBody, QUALITY_COLORS, wowheadItemUrl } from "@/components/item";
import { RequestButton, RequestRow } from "@/components/requests";

// The item panel: click any item and it slides in from the right over the
// page you're on (`?item=<id>`, so Back closes it). What the item is, who in
// the guild can make it, who it might be an upgrade for, and what it's used
// for, and the guild's requests for it (members); Wowhead is one click on.

/** The guild the page is about, so the panel can list its crafters. */
function useGuildContext() {
	return useRouterState({
		select: (s) => {
			for (const m of s.matches) {
				const params = m.params as { region?: string; slug?: string };
				if (!params.region || !params.slug) continue;
				if (m.routeId.startsWith("/g/"))
					return { kind: "guild" as const, region: params.region as Region, slug: params.slug };
				if (m.routeId.startsWith("/c/"))
					return { kind: "character" as const, region: params.region as Region, slug: params.slug };
			}
			return undefined;
		},
		structuralSharing: true,
	});
}

export function ItemSheet() {
	const { item: itemId } = useSearch({ strict: false }) as { item?: number };
	const navigate = useNavigate();
	const close = () =>
		void navigate({
			to: ".",
			search: (prev: Record<string, unknown>) => ({ ...prev, item: undefined }),
			replace: true,
		});
	return (
		<Dialog.Root open={itemId !== undefined} onOpenChange={(open) => !open && close()}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup
					initialFocus={false}
					className="fixed inset-y-0 right-0 z-50 flex w-[min(420px,100vw)] flex-col border-l border-border bg-background shadow-2xl transition-transform data-ending-style:translate-x-full data-starting-style:translate-x-full desktop:top-10"
				>
					{itemId !== undefined && <ItemPanel itemId={itemId} onClose={close} />}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function ItemPanel({ itemId, onClose }: { itemId: number; onClose: () => void }) {
	const guild = useGuildContext();
	const { data, isPending } = useQuery(convexQuery(api.crafting.itemDetail, { itemId, guild }));
	const item = data?.item;
	// Requests: only for the guild's members (null otherwise).
	const where = data?.guild ? { region: data.guild.region as Region, slug: data.guild.slug } : undefined;
	const { data: requests } = useQuery({
		...convexQuery(api.requests.forItem, { region: where?.region ?? "us", slug: where?.slug ?? "", itemId }),
		enabled: !!where,
	});
	const member = where && requests ? { guild: where, characters: requests.characters } : undefined;
	return (
		<>
			<div className="flex flex-none items-start gap-3 border-b border-border p-4">
				<ItemIcon icon={item?.icon} quality={item?.quality} size={48} />
				<div className="min-w-0 flex-1">
					<Dialog.Title
						className="text-[15px] font-semibold leading-snug"
						style={{ color: QUALITY_COLORS[item?.quality ?? "COMMON"] }}
					>
						{item?.name ?? (isPending ? "Loading…" : `Item ${itemId}`)}
					</Dialog.Title>
					{item?.kind && <p className="mt-0.5 text-xs text-muted-foreground">{item.kind}</p>}
				</div>
				<Dialog.Close
					className="grid size-8 flex-none place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
					aria-label="Close"
				>
					<HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
				</Dialog.Close>
			</div>

			<div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4">
				{item && item.tooltip.length > 0 && (
					<div className="item-tooltip rounded-md border px-3 py-2">
						<ItemTooltipBody item={{ itemId, name: item.name, quality: item.quality, tooltip: item.tooltip }} />
					</div>
				)}

				{member && (
					<Section title="Requests">
						{requests && requests.requests.length > 0 && (
							<ul className="divide-y divide-border rounded-md border border-border px-3">
								{requests.requests.map((r) => (
									<RequestRow key={r._id} request={r} compact />
								))}
							</ul>
						)}
						<div className="flex items-center gap-2">
							<RequestButton
								guild={member.guild}
								characters={member.characters}
								target={{
									kind: "item",
									itemId,
									name: item?.name ?? `Item ${itemId}`,
									quality: item?.quality,
									icon: item?.icon,
								}}
							/>
							<span className="text-xs text-muted-foreground">
								{requests && requests.requests.length > 0
									? "Shows on this item's tooltip in game too."
									: `Ask ${member.guild.slug === data?.guild?.slug ? data?.guild?.name : "the guild"} for it.`}
							</span>
						</div>
					</Section>
				)}

				{data && data.craftedBy.length > 0 && (
					<Section title="Made by">
						{data.craftedBy.map((r) => (
							<div key={r.recipeId} className="space-y-2 rounded-md border border-border p-3">
								<div className="flex items-baseline justify-between gap-3 text-[13px]">
									<span className="font-medium">{r.name}</span>
									<span className="text-xs text-muted-foreground">{r.profession}</span>
								</div>
								<div className="flex flex-wrap gap-1.5">
									{r.reagents.map((x) => (
										<ItemLink key={x.itemId} itemId={x.itemId} title={`${x.quantity} × ${x.name}`}>
											<span className="relative">
												<ItemIcon icon={x.icon} quality={x.quality} size={28} />
												{x.quantity > 1 && (
													<span className="num absolute -right-1 -bottom-1 rounded bg-black/80 px-0.5 text-[10px] leading-tight">
														{x.quantity}
													</span>
												)}
											</span>
										</ItemLink>
									))}
								</div>
								{data.guild && (
									<p className="text-[13px]">
										{r.crafters.length === 0 ? (
											<span className="text-muted-foreground">Nobody in {data.guild.name} knows this yet.</span>
										) : (
											r.crafters.map((c, i) => (
												<span key={c.slug}>
													{i > 0 && <span className="text-muted-foreground">, </span>}
													<Link
														to="/c/$region/$slug/professions"
														params={{ region: c.region, slug: c.slug }}
														search={{ profession: r.profession }}
														className="hover:underline"
													>
														<ClassText classId={c.classId}>{c.name}</ClassText>
													</Link>
													{c.skill !== undefined && (
														<span className="num text-xs text-muted-foreground"> {c.skill}</span>
													)}
												</span>
											))
										)}
									</p>
								)}
								{member && r.crafters.length > 0 && (
									<RequestButton
										guild={member.guild}
										characters={member.characters}
										size="xs"
										target={{
											kind: "craft",
											recipeId: r.recipeId,
											name: r.item?.name ?? r.name,
											itemId: r.item?.itemId,
											quality: r.item?.quality,
											icon: r.item?.icon,
											crafters: r.crafters,
										}}
									/>
								)}
							</div>
						))}
					</Section>
				)}

				{data && data.upgrades.length > 0 && (
					<Section title="Upgrade for">
						<div className="divide-y divide-border rounded-md border border-border">
							{data.upgrades.map((u) => (
								<div key={`${u.region}:${u.slug}`} className="space-y-0.5 px-3 py-2 text-[13px]">
									<div className="flex items-baseline gap-2">
										<Link
											to="/c/$region/$slug"
											params={{ region: u.region, slug: u.slug }}
											className="font-medium hover:underline"
										>
											<ClassText classId={u.classId}>{u.name}</ClassText>
										</Link>
										<span className="text-xs text-muted-foreground">
											<span className="num">{u.level}</span> {u.spec}
										</span>
										<span
											className={u.kind === "upgrade" ? "ml-auto text-xs" : "ml-auto text-xs text-muted-foreground"}
										>
											{u.kind === "upgrade" ? "Upgrade" : u.at ? `Maybe, at ${u.at}` : "Maybe"}
										</span>
									</div>
									<p className="text-xs text-muted-foreground">{u.why}</p>
								</div>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							A best guess from stat weights and what they wear, not a sim.
						</p>
					</Section>
				)}

				{data && data.usedIn.length > 0 && (
					<Section title="Used in">
						<div className="divide-y divide-border rounded-md border border-border">
							{data.usedIn.map((r) => (
								<div key={r.recipeId} className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]">
									{r.item ? (
										<ItemLink itemId={r.item.itemId} title={r.item.name}>
											<ItemIcon icon={r.item.icon} quality={r.item.quality} size={24} />
										</ItemLink>
									) : (
										<ItemIcon size={24} />
									)}
									<span
										className="min-w-0 flex-1 truncate"
										style={r.item ? { color: QUALITY_COLORS[r.item.quality] } : undefined}
									>
										{r.item?.name ?? r.name}
									</span>
									<span className="num text-xs text-muted-foreground">×{r.quantity}</span>
									<span className="w-24 truncate text-right text-xs text-muted-foreground">{r.profession}</span>
								</div>
							))}
						</div>
					</Section>
				)}

				{data && !item && data.craftedBy.length === 0 && data.usedIn.length === 0 && (
					<p className="text-[13px] text-muted-foreground">Guildie doesn't have details for this item yet.</p>
				)}
			</div>

			<div className="flex-none border-t border-border p-3">
				<a
					href={wowheadItemUrl(itemId)}
					target="_blank"
					rel="noreferrer"
					className="flex h-8 items-center justify-center gap-2 rounded-md border border-border text-[13px] hover:bg-accent"
				>
					Open on Wowhead
					<HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.75} />
				</a>
			</div>
		</>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-2">
			<h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
			{children}
		</section>
	);
}

/** Another item inside the panel: opens it in the same panel. */
function ItemLink({ itemId, title, children }: { itemId: number; title: string; children: ReactNode }) {
	return (
		<Link to="." search={(prev: Record<string, unknown>) => ({ ...prev, item: itemId })} title={title}>
			{children}
		</Link>
	);
}
