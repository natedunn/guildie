import { convexAuthProvider } from "@convex-dev/auth/server";

// The deployment signs the session tokens itself (Convex Auth 2.0).
export default {
	providers: [convexAuthProvider()],
};
