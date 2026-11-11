import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { Page, PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { ago } from "@/lib/format";

// Personal → Inventory: every bag and bank of your claimed characters, as
// the addon last read them (bags at the last /reload or logout, the bank as
// of the last time it was open). "Where's my Silk Cloth?": Lich bags 37 ·
// Isai bank 20. Only you see it (inventory:all). `?character=<slug>` shows
// one character (old /c/…/inventory links land here).

type Search = { character?: string };

export const Route = createFileRoute("/inventory")({
	validateSearch: (search: Record<string, unknown>): Search =>
		typeof search.character === "string" && search.character ? { character: search.character } : {},
	beforeLoad: ({ context }) => {
		if (!context.token) throw redirect({ to: "/sign-in", search: { next: "/inventory" } });
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.inventory.all, {}));
	},
	head: () => ({ meta: [{ title: "Inventory · Guildie" }] }),
	component: InventoryPage,
});

function InventoryPage() {
	const { data } = useSuspenseQuery(convexQuery(api.inventory.all, {}));
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const [q, setQ] = useState("");
	const characters = data?.characters ?? [];
	const selected = characters.find((c) => c.slug === search.character);
	const nameOf = useMemo(() => new Map(characters.map((c) => [c.key, c])), [characters]);

	const shown = useMemo(() => {
		const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
		const out = [];
		for (const item of data?.items ?? []) {
			const where = selected ? item.where.filter((w) => w.key === selected.key) : item.where;
			if (!where.length) continue;
			const text = `${item.name ?? ""} ${item.kind ?? ""}`.toLowerCase();
			if (!words.every((w) => text.includes(w))) continue;
			out.push({ ...item, where, total: where.reduce((sum, w) => sum + w.count, 0) });
		}
		return out;
	}, [data, selected, q]);

	if (!data) return null;
	const pick = (slug?: string) =>
		navigate({ search: (prev) => ({ ...prev, character: slug }), replace: true, resetScroll: false });
	const anyRead = characters.some((c) => c.bags || c.bank);
	const listed = selected ? [selected] : characters;
	// One character: "Bags 37 · Bank 20" without the name.
	const single = selected ?? (characters.length === 1 ? characters[0] : undefined);

	return (
		<>
			<PageHeader
				title="Inventory"
				description="Your characters' bags and banks, as the Guildie addon last read them. Only you can see this."
			/>
			<Page width="medium" className="space-y-6">
				{characters.length === 0 ? (
					<p className="text-[0.8125rem] text-muted-foreground">
						No characters yet.{" "}
						<Link to="/settings" className="text-foreground underline underline-offset-4">
							Claim your characters
						</Link>{" "}
						to see their bags and banks here.
					</p>
				) : (
					<>
						<div className="space-y-3">
							<Input
								id="inventory-search"
								value={q}
								onChange={(e) => setQ(e.target.value)}
								placeholder="Where's my…?"
								autoComplete="off"
								className="max-w-sm"
							/>
							{characters.length > 1 && (
								<div className="flex flex-wrap gap-1" role="group" aria-label="Character">
									<button
										type="button"
										className="chip"
										data-active={!selected}
										aria-pressed={!selected}
										onClick={() => pick(undefined)}
									>
										All
									</button>
									{characters.map((c) => (
										<button
											key={c.key}
											type="button"
											className="chip"
											data-active={selected?.key === c.key}
											aria-pressed={selected?.key === c.key}
											onClick={() => pick(selected?.key === c.key ? undefined : c.slug)}
										>
											<ClassText classId={c.classId}>{c.name}</ClassText>
										</button>
									))}
								</div>
							)}
						</div>

						{/* When each character's bags and bank were last read in game. */}
						<ul className="divide-y divide-border rounded-md border border-border text-[0.8125rem]">
							{listed.map((c) => (
								<li key={c.key} className="flex items-center gap-2.5 px-3 py-2">
									<CharacterAvatar url={c.avatarUrl} size={24} className="rounded-full" />
									<Link
										to="/c/$region/$slug"
										params={{ region: c.region, slug: c.slug }}
										className="max-w-[40%] flex-none truncate hover:underline underline-offset-4"
									>
										<ClassText classId={c.classId}>{c.name}</ClassText>
									</Link>
									<span className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-3 text-right text-xs text-muted-foreground">
										<span>{c.bags ? `Bags read ${ago(c.bags.capturedAt)}` : "No bags read yet"}</span>
										<span>{c.bank ? `Bank read ${ago(c.bank.capturedAt)}` : "No bank read yet"}</span>
									</span>
								</li>
							))}
						</ul>

						{!anyRead ? (
							<p className="text-[0.8125rem] text-muted-foreground">
								Nothing read yet. With the Guildie app running, log in to WoW and /reload; open your bank once to add
								it.
							</p>
						) : shown.length === 0 ? (
							<p className="text-[0.8125rem] text-muted-foreground">
								{q.trim() ? `No ${q.trim()} in ${selected ? `${selected.name}'s` : "your"} bags or banks.` : "Empty."}
							</p>
						) : (
							<ul>
								{shown.map((item) => {
									const name = item.name ?? `Item ${item.itemId}`;
									return (
										<li key={item.itemId} className="border-b border-border">
											<ItemHover
												item={{ itemId: item.itemId, name, quality: item.quality, icon: item.icon }}
												className="flex items-center gap-2.5 py-1.5 text-[0.8125rem]"
											>
												<ItemIcon icon={item.icon} quality={item.quality} size={28} />
												<span className="min-w-0 flex-1">
													<span className="block truncate" style={{ color: QUALITY_COLORS[item.quality] }}>
														{name}
													</span>
													<span className="block truncate text-xs text-muted-foreground">
														{item.where.map((w, i) => {
															const c = nameOf.get(w.key);
															return (
																<span key={`${w.key}:${w.part}`}>
																	{i > 0 && " · "}
																	{!single && c && <ClassText classId={c.classId}>{c.name}</ClassText>}
																	{!single ? ` ${w.part}` : w.part === "bags" ? "Bags" : "Bank"}{" "}
																	<span className="num">{w.count}</span>
																</span>
															);
														})}
													</span>
												</span>
												<span className="num text-muted-foreground">×{item.total}</span>
											</ItemHover>
										</li>
									);
								})}
							</ul>
						)}
					</>
				)}
			</Page>
		</>
	);
}
