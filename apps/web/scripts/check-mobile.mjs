#!/usr/bin/env node

// Visits every page at phone and tablet widths and fails if anything
// overflows sideways (the page or the content pane), or if a text input is
// under 16px on a phone (iOS zooms into those). Needs `pnpm dev` running and
// Playwright with Chromium (not a repo dependency). docs/local-dev.md has the
// details.
//
//   node apps/web/scripts/check-mobile.mjs [--base URL] [--guest | --code SESSION_CODE]
//     [--guild /g/eu/unbound] [--character /c/eu/lich-braz] [--item 2589]
//     [--state FILE] [--shots DIR] [--widths 390x844,360x740,768x1024]
//
// Signed out pages always run. Signed in: `--guest` clicks "Sign in as a
// guest", `--code` opens /desktop/session with a desktop session code, and
// `--state` reuses (and saves) the browser's cookies between runs. Without
// --guild/--character it uses the first ones in the sidebar.

import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
	options: {
		base: { type: "string", default: process.env.GUILDIE_URL ?? "https://guildie.localhost:1355" },
		guest: { type: "boolean", default: false },
		code: { type: "string" },
		guild: { type: "string" },
		character: { type: "string" },
		item: { type: "string" },
		state: { type: "string" },
		shots: { type: "string" },
		widths: { type: "string", default: "390x844,360x740,768x1024" },
	},
});

async function loadPlaywright() {
	for (const from of [process.cwd(), process.env.PLAYWRIGHT_DIR].filter(Boolean)) {
		try {
			return createRequire(path.join(path.resolve(from), "noop.js"))("playwright");
		} catch {}
	}
	console.error(
		"check-mobile: Playwright isn't installed here. In an empty folder: `npm i playwright && npx playwright install chromium`, then run this with PLAYWRIGHT_DIR=<that folder>.",
	);
	process.exit(2);
}

const { chromium } = await loadPlaywright();
const base = args.base.replace(/\/$/, "");
const viewports = args.widths.split(",").map((s) => {
	const [width, height] = s.split("x").map(Number);
	return { width, height };
});
if (args.shots) mkdirSync(args.shots, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
// Cookies for the signed-in pages: from --state, or from signing in now.
let auth = args.state && existsSync(args.state) ? args.state : null;
if (!auth && (args.guest || args.code)) {
	const context = await browser.newContext({ ignoreHTTPSErrors: true });
	const page = await context.newPage();
	if (args.code) {
		await page.goto(`${base}/desktop/session?code=${encodeURIComponent(args.code)}`, { waitUntil: "networkidle" });
	} else {
		await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
		await page.getByRole("button", { name: /guest/i }).click();
	}
	await page.waitForURL((u) => !u.pathname.startsWith("/sign-in") && !u.pathname.startsWith("/desktop"), {
		timeout: 15_000,
	});
	auth = await context.storageState(args.state ? { path: args.state } : undefined);
	await context.close();
}

// Guild and character to visit: from the flags, or the first ones the sidebar links to.
let guild = args.guild;
let character = args.character;
if (!guild || !character) {
	const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: auth ?? undefined });
	const page = await context.newPage();
	await page.goto(`${base}/`, { waitUntil: "networkidle" });
	const hrefs = await page.$$eval("aside a", (as) => as.map((a) => a.getAttribute("href") ?? ""));
	guild ??= hrefs.find((h) => /^\/g\/[^/]+\/[^/]+$/.test(h));
	character ??= hrefs.find((h) => /^\/c\/[^/]+\/[^/]+$/.test(h));
	await context.close();
}

/** @type {{ path: string, auth?: boolean, phone?: boolean, needs?: string, act?: (page: import("playwright").Page) => Promise<void>, name?: string }[]} */
const pages = [
	{ path: "/" },
	{ path: "/sign-in" },
	{ path: "/data" },
	{ path: "/addon" },
	{ path: "/helper/connect" },
	{
		path: "/",
		name: "menu sheet",
		phone: true,
		act: async (p) => {
			await p.locator(".app-topbar").getByRole("button", { name: "Menu" }).click();
			await p.waitForTimeout(400);
		},
	},
];
if (guild) {
	pages.push(
		{ path: guild },
		{ path: `${guild}/crafting` },
		{ path: `${guild}/gear` },
		{ path: `${guild}/requests`, auth: true },
		{ path: `${guild}/dungeons`, auth: true },
		{
			path: `${guild}/requests`,
			name: "requests search",
			auth: true,
			needs: "#request-search",
			act: async (p) => {
				await p.fill("#request-search", "bag");
				await p.waitForTimeout(1500);
			},
		},
		{
			path: `${guild}/requests`,
			name: "request dialog",
			auth: true,
			needs: "#request-search",
			act: async (p) => {
				await p.fill("#request-search", "bag");
				await p.waitForTimeout(1500);
				await p
					.locator("#content")
					.getByRole("button", { name: /^Request/ })
					.first()
					.click();
				await p.waitForTimeout(400);
			},
		},
	);
}
if (character) {
	pages.push(
		{ path: character },
		{ path: `${character}/talents` },
		{ path: `${character}/professions` },
		{
			path: `${character}/talents`,
			name: "talent tap",
			act: async (p) => {
				await p.locator('button[aria-label*=", rank "]').first().click();
				await p.waitForTimeout(300);
			},
		},
	);
}
pages.push(
	{ path: `${character ?? "/"}?item=${args.item ?? "2589"}`, name: "item panel" },
	{ path: "/me", auth: true },
	{ path: "/inventory", auth: true },
	{
		path: "/inventory",
		name: "inventory search",
		auth: true,
		needs: "#inventory-search",
		act: async (p) => {
			await p.fill("#inventory-search", "a");
			await p.waitForTimeout(300);
		},
	},
	{ path: "/quests", auth: true },
	{ path: "/quests?view=zone", auth: true },
	{ path: "/settings", auth: true },
	{ path: "/settings/guilds", auth: true },
	{ path: "/settings/addon", auth: true },
	{ path: "/settings/app", auth: true },
);

