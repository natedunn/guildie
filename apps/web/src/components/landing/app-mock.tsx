import { CLASSES } from "@convex/shared/wow";
import {
	Activity01Icon,
	AnvilIcon,
	ArrowRight01Icon,
	Castle01Icon,
	GameController03Icon,
	InboxIcon,
	MoneyBag01Icon,
	RefreshIcon,
	ScrollTextIcon,
	Search01Icon,
	Settings02Icon,
	Shield01Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { GuildieMark } from "@/components/mark";
import { cn } from "@/lib/utils";
import { MEMBERS } from "./primitives";

// The hero's product shot: Guildie's roster as the app draws it (sidebar,
// title bar, the roster's Overview), built from the same pieces with the
// sample guild in it. A picture, not the page: nothing in it is a link.

export function AppMock({ className }: { className?: string }) {
	return (
		<div
			aria-hidden
			inert
			className={cn(
				"@container flex h-[37rem] overflow-hidden rounded-[inherit] bg-chrome text-left select-none",
				className,
			)}
		>
			<MockSidebar />
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex h-10 flex-none items-center gap-1.5 border-b border-border px-4 text-[0.8125rem]">
					<span className="text-muted-foreground">Lantern Watch</span>
					<HugeiconsIcon icon={ArrowRight01Icon} size={13} className="text-muted-foreground/60" />
					<span className="font-medium">Roster</span>
				</div>
				<div className="min-h-0 flex-1 overflow-hidden bg-background px-6 pt-6">
					<h3 className="text-[1.0625rem] font-semibold">Lantern Watch</h3>
					<p className="num mt-0.5 text-[0.8125rem] text-muted-foreground">US · Alliance · 64 members</p>
					<div className="mt-4 flex items-center gap-3">
						<div className="flex h-8 w-56 flex-none items-center gap-2 rounded-md border border-input px-2.5 text-[0.8125rem] text-muted-foreground">
							<HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.75} />
							Search
						</div>
						<div className="flex min-w-0 gap-1 overflow-hidden">
							<span className="chip" data-active="true">
								All <span className="num text-muted-foreground">64</span>
							</span>
							{[
								[1, 11],
								[11, 9],
								[8, 8],
								[4, 7],
								[5, 7],
								[2, 6],
								[9, 6],
								[3, 10],
							].map(([id, n]) => (
								<span key={id} className="chip flex-none">
									<ClassText classId={id}>{CLASSES[id]?.name}</ClassText>
									<span className="num text-muted-foreground">{n}</span>
								</span>
							))}
						</div>
					</div>
					<div className="mt-4 flex gap-5 border-b border-border text-[0.8125rem]">
						{["Overview", "Stat priority", "Gear", "Professions"].map((t, i) => (
							<span
								key={t}
								className={cn(
									"-mb-px pb-2",
									i === 0 ? "border-b-2 border-foreground font-medium" : "text-muted-foreground",
								)}
							>
								{t}
							</span>
						))}
					</div>
					<RosterTable />
				</div>
			</div>
		</div>
	);
}

