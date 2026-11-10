#!/usr/bin/env node
// Renders the app icons in public/icons/ from icons/mark.svg (the sidebar's
// shield). See icons/README.md. Needs Playwright with Chromium, like
// scripts/check-mobile.mjs: PLAYWRIGHT_DIR=<folder with playwright> node apps/web/scripts/gen-icons.mjs

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "#13110e"; // --chrome in src/styles/app.css
const mark = readFileSync(path.join(web, "icons/mark.svg"), "utf8").replace(/^<svg[^>]*>|<\/svg>\s*$/g, "");

// name, size, corner radius (share of the size), mark size (share of the size)
const ICONS = [
	// Browsers and Android show these as they are: a rounded tile.
	["icon-192.png", 192, 0.22, 0.75],
	["icon-512.png", 512, 0.22, 0.75],
	// Android crops maskable icons to its own shape: full bleed, the mark inside
	// the middle 80% (the safe zone) with room to spare.
	["maskable-512.png", 512, 0, 0.62],
	// iOS rounds the corners itself and wants no transparency.
	["apple-touch-icon.png", 180, 0, 0.72],
];

function svg(size, radius, markSize) {
	const m = size * markSize;
	const at = (size - m) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${size * radius}" fill="${CHROME}"/>
<svg x="${at}" y="${at}" width="${m}" height="${m}" viewBox="0 0 32 32">${mark}</svg>
</svg>`;
}

function loadPlaywright() {
	for (const from of [process.cwd(), process.env.PLAYWRIGHT_DIR].filter(Boolean)) {
		try {
			return createRequire(path.join(path.resolve(from), "noop.js"))("playwright");
		} catch {}
	}
	console.error("gen-icons: Playwright isn't installed here; set PLAYWRIGHT_DIR (icons/README.md).");
	process.exit(2);
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
for (const [name, size, radius, markSize] of ICONS) {
	const page = await browser.newPage({ viewport: { width: size, height: size } });
	await page.setContent(
		`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(size, radius, markSize)}`,
	);
	await page.screenshot({ path: path.join(web, "public/icons", name), omitBackground: true });
	await page.close();
	console.log(`public/icons/${name}`);
}
await browser.close();
