import { createFileRoute, redirect } from "@tanstack/react-router";

// The Inventory tab moved to Personal → Inventory (all your characters at
// once); old links open it on this character.
export const Route = createFileRoute("/c/$region/$slug/inventory")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/inventory", search: { character: params.slug }, replace: true });
	},
});
