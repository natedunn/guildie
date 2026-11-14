import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, convex, errorResponse, json } from "@/lib/helper-api";

// POST /api/helper/notifications (Bearer token): the Windows app, every
// minute. Notifications to show as system notifications, each handed out
// once. -> { notifications: [{ id, text, link }] } (link: a path on the site), or 401.
export const Route = createFileRoute("/api/helper/notifications")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const token = bearerToken(request);
				if (!token) return json(401, { error: "Missing token" });
				try {
					const notifications = await convex().mutation(api.helper.takeToasts, { token });
					return notifications ? json(200, { notifications }) : json(401, { error: "Unknown or revoked token" });
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
