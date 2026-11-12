import authAnonymous from "@convex-dev/auth/components/anonymous/convex.config.js";
import authOauth from "@convex-dev/auth/components/oauth/convex.config.js";
import auth from "@convex-dev/auth/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
	env: {
		// One Blizzard API client serves sign-in, character claiming and the
		// roster sync. See docs/blizzard-setup.md.
		AUTH_BATTLENET_CLIENT_ID: v.string(),
		AUTH_BATTLENET_CLIENT_SECRET: v.string(),
		// The gateway's sign-in callback, e.g.
		// https://gateway-dev.guildie.club/oauth/battlenet/callback. Unset = the
		// deployment's own callback. Needs our @convex-dev/auth patch.
		AUTH_BATTLENET_CALLBACK_URL: v.optional(v.string()),
	},
});

// The deployment serves the session JWKS itself, so the core has no HTTP routes.
app.use(auth);
// Battle.net has no built-in Convex Auth method, so it runs on the generic
// OAuth component. Callback: <CONVEX_SITE_URL>/oauth/battlenet/callback, or
// the gateway's (docs/auth-environments.md).
app.use(authOauth, {
	name: "authBattlenet",
	httpPrefix: "/oauth/battlenet",
	env: {
		CLIENT_ID: app.env.AUTH_BATTLENET_CLIENT_ID,
		CLIENT_SECRET: app.env.AUTH_BATTLENET_CLIENT_SECRET,
		CALLBACK_URL: app.env.AUTH_BATTLENET_CALLBACK_URL,
	},
});
// Backs the dev-only guest sign-in (see auth.ts). Local backends only.
app.use(authAnonymous);

export default app;
