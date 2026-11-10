import { api } from "@convex/_generated/api";
import { PAYLOAD_VERSIONS } from "@convex/addonPayload";
import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, convex, errorResponse, json } from "@/lib/helper-api";

// POST /api/helper/snapshot: the helper uploads what the addon saved.
// Body: { "version": 1 | 2 | 3, "characters": [ ... ] } (docs/addon.md, "API").
// 200 { accepted: [slug], unmatched: [name], rejected: [name] }. Characters
// must be claimed by the token's owner; each is checked on its own
// (convex/addonPayload.ts), so one bad character doesn't sink the rest.
// Version 2 carries gear with tooltips and every profession's recipes: a few
// tens of KB per character (version 3 adds bags and bank, a few KB), so the
// cap leaves room for a full account.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export const Route = createFileRoute("/api/helper/snapshot")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const token = bearerToken(request);
				if (!token) return json(401, { error: "Missing token" });
				const text = await request.text();
				if (text.length > MAX_BODY_BYTES) return json(413, { error: "Upload too large" });
				let body: { version?: unknown; characters?: unknown };
				try {
					body = JSON.parse(text);
				} catch {
					return json(400, { error: "Body must be JSON" });
				}
				const version = PAYLOAD_VERSIONS.find((v) => v === body.version);
				if (!version || !Array.isArray(body.characters)) {
					return json(400, { error: `Expected { version: ${PAYLOAD_VERSIONS.join(" or ")}, characters: [...] }` });
				}
				try {
					const result = await convex().mutation(api.helper.ingest, { token, version, characters: body.characters });
					return json(200, result);
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
