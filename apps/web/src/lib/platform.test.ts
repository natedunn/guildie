import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDesktopUserAgent, visitorOS } from "./platform.ts";

const CHROME =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Safari/537.36";

test("desktop user agent: older Windows apps send no Platform", () => {
	assert.deepEqual(parseDesktopUserAgent(`${CHROME} GuildieDesktop/0.3.5`), {
		version: "0.3.5",
		mica: false,
		platform: "win",
	});
	assert.deepEqual(parseDesktopUserAgent(`${CHROME} GuildieDesktop/0.3.49 (Mica)`), {
		version: "0.3.49",
		mica: true,
		platform: "win",
	});
});

test("desktop user agent: Platform token", () => {
	assert.deepEqual(parseDesktopUserAgent(`${CHROME} GuildieDesktop/0.4.0 (Mica) Platform/win`), {
		version: "0.4.0",
		mica: true,
		platform: "win",
	});
	assert.deepEqual(parseDesktopUserAgent("Mozilla/5.0 (Macintosh) GuildieDesktop/0.4.0 Platform/mac"), {
		version: "0.4.0",
		mica: false,
		platform: "mac",
	});
	assert.deepEqual(
		parseDesktopUserAgent("Mozilla/5.0 (X11; Linux x86_64) GuildieDesktop/0.4.0-beta.1 Platform/linux"),
		{
			version: "0.4.0-beta.1",
			mica: false,
			platform: "linux",
		},
	);
	// An unknown system is treated like the apps without one.
	assert.equal(parseDesktopUserAgent("x GuildieDesktop/0.4.0 Platform/bsd")?.platform, "win");
});

test("desktop user agent: not the app", () => {
	assert.equal(parseDesktopUserAgent(CHROME), null);
	assert.equal(parseDesktopUserAgent(undefined), null);
	assert.equal(parseDesktopUserAgent("Platform/mac"), null);
});

test("visitor OS", () => {
	assert.equal(visitorOS({ userAgent: CHROME, platform: "Win32" }), "win");
	assert.equal(
		visitorOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" }),
		"mac",
	);
	assert.equal(visitorOS({ userAgent: "", userAgentData: { platform: "macOS", mobile: false } }), "mac");
	assert.equal(visitorOS({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux x86_64" }), "linux");
	assert.equal(
		visitorOS({ userAgent: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko Firefox/130.0" }),
		"linux",
	);
	// Phones, tablets, ChromeOS: none of the downloads fit.
	assert.equal(
		visitorOS({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari", platform: "Linux armv8l" }),
		"other",
	);
	assert.equal(
		visitorOS({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", platform: "iPhone" }),
		"other",
	);
	assert.equal(
		visitorOS({
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
			platform: "MacIntel",
			maxTouchPoints: 5,
		}),
		"other",
	);
	assert.equal(visitorOS({ userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)", platform: "Linux x86_64" }), "other");
});
