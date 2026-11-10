// What link previews (Discord, iMessage, social sites) show for a page: the
// share image (public/og.png, from og/og.html) for every page, with the
// page's own title and description where it has them (guilds, characters).
// The root route sets the defaults; a page's head() overrides them (the
// deepest route's tag wins).

/** The site's own origin, baked in at build (previews get theirs). */
const SITE = (import.meta.env.VITE_SITE_URL as string | undefined) || "https://guildie.club";

export const DEFAULT_TITLE = "Guildie";
export const DEFAULT_DESCRIPTION =
	"Your World of Warcraft guild's roster, gear, talents and crafters, for WoW: Forever.";

/** The default tags, on every page (root route). */
export const defaultShareMeta = [
	{ name: "description", content: DEFAULT_DESCRIPTION },
	{ property: "og:site_name", content: "Guildie" },
	{ property: "og:type", content: "website" },
	{ property: "og:title", content: DEFAULT_TITLE },
	{ property: "og:description", content: DEFAULT_DESCRIPTION },
	{ property: "og:image", content: `${SITE}/og.png` },
	{ property: "og:image:width", content: "1200" },
	{ property: "og:image:height", content: "630" },
	{ property: "og:image:alt", content: "Guildie: your guild's roster, gear, talents and crafters." },
	{ name: "twitter:card", content: "summary_large_image" },
	{ name: "twitter:title", content: DEFAULT_TITLE },
	{ name: "twitter:description", content: DEFAULT_DESCRIPTION },
	{ name: "twitter:image", content: `${SITE}/og.png` },
];

/** A page's own title and description for previews (the image stays the default). */
export function shareMeta(title: string, description: string) {
	return [
		{ name: "description", content: description },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
	];
}
