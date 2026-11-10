import { useState } from "react";
import type { CharacterTree, TalentLayout, TalentNode } from "@/components/character-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// A talent tree drawn like the game's: a 4-column grid of icons with rank
// counters and arrows from each talent to the ones it unlocks.

const CELL = 38; // icon size
const GAP_X = 16;
const GAP_Y = 18;
const PITCH_X = CELL + GAP_X;
const PITCH_Y = CELL + GAP_Y;

// The game's own tooltip and rank colors.
const GOLD = "#ffd100";
const GREEN = "#40bf40";

type PlacedNode = TalentNode & { r: number; c: number; rank: number };

/**
 * Blizzard's layouts number columns across the whole class (a priest's trees
 * sit at columns 1-4, 7-10 and 14-17) and include stray nodes far below the
 * tree (Holy has a second "Holy Specialization" at row 33). Rebase columns to
 * 1 and drop rows after a gap, so each tree is its own compact grid.
 */
export function placeNodes(layout: TalentLayout, tree: CharacterTree | undefined): PlacedNode[] {
	const rows = [...new Set(layout.nodes.map((n) => n.row))].sort((a, b) => a - b);
	let lastRow = rows[0] ?? 0;
	for (const row of rows) {
		if (row - lastRow > 2) break;
		lastRow = row;
	}
	const kept = layout.nodes.filter((n) => n.row <= lastRow);
	const minRow = Math.min(...kept.map((n) => n.row));
	const minCol = Math.min(...kept.map((n) => n.col));
	const byId = new Map(tree?.talents.map((t) => [t.id, t.rank]));
	// Name as a fallback, in case the character's points sit on a dropped
	// duplicate of a talent.
	const byName = new Map(tree?.talents.map((t) => [t.name, t.rank]));
	return kept.map((n) => ({
		...n,
		r: n.row - minRow + 1,
		c: n.col - minCol + 1,
		rank: Math.min(byId.get(n.talentId) ?? byName.get(n.name) ?? 0, n.maxRank),
	}));
}

export function TalentTree({ layout, tree }: { layout: TalentLayout; tree: CharacterTree | undefined }) {
	const nodes = placeNodes(layout, tree);
	const points = tree?.points ?? nodes.reduce((sum, n) => sum + n.rank, 0);
	const cols = Math.max(4, ...nodes.map((n) => n.c));
	const rows = Math.max(1, ...nodes.map((n) => n.r));
	const width = cols * CELL + (cols - 1) * GAP_X;
	const height = rows * CELL + (rows - 1) * GAP_Y;
	const byId = new Map(nodes.map((n) => [n.talentId, n]));
	const arrows = nodes.flatMap((from) =>
		from.unlocks.flatMap((id) => {
			const to = byId.get(id);
			// Some layouts have unlocks pointing up or both ways (a druid's
			// Balance tree); the game only ever draws them downward or sideways.
			if (!to || to.r < from.r || (to.r === from.r && to.c === from.c)) return [];
			return [{ from, to }];
		}),
	);
	return (
		<section className="rounded-md border border-border bg-card">
			<header className="flex items-baseline justify-between border-b border-border px-3 py-2">
				<h2 className="text-sm font-semibold">{layout.name}</h2>
				<span className={cn("num text-sm", points ? "text-foreground" : "text-muted-foreground")}>{points}</span>
			</header>
			<div className="flex justify-center px-3 py-4">
				<div className="relative" style={{ width, height }}>
					<svg
						className="pointer-events-none absolute inset-0 overflow-visible"
						width={width}
						height={height}
						aria-hidden
					>
						{arrows.map(({ from, to }) => (
							<Arrow key={`${from.talentId}-${to.talentId}`} from={from} to={to} />
						))}
					</svg>
					{nodes.map((n) => (
						<Talent key={n.talentId} node={n} />
					))}
				</div>
			</div>
		</section>
	);
}

const x0 = (c: number) => (c - 1) * PITCH_X;
const y0 = (r: number) => (r - 1) * PITCH_Y;