/** Everything that runs in the page: overflow, input font sizes, things off screen. */
function measure() {
	const vw = window.innerWidth;
	const problems = [];
	const doc = document.documentElement;
	if (doc.scrollWidth > vw) problems.push(`page is ${doc.scrollWidth}px wide`);
	const content = document.getElementById("content");
	if (content && content.scrollWidth > content.clientWidth + 1)
		problems.push(`#content scrolls sideways (${content.scrollWidth} > ${content.clientWidth})`);
	const describe = (el) => {
		const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : "";
		const text = (el.textContent ?? "").trim().slice(0, 30);
		return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
	};
	// Elements past the right edge that no scrolling/clipping container holds.
	const clips = (el) => {
		for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
			if (a.id === "content") return false;
			const s = getComputedStyle(a);
			if (s.overflowX !== "visible") return true;
		}
		return false;
	};
	let off = 0;
	for (const el of document.body.querySelectorAll("*")) {
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue;
		if (getComputedStyle(el).position === "fixed") {
			problems.push(`fixed ${describe(el)} reaches ${Math.round(r.right)}px`);
			continue;
		}
		if (clips(el)) continue;
		if (++off <= 3) problems.push(`${describe(el)} reaches ${Math.round(r.right)}px`);
	}
	// Dialogs and sheets must fit on screen.
	for (const el of document.querySelectorAll('[role="dialog"]')) {
		const r = el.getBoundingClientRect();
		if (r.bottom > window.innerHeight + 1 || r.top < -1)
			problems.push(`dialog ${describe(el)} doesn't fit (${Math.round(r.top)}..${Math.round(r.bottom)})`);
	}
	if (vw < 768) {
		for (const el of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), textarea, select")) {
			const size = Number.parseFloat(getComputedStyle(el).fontSize);
			if (el.offsetParent && size < 16) problems.push(`${describe(el)} has ${size}px text (iOS zooms in)`);
		}
	}
	return problems;
}

let failures = 0;
let checked = 0;
// One context each for signed out and signed in, for the whole run: sign-in
// refresh tokens rotate, so copies of the cookies would sign each other out.
const contextFor = (state) =>
	browser.newContext({ ignoreHTTPSErrors: true, isMobile: true, hasTouch: true, storageState: state ?? undefined });
const contexts = { out: await contextFor(null), in: auth ? await contextFor(auth) : null };
for (const vp of viewports) {
	const phone = vp.width < 768;
	for (const entry of pages) {
		if (entry.phone && !phone) continue;
		for (const label of entry.auth ? ["in"] : ["out", "in"]) {
			const context = contexts[label];
			if (!context) continue;
			const name = `${vp.width} ${label.padEnd(3)} ${entry.name ?? entry.path}`;
			const page = await context.newPage();
			await page.setViewportSize(vp);
			let problems;
			try {
				await page.goto(base + entry.path, { waitUntil: "networkidle" });
				await page.waitForTimeout(300);
				// Members-only parts (Requests) aren't there for a guest who isn't in the guild.
				if (entry.needs && (await page.locator(entry.needs).count()) === 0) {
					console.log(`skip ${name} (no ${entry.needs} here)`);
					await page.close();
					continue;
				}
				if (entry.act) await entry.act(page);
				problems = await page.evaluate(measure);
			} catch (error) {
				problems = [`couldn't check: ${String(error).split("\n")[0]}`];
			}
			checked++;
			if (args.shots) {
				const file = `${vp.width}-${label}-${(entry.name ?? entry.path).replace(/[^a-z0-9]+/gi, "_")}.png`;
				await page.screenshot({ path: path.join(args.shots, file) }).catch(() => {});
			}
			if (problems.length) {
				failures++;
				console.log(`FAIL ${name}\n${problems.map((p) => `     ${p}`).join("\n")}`);
			} else console.log(`ok   ${name}`);
			await page.close();
		}
	}
}
// Keep the (rotated) sign-in for the next run.
if (contexts.in && args.state) await contexts.in.storageState({ path: args.state });
await browser.close();
console.log(`\n${checked - failures}/${checked} pages fit${failures ? `, ${failures} don't` : ""}.`);
process.exit(failures ? 1 : 0);
