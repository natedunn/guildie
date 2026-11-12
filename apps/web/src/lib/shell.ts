import { useMatches } from "@tanstack/react-router";

// Which frame the root draws around a page (routes/__root.tsx). Most pages get
// the app shell: sidebar, title bar, one content pane. A route can ask for
// another with `staticData: { shell }`:
// - "onboarding": the sign-in flow's routes, one card filling the window
//   without the sidebar (components/onboarding.tsx).
// - "landing": the marketing page for signed-out visitors (components/landing),
//   full width with its own nav and footer, the window scrolling. Signed in,
//   the route gets the app shell like any page.

export type Shell = "onboarding" | "landing";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/** Draw this page without the app shell (lib/shell.ts). */
		shell?: Shell;
	}
}

/** The shell the deepest matched route asks for, if any. */
export function useRouteShell(): Shell | undefined {
	return useMatches({
		select: (matches) => {
			let shell: Shell | undefined;
			for (const m of matches) shell = m.staticData?.shell ?? shell;
			return shell;
		},
	});
}