function Arrow({ from, to }: { from: PlacedNode; to: PlacedNode }) {
	// Lit once the path is in use, like the game.
	const lit = to.rank > 0 || from.rank === from.maxRank;
	const fx = x0(from.c) + CELL / 2;
	const fy = y0(from.r) + CELL / 2;
	const tx = x0(to.c) + CELL / 2;
	const ty = y0(to.r) + CELL / 2;
	const H = 4; // arrowhead half-width
	let line: string;
	let head: string;
	if (to.r === from.r) {
		// Sideways: edge to edge, the head against the target's side.
		const dir = Math.sign(tx - fx);
		const start = fx + (dir * CELL) / 2;
		const end = tx - (dir * CELL) / 2;
		line = `M${start} ${fy} H${end - dir * H}`;
		head = `M${end} ${fy} L${end - dir * H * 1.5} ${fy - H} L${end - dir * H * 1.5} ${fy + H}Z`;
	} else {
		// Down, with an elbow first when the columns differ.
		const end = y0(to.r);
		line =
			to.c === from.c
				? `M${fx} ${fy + CELL / 2} V${end - H}`
				: `M${fx + (Math.sign(tx - fx) * CELL) / 2} ${fy} H${tx} V${end - H}`;
		head = `M${tx} ${end} L${tx - H} ${end - H * 1.5} L${tx + H} ${end - H * 1.5}Z`;
	}
	return (
		<g className={lit ? "text-foreground/70" : "text-foreground/20"}>
			<path d={line} fill="none" stroke="currentColor" strokeWidth={2} />
			<path d={head} fill="currentColor" />
		</g>
	);
}

function Talent({ node }: { node: PlacedNode }) {
	const { rank, maxRank } = node;
	const maxed = rank >= maxRank;
	// Hover shows the tooltip; a tap (phones have no hover) or click does too,
	// and a tap anywhere else closes it.
	const [open, setOpen] = useState(false);
	return (
		<Tooltip open={open} onOpenChange={setOpen}>
			<TooltipTrigger
				render={<button type="button" />}
				closeOnClick={false}
				onClick={() => setOpen(true)}
				className="absolute rounded-[4px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
				style={{ left: x0(node.c), top: y0(node.r), width: CELL, height: CELL }}
				aria-label={`${node.name}, rank ${rank} of ${maxRank}`}
			>
				<span
					className={cn(
						"block size-full overflow-hidden rounded-[4px] border bg-black/40",
						rank === 0 && "border-white/10",
					)}
					style={rank > 0 ? { borderColor: maxed ? GOLD : GREEN } : undefined}
				>
					{node.icon && (
						<img
							src={node.icon}
							alt=""
							loading="lazy"
							draggable={false}
							// Blizzard's icons carry a dark 1px frame; crop it.
							className={cn("size-full scale-[1.08] object-cover", rank === 0 && "opacity-40 grayscale")}
						/>
					)}
				</span>
				<span
					className={cn(
						"num absolute -right-2 -bottom-1.5 rounded-[3px] border border-border bg-background px-[3px] text-[10px] leading-[13px]",
						rank === 0 && "text-muted-foreground",
					)}
					style={rank > 0 ? { color: maxed ? GOLD : GREEN } : undefined}
				>
					{rank}/{maxRank}
				</span>
			</TooltipTrigger>
			<TooltipContent side="right" sideOffset={8} className="item-tooltip block max-w-none px-3 py-2">
				<TalentTooltipBody node={node} />
			</TooltipContent>
		</Tooltip>
	);
}

function TalentTooltipBody({ node }: { node: PlacedNode }) {
	const { rank, maxRank, ranks } = node;
	// At rank 0 the game shows what the first rank does, with no "Next rank".
	const current = ranks[Math.max(rank, 1) - 1];
	const next = rank > 0 && rank < maxRank ? ranks[rank] : undefined;
	return (
		<div className="w-72 max-w-[calc(100vw-2rem)] space-y-1 text-[13px] leading-snug text-white">
			<div className="font-semibold">{node.name}</div>
			<div className="num">
				Rank {rank}/{maxRank}
			</div>
			{current && <p style={{ color: GOLD }}>{current}</p>}
			{next && (
				<>
					<div className="pt-1">Next rank:</div>
					<p style={{ color: GOLD }}>{next}</p>
				</>
			)}
		</div>
	);
}

/** When layouts haven't synced: the character's talents as plain lists. */
export function TalentList({ tree }: { tree: CharacterTree }) {
	return (
		<section className="rounded-md border border-border bg-card">
			<header className="flex items-baseline justify-between border-b border-border px-3 py-2">
				<h2 className="text-sm font-semibold">{tree.name}</h2>
				<span className="num text-sm">{tree.points}</span>
			</header>
			<ul className="text-[13px]">
				{tree.talents.map((t) => (
					<li key={t.id ?? t.name} className="flex justify-between border-b border-border px-3 py-1.5 last:border-0">
						<span>{t.name}</span>
						<span className="num text-muted-foreground">{t.rank}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
