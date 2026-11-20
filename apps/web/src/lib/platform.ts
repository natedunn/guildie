// Which computer the desktop app runs on, and which one a visitor is on (to
// offer the right download). No React or router imports, so node --test can
// load it (platform.test.ts); lib/desktop.ts re-exports what the app uses.

/** The systems the Guildie app runs on. */
export type DesktopPlatform = "win" | "mac" | "linux";

/** A visitor's system: one the app runs on, or something else (phones, tablets, ChromeOS). */
export type VisitorOS = DesktopPlatform | "other";

/**
 * What the desktop app says about itself in its user agent: the window appends
 * " GuildieDesktop/<version>", plus " (Mica)" when the window has Windows 11's
 * Mica behind it, then " Platform/<win|mac|linux>" (apps/desktop/src/window.ts).
 * Apps from before macOS and Linux send no Platform: they're Windows. Read on
 * the server too, so the first paint already has the app's layout
 * (html[data-desktop], html[data-platform]).
 */
export type DesktopInfo = { version: string; mica: boolean; platform: DesktopPlatform };

export function parseDesktopUserAgent(ua: string | null | undefined): DesktopInfo | null {
	const text = ua ?? "";
	const match = /\bGuildieDesktop\/([\w.+-]+)( \(Mica\))?/.exec(text);
	if (!match) return null;
	const platform = /\bPlatform\/(win|mac|linux)\b/.exec(text.slice(match.index))?.[1] as DesktopPlatform | undefined;
	return { version: match[1], mica: !!match[2], platform: platform ?? "win" };
}

type NavigatorLike = {
	userAgent?: string;
	platform?: string;
	maxTouchPoints?: number;
	userAgentData?: { platform?: string; mobile?: boolean };
};

/** The visitor's system, from the browser (client only). Phones and tablets are "other". */
export function visitorOS(nav: NavigatorLike): VisitorOS {
	const ua = nav.userAgent ?? "";
	if (nav.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile|CrOS/i.test(ua)) return "other";
	const hint = `${nav.userAgentData?.platform ?? ""} ${nav.platform ?? ""} ${ua}`;
	if (/Win/i.test(hint)) return "win";
	// iPadOS asks for desktop sites as a Mac; only it has a touch screen.
	if (/Mac/i.test(hint)) return (nav.maxTouchPoints ?? 0) > 1 ? "other" : "mac";
	if (/Chrome OS|ChromeOS/i.test(hint)) return "other";
	if (/Linux|X11/i.test(hint)) return "linux";
	return "other";
}

/** Where the Guildie app's installer is (GitHub Releases; the app updates itself from there too). */
export const RELEASES = "https://github.com/natedunn/guildie/releases/latest";

/**
 * The download for each system. Windows' installer has the version in its
 * name, so it links the release page; macOS and Linux have stable names.
 */
export const DOWNLOADS: Record<DesktopPlatform, { name: string; href: string; file: string }> = {
	win: { name: "Windows", href: RELEASES, file: "Guildie-Setup.exe" },
	mac: {
		name: "macOS",
		href: `${RELEASES}/download/Guildie-mac-universal.dmg`,
		file: "Guildie-mac-universal.dmg",
	},
	linux: {
		name: "Linux",
		href: `${RELEASES}/download/Guildie-linux-x86_64.AppImage`,
		file: "Guildie-linux-x86_64.AppImage",
	},
};