function MockSidebar() {
	return (
		<div className="flex w-[220px] flex-none flex-col border-r border-border text-[0.8125rem] @max-2xl:hidden">
			<div className="flex h-10 flex-none items-center gap-2 px-4 text-[0.9375rem] font-semibold tracking-tight">
				<GuildieMark />
				Guildie
			</div>
			<div className="flex-1 space-y-5 px-2 pt-2">
				<div>
					<div className="px-2 pb-1 font-semibold">Guilds</div>
					<div className="truncate px-2 pt-0.5 pb-1.5 text-xs font-medium text-muted-foreground">Lantern Watch</div>
					<div className="space-y-px">
						<NavRow icon={UserGroupIcon} active>
							Roster
						</NavRow>
						<NavRow icon={Activity01Icon}>Feed</NavRow>
						<NavRow icon={AnvilIcon}>Crafting</NavRow>
						<NavRow icon={Shield01Icon}>Gear</NavRow>
						<NavRow icon={Castle01Icon}>Dungeons</NavRow>
						<NavRow icon={InboxIcon} count={3}>
							Requests
						</NavRow>
					</div>
				</div>
				<div>
					<div className="px-2 pb-1 font-semibold">Personal</div>
					<NavRow icon={MoneyBag01Icon} indent={false}>
						Inventory
					</NavRow>
					<NavRow icon={ScrollTextIcon} indent={false}>
						Quests
					</NavRow>
				</div>
				<div>
					<div className="px-2 pb-1 font-semibold">Characters</div>
					{(["Brisket", "Wren"] as const).map((name) => {
						const m = MEMBERS.find((x) => x.name === name);
						if (!m) return null;
						return (
							<div key={name} className="nav-item h-9 pl-1.5">
								<CharacterAvatar size={24} className="rounded-full" />
								<span className="min-w-0 flex-1 truncate">
									<ClassText classId={m.classId}>{m.name}</ClassText>
									<span className="text-muted-foreground"> {m.surname}</span>
								</span>
								<span className="num text-xs text-muted-foreground">lvl {m.level}</span>
							</div>
						);
					})}
				</div>
			</div>
			<div className="flex-none space-y-px border-t border-border p-2">
				<div className="nav-item">
					<HugeiconsIcon icon={RefreshIcon} size={15} strokeWidth={1.75} />
					Synced 4 min ago
				</div>
				<NavRow icon={Settings02Icon} indent={false}>
					<span className="flex-1">Settings</span>
					<span className="text-xs text-muted-foreground">Brisket</span>
				</NavRow>
			</div>
		</div>
	);
}

function NavRow({
	icon,
	active,
	count,
	indent = true,
	children,
}: {
	icon: IconSvgElement;
	active?: boolean;
	count?: number;
	indent?: boolean;
	children: ReactNode;
}) {
	return (
		<div className={cn("nav-item", indent && "pl-3")} data-status={active ? "active" : undefined}>
			<HugeiconsIcon icon={icon} size={15} strokeWidth={1.75} />
			<span className="flex flex-1 items-center">{children}</span>
			{count ? <span className="num text-xs text-muted-foreground">{count}</span> : null}
		</div>
	);
}

function RosterTable() {
	return (
		<table className="mt-1 w-full text-[0.8125rem]">
			<thead className="text-left text-muted-foreground">
				<tr className="border-b border-border">
					<th className="py-2 pr-3 font-medium">Name</th>
					<th className="px-3 py-2 text-right font-medium">Level</th>
					<th className="px-3 py-2 font-medium @max-xl:hidden">Race and class</th>
					<th className="px-3 py-2 font-medium @max-3xl:hidden">Talents</th>
					<th className="px-3 py-2 text-right font-medium @max-4xl:hidden">Item level</th>
					<th className="py-2 pl-3 text-right font-medium @max-lg:hidden">Last synced</th>
				</tr>
			</thead>
			<tbody>
				{MEMBERS.map((m, i) => (
					<tr key={m.name} className={cn("border-b border-white/5", i === 1 && "bg-hover")}>
						<td className="py-[0.4375rem] pr-3 whitespace-nowrap">
							<ClassText classId={m.classId} className="font-medium">
								{m.name}
							</ClassText>{" "}
							<span className="text-muted-foreground">{m.surname}</span>
						</td>
						<td className="num px-3 text-right">{m.level}</td>
						<td className="px-3 whitespace-nowrap @max-xl:hidden">
							<span className="text-muted-foreground">{m.race} </span>
							<ClassText classId={m.classId}>{CLASSES[m.classId]?.name}</ClassText>
						</td>
						<td className="num px-3 whitespace-nowrap @max-3xl:hidden">
							{m.talents.map((t, j) => (
								<span key={t} className={cn(j > 0 && "text-muted-foreground")}>
									{j > 0 && " · "}
									{t}
								</span>
							))}
						</td>
						<td className="num px-3 text-right @max-4xl:hidden">{m.ilvl}</td>
						<td className="num pl-3 text-right whitespace-nowrap text-muted-foreground @max-lg:hidden">
							<span className="inline-flex items-center gap-1.5">
								{"app" in m && m.app && (
									<HugeiconsIcon
										icon={GameController03Icon}
										size={14}
										strokeWidth={1.75}
										className="text-foreground/80"
									/>
								)}
								{m.synced}
							</span>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
