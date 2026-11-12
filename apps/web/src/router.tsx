import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexReactClient } from "convex/react";
import { ErrorPage, NotFoundPage } from "@/components/status-pages";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
	if (!convexUrl) throw new Error("Missing VITE_CONVEX_URL");

	// Created per router (i.e. per SSR request) so server-side auth never leaks
	// between requests.
	const convex = new ConvexReactClient(convexUrl, {
		unsavedChangesWarning: false,
		// Keep the token the page starts with (fresh from the server render or a
		// sign-in) until near its expiry, rather than refreshing it at once. That
		// refresh used to be in flight when /sign-in left for the claim hop, which
		// cut it off and could leave the next page signed out.
		initialAuthTokenReuse: true,
	});
	const convexQueryClient = new ConvexQueryClient(convex);
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				queryKeyHashFn: convexQueryClient.hashFn(),
				queryFn: convexQueryClient.queryFn(),
			},
		},
	});
	convexQueryClient.connect(queryClient);

	const router = createRouter({
		routeTree,
		context: { convex, queryClient, convexQueryClient, token: null },
		defaultPreload: "intent",
		scrollRestoration: true,
		// Restore the content pane on desktop; the window also restores normally
		// when phone browsers use document scrolling.
		scrollToTopSelectors: ["#content"],
		defaultErrorComponent: ErrorPage,
		defaultNotFoundComponent: NotFoundPage,
	});
	setupRouterSsrQueryIntegration({ router, queryClient });
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
