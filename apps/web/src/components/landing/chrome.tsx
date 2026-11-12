import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/app-sidebar";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";
import { RELEASES, useInDesktopApp } from "@/lib/desktop";
import { REPO } from "./primitives";

// The landing page's own nav and footer (it has no sidebar).

const NAV = [
	{ href: "#features", label: "Features" },
	{ href: "#app", label: "Windows app" },
	{ href: "#open-source", label: "Open source" },
];

export function LandingNav() {
	const inApp = useInDesktopApp();
	return (
		<header className="landing-nav sticky top-0 z-40 border-b border-white/[0.06]">
			<div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 select-none sm:px-6 desktop:h-10">
				<Wordmark />
				<nav className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground max-md:hidden">
					{NAV.map((n) => (
						<a key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 transition-colors hover:text-foreground">
							{n.label}
						</a>
					))}
					<a
						href={REPO}
						target="_blank"
						rel="noreferrer"
						className="rounded-md px-2.5 py-1.5 transition-colors hover:text-foreground"
					>
						GitHub
					</a>
				</nav>
				<div className="ml-auto flex items-center gap-2">
					{/* In the app, /sign-in walks through signing in in the browser. */}
					{inApp ? (
						<Button nativeButton={false} render={<Link to="/sign-in" />}>
							Sign in
						</Button>
					) : (
						<SignInButton size="default">Sign in</SignInButton>
					)}
				</div>
			</div>
		</header>
	);
}

export function LandingFooter() {
	const inApp = useInDesktopApp();
	return (
		<footer className="border-t border-white/[0.06]">
			<div className="mx-auto grid max-w-6xl gap-10 px-4 pt-12 pb-10 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
				<div className="max-w-xs">
					<Wordmark />
					<p className="mt-3 text-[0.8125rem] text-pretty text-muted-foreground">
						The guild site for WoW: Forever. Free, open source, made by guild members.
					</p>
				</div>
				<FooterColumn title="Product">
					<FooterLink href="#features">Features</FooterLink>
					<FooterLink href="#addon">In-game addon</FooterLink>
					{!inApp && (
						<FooterLink href={RELEASES} external>
							Windows app
						</FooterLink>
					)}
					<FooterLink href="#ai">AI apps</FooterLink>
				</FooterColumn>
				<FooterColumn title="Open source">
					<FooterLink href={REPO} external>
						GitHub
					</FooterLink>
					<FooterLink href={`${REPO}/issues/new/choose`} external>
						Report a bug
					</FooterLink>
					<FooterLink href={`${REPO}/blob/main/CHANGELOG.md`} external>
						Changelog
					</FooterLink>
				</FooterColumn>
				<FooterColumn title="About the data">
					<li>
						<Link to="/data" className="transition-colors hover:text-foreground">
							Where the data comes from
						</Link>
					</li>
					<li>Sign-in: your BattleTag and character list</li>
					<li>Battle.net tokens are never kept</li>
				</FooterColumn>
			</div>
			<div className="mx-auto max-w-6xl px-4 sm:px-6">
				<div className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-white/[0.06] py-5 text-xs text-muted-foreground">
					<span>MIT licensed. Item, talent and dungeon art from Blizzard's game data.</span>
					<span>Not affiliated with or endorsed by Blizzard Entertainment.</span>
				</div>
			</div>
		</footer>
	);
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="text-[0.8125rem]">
			<h3 className="font-medium">{title}</h3>
			<ul className="mt-3 space-y-2 text-muted-foreground">{children}</ul>
		</div>
	);
}

function FooterLink({ href, external, children }: { href: string; external?: boolean; children: ReactNode }) {
	return (
		<li>
			<a
				href={href}
				{...(external ? { target: "_blank", rel: "noreferrer" } : {})}
				className="transition-colors hover:text-foreground"
			>
				{children}
			</a>
		</li>
	);
}
