import { api } from "@convex/_generated/api";
import { type ConvexQueryClient, convexQuery } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { type ConvexReactClient, useConvexAuth } from "convex/react";
import { type ReactNode, useEffect, useRef } from "react";
import { AppSidebar, AppTopBar } from "@/components/app-sidebar";
import { AppTitleBar } from "@/components/app-titlebar";
import { DesktopBridge } from "@/components/desktop-bridge";
import { ItemSheet } from "@/components/item-sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAuthToken } from "@/lib/convex-auth-start/functions";
import { ConvexAuthStartProvider } from "@/lib/convex-auth-start/provider";
import { readDesktopInfo } from "@/lib/desktop";
import { defaultShareMeta } from "@/lib/share";
import appCss from "@/styles/app.css?url";

export type RouterContext = {
	convex: ConvexReactClient;
	queryClient: QueryClient;
	convexQueryClient: ConvexQueryClient;
	token: string | null;
};

export const Route = createRootRouteWithContext<RouterContext>()({
	// `?item=<id>` opens the item panel over any page (components/item-sheet.tsx).
	validateSearch: (search: Record<string, unknown>): { item?: number } => {
		const item = Number(search.item);
		return Number.isInteger(item) && item > 0 ? { item } : {};
	},
	beforeLoad: async ({ context }) => {
		const [token, desktop] = await Promise.all([getAuthToken(), readDesktopInfo()]);
		// SSR queries run over HTTP; give them the request's identity.
		if (token) context.convexQueryClient.serverHttpClient?.setAuth(token);
		return { token, desktop };
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}));
	},
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			// viewport-fit=cover: phones draw the page under the notch and home
			// indicator; .app-shell keeps to the safe area (styles/app.css).
			{ name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
			{ name: "theme-color", content: "#13110e" },
			// Installable from the home screen (public/manifest.webmanifest). On iOS
			// the status bar goes translucent over the chrome color.
			{ name: "mobile-web-app-capable", content: "yes" },
			{ name: "apple-mobile-web-app-capable", content: "yes" },
			{ name: "apple-mobile-web-app-title", content: "Guildie" },
			{ name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
			{ title: "Guildie" },
			...defaultShareMeta,
		],
		links: [
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "manifest", href: "/manifest.webmanifest" },
			{ rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
			{ rel: "stylesheet", href: appCss },
		],
	}),
	shellComponent: RootDocument,
	component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
	// The desktop app's layout from the first paint (see readDesktopInfo).
	const desktop = Route.useRouteContext({ select: (c) => c.desktop });
	return (
		<html
			lang="en"
			data-desktop={desktop ? "true" : undefined}
			data-material={desktop?.mica ? "mica" : undefined}
			suppressHydrationWarning
		>
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootComponent() {
	const { convex, token } = Route.useRouteContext();
	return (
		<ConvexAuthStartProvider client={convex} initialToken={token}>
			<TooltipProvider>
				<AuthSync />
				<DesktopBridge />
				<div className="app-shell">
					<AppSidebar />
					<div className="app-main">
						<AppTitleBar />
						<AppTopBar />
						<main id="content" data-scroll-restoration-id="content" className="app-content px-4 sm:px-6">
							<Outlet />
						</main>
						<ItemSheet />
					</div>
				</div>
			</TooltipProvider>
		</ConvexAuthStartProvider>
	);
}

/** Re-runs route guards/loaders when the browser signs in or out (e.g. after the OAuth redirect). */
function AuthSync() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();
	const previous = useRef<boolean | null>(null);
	useEffect(() => {
		if (isLoading) return;
		if (previous.current !== null && previous.current !== isAuthenticated) {
			void router.invalidate();
		}
		previous.current = isAuthenticated;
	}, [isAuthenticated, isLoading, router]);
	return null;
}
