import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, convex, errorResponse, json } from "@/lib/helper-api";

// POST /api/helper/notifications (Bearer token): the desktop app, every
// minute. Notifications to show as system notifications, each handed out
// once. Body (optional): { optIn: ["itemsMailed"] }, the opt-in kinds the app
// shows (shared/notifications.ts CHANNELS). -> { notifications: [{ id, text,
// link }] } (link: a path on the site), or 401.
export const Route = createFileRoute("/api/helper/notifications")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const token = bearerToken(request);
				if (!token) return json(401, { error: "Missing token" });
				try {
					const body = (await request.json().catch(() => null)) as { optIn?: unknown } | null;
					const optIn = Array.isArray(body?.optIn)
						? body.optIn.filter((k): k is string => typeof k === "string" && k.length <= 40).slice(0, 20)
						: undefined;
					const notifications = await convex().mutation(api.helper.takeToasts, { token, optIn });
					return notifications ? json(200, { notifications }) : json(401, { error: "Unknown or revoked token" });
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
