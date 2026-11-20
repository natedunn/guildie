import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouter } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { NavSheet } from "@/components/app-sidebar";
import { useBreadcrumbs } from "@/lib/breadcrumbs";
import { useDesktopPlatform } from "@/lib/desktop";

// The title bar over the content pane: where you are (breadcrumbs), and in the
// desktop app back / forward too. There the whole row drags the window
// (app.css .app-titlebar) and the window draws its own buttons over it:
// minimize / maximize / close at the right end on Windows and Linux, the
// traffic lights at the window's left on macOS (over the sidebar, or this
// row's start when the sidebar is hidden; app.css leaves room for both). On
// the web it's a plain row (the browser has back and forward).

export function AppTitleBar() {
	const crumbs = useBreadcrumbs();
	const { canBack, canForward, back, forward } = useHistoryButtons();
	// The keys the app's window listens for (apps/desktop/src/window.ts): Cmd+[ and Cmd+] on a Mac.
	const mac = useDesktopPlatform() === "mac";
	return (
		<div className="app-titlebar">
			<NavSheet className="md:hidden" />
			<span className="hidden gap-0.5 desktop:flex">
				<TitleButton
					label={mac ? "Back (⌘[)" : "Back (Alt+Left)"}
					disabled={!canBack}
					onClick={back}
					icon={ArrowLeft01Icon}
				/>
				<TitleButton
					label={mac ? "Forward (⌘])" : "Forward (Alt+Right)"}
					disabled={!canForward}
					onClick={forward}
					icon={ArrowRight01Icon}
				/>
			</span>
			<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs desktop:ml-2">
				{crumbs.map((c, i) => {
					const last = i === crumbs.length - 1;
					return (
						<Fragment key={`${i}-${c.label}`}>
							{i > 0 && <span className="text-muted-foreground/50">/</span>}
							{c.link && !last ? (
								<Link
									to={c.link.to}
									params={c.link.params}
									className="truncate rounded px-1 text-muted-foreground hover:text-foreground"
								>
									{c.label}
								</Link>
							) : (
								<span className={last ? "truncate px-1 text-foreground" : "truncate px-1 text-muted-foreground"}>
									{c.label}
								</span>
							)}
						</Fragment>
					);
				})}
			</nav>
		</div>
	);
}

function TitleButton({
	label,
	disabled,
	onClick,
	icon,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	icon: typeof ArrowLeft01Icon;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className="grid h-7 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
		>
			<HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} />
		</button>
	);
}

/**
 * Back and forward, enabled only when there's somewhere to go. The browser
 * doesn't say whether forward is possible, so this remembers the furthest
 * history index seen this session (TanStack's history stamps every entry).
 */
function useHistoryButtons() {
	const router = useRouter();
	const [state, setState] = useState({ index: 0, max: 0 });
	useEffect(() => {
		const history = router.history;
		const indexOf = () => history.location.state.__TSR_index ?? 0;
		const start = indexOf();
		setState({ index: start, max: start });
		return history.subscribe(({ action }) => {
			const index = indexOf();
			// A new entry drops everything that was ahead of it.
			setState((s) => ({ index, max: action.type === "PUSH" ? index : Math.max(s.max, index) }));
		});
	}, [router]);
	return {
		canBack: state.index > 0,
		canForward: state.index < state.max,
		back: () => router.history.back(),
		forward: () => router.history.forward(),
	};
}
