import { useRouteContext } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

// The Guildie desktop app loads this site in its window and exposes this
// bridge (Electron contextBridge) on our own origins only. The site gives it
// an upload token once the player is signed in (components/desktop-bridge.tsx)
// and signs it out with the site. Contract: docs/addon.md.

export type GuildieDesktop = {
	isDesktop: true;
	version: string;
	getState(): Promise<{ connected: boolean; account?: string }>;
	setToken(token: string, account?: string): Promise<void>;
	signOut(): Promise<void>;
	/**
	 * Sign in through the player's own browser (any Battle.net login works
	 * there, Google included); the app then signs its window in by itself
	 * (/desktop/session). Missing in app builds before 0.2.
	 */
	signIn?(): Promise<void>;
	/** Sync status, and its changes (app 0.2+). */
	getStatus?(): Promise<DesktopStatus>;
	onStatus?(callback: (status: DesktopStatus) => void): () => void;
	/** The Addon page (app 0.3.1+). */
	addon?: {
		info(): Promise<AddonInfo>;
		install(): Promise<AddonInfo>;
		uninstall(options: { savedData: boolean }): Promise<AddonInfo>;
		openFolder(): Promise<void>;
	};
	chooseWowFolder?(): Promise<AddonInfo>;
	uploadNow?(): Promise<void>;
	restartToUpdate?(): Promise<void>;
	/** Check for an app update now (app 0.3.5+). */
	checkForUpdates?(): Promise<UpdateState>;
};

/** Where the app's self-update stands (apps/desktop/src/updater.ts). */
export type UpdateState =
	| { state: "off" }
	| { state: "idle" }
	| { state: "checking" }
	| { state: "downloading"; version: string; percent?: number }
	| { state: "ready"; version: string }
	| { state: "current"; checkedAt: number }
	| { state: "failed"; checkedAt: number; message: string };

export type AddonInfo = {
	appVersion: string;
	/** The addon version this app installs. */
	bundled?: string;
	wowFolder?: string;
	/** The WoW folder has a _forever_ folder (where the addon goes). */
	hasForever: boolean;
	/** False after the player uninstalled it: the app won't put it back by itself. */
	managed: boolean;
	installs: { flavor: string; folder: string; version?: string; broken?: boolean }[];
	/** An app update is downloaded, waiting for a restart. */
	updateReady?: string;
};

export type DesktopStatus = {
	connected: boolean;
	account?: string;
	wowFolder?: string;
	guildDataAt?: number;
	/** While signing in: the code the browser's Connect page should show. */
	pairingCode?: string;
	/** Character slugs ("todd-bonzalez"), as uploaded. */
	lastUpload?: { at: number; characters: string[] };
	addonVersion?: string;
	/** False after the player uninstalled the addon (apps 0.3.12+). */
	addonManaged?: boolean;
	/** The addon version this app installs (apps 0.3.12+). */
	addonBundled?: string;
	/**
	 * The addon version the game last ran (apps 0.3.12+): older than
	 * `addonVersion` means WoW needs a /reload. null: an addon from before
	 * 0.10.1; undefined: unknown.
	 */
	addonLoaded?: string | null;
	updateReady?: string;
	update?: UpdateState;
};

declare global {
	interface Window {
		guildieDesktop?: GuildieDesktop;
	}
}

/**
 * What the desktop app says about itself in its user agent: the window appends
 * " GuildieDesktop/<version>", plus " (Mica)" when the window has Windows 11's
 * Mica behind it (apps/desktop/src/window.ts). Read on the server too, so the
 * first paint already has the app's layout (html[data-desktop]).
 */
export type DesktopInfo = { version: string; mica: boolean };

export function parseDesktopUserAgent(ua: string | null | undefined): DesktopInfo | null {
	const match = /\bGuildieDesktop\/([\w.+-]+)( \(Mica\))?/.exec(ua ?? "");
	return match ? { version: match[1], mica: !!match[2] } : null;
}

/** The current request's (server) or the window's (client) desktop app, if any. */
export const readDesktopInfo = createIsomorphicFn()
	.server(async () => {
		const { getRequestHeader } = await import("@tanstack/react-start/server");
		return parseDesktopUserAgent(getRequestHeader("user-agent"));
	})
	.client(async () => parseDesktopUserAgent(navigator.userAgent));

/**
 * True inside the desktop app. Known from the user agent during SSR, so markup
 * matches; app builds before 0.2 don't send it and are found once mounted.
 */
export function useInDesktopApp() {
	const fromAgent = useRouteContext({ from: "__root__", select: (c) => !!c.desktop });
	const [bridged, setBridged] = useState(false);
	useEffect(() => setBridged(!!desktop()), []);
	return fromAgent || bridged;
}

/** The desktop app's bridge, when this page is running inside it. */
export function desktop(): GuildieDesktop | undefined {
	if (typeof window === "undefined") return undefined;
	const bridge = window.guildieDesktop;
	return bridge?.isDesktop === true ? bridge : undefined;
}

/** The desktop app's live status (sync, addon, a downloaded update), or null outside the app. */
export function useDesktopStatus() {
	const [status, setStatus] = useState<DesktopStatus | null>(null);
	useEffect(() => {
		const app = desktop();
		if (!app?.getStatus || !app.onStatus) return;
		void app.getStatus().then(setStatus);
		return app.onStatus(setStatus);
	}, []);
	return status;
}

/** Where the Guildie app's installer is (GitHub Releases; the app updates itself from there too). */
export const RELEASES = "https://github.com/natedunn/guildie/releases/latest";
