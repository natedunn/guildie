// Bundles the main process and the preload into dist/ (one file each, so the
// packaged app ships no node_modules), and copies assets/ (the app icons drawn
// by scripts/make-icon.py, the tray icons) into dist/assets as a whole.
import { cpSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const common = {
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node22",
	// koffi's native binary loads at runtime from resources/koffi (window-border.ts).
	external: ["electron", "*.node"],
	define: { __VERSION__: JSON.stringify(version) },
	sourcemap: "linked",
	logLevel: "warning",
};
await build({ ...common, entryPoints: [join(root, "src/main.ts")], outfile: join(root, "dist/main.cjs") });
// The preload runs sandboxed: it may only require("electron").
await build({ ...common, entryPoints: [join(root, "src/preload.ts")], outfile: join(root, "dist/preload.cjs") });

// Whole, so an icon removed from assets/ doesn't linger in dist/.
rmSync(join(root, "dist/assets"), { recursive: true, force: true });
cpSync(join(root, "assets"), join(root, "dist/assets"), { recursive: true });
console.log(`Built Guildie ${version} into dist/`);
