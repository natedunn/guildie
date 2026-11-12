import { ArrowRight01Icon, Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";
import { RELEASES, useInDesktopApp } from "@/lib/desktop";
import { AppMock } from "./app-mock";
import { GameTooltip, GLOVES } from "./primitives";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export function Hero() {
	const inApp = useInDesktopApp();
	return (
		<section className="relative isolate">
			{/* Lines and a glow behind it all. */}
			<div aria-hidden className="landing-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]" />
			<div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-16 text-center sm:px-6 sm:pt-24">
				<a
					href="#open-source"
					style={delay(0)}
					className="landing-enter group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pr-2.5 pl-3 text-xs text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
				>
					<span className="text-foreground">Free and open source</span>
					<span className="h-3 w-px bg-white/15" />
					Built for WoW: Forever
					<HugeiconsIcon
						icon={ArrowRight01Icon}
						size={13}
						className="transition-transform group-hover:translate-x-0.5"
					/>
				</a>
				<h1
					style={delay(80)}
					className="landing-enter landing-display landing-fade-text mt-7 max-w-4xl text-[2.75rem] sm:text-6xl lg:text-[4.75rem]"
				>
					Your whole guild,
					<br />
					in sync.
				</h1>
				<p
					style={delay(160)}
					className="landing-enter mt-6 max-w-[38rem] text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
				>
					Guildie keeps your guild's roster, gear, talents and crafters current, then tells you who an item is for, who
					can make it, and who's ready for which dungeon. On the web, in a Windows app, and on your tooltips in game.
				</p>
				<div
					style={delay(240)}
					className="landing-enter mt-9 flex flex-wrap items-start justify-center gap-3 [&>span]:items-center [&>span]:text-center"
				>
					<SignInButton className="h-10 px-5" />
					{!inApp && (
						<Button
							size="lg"
							variant="outline"
							className="h-10 bg-white/[0.02] px-5"
							nativeButton={false}
							render={<a href={RELEASES} target="_blank" rel="noreferrer" />}
						>
							<HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
							Get the Windows app
						</Button>
					)}
				</div>
			</div>

			<HeroShot />
		</section>
	);
}

/** The app, framed, leaning back, with an item tooltip floating over it. */
function HeroShot() {
	return (
		<div className="relative mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6">
			<div aria-hidden className="landing-glow pointer-events-none absolute inset-x-[4%] -top-24 -z-10 h-[34rem]" />
			<div className="landing-tilt landing-fade-bottom">
				<div style={delay(350)} className="landing-enter landing-frame overflow-hidden">
					{/* A streak of light along the top edge. */}
					<div
						aria-hidden
						className="absolute inset-x-[12%] top-0 z-10 h-px bg-gradient-to-r from-transparent via-[rgb(200_140_255/0.8)] to-transparent"
					/>
					<AppMock className="min-w-[38rem]" />
				</div>
			</div>
			<div
				aria-hidden
				style={delay(700)}
				className="landing-enter absolute top-[44%] right-2 z-10 hidden md:block lg:top-[38%] lg:-right-2"
			>
				<GameTooltip
					item={GLOVES}
					lines={[
						{ name: "Pip", note: "upgrade (Combat)" },
						{ name: "Brisket", note: "upgrade (Feral)" },
						{ name: "Miller", note: "maybe (lvl 22)" },
					]}
				/>
			</div>
		</div>
	);
}
