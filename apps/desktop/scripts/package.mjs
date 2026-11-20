// Runs electron-builder with the arguments given (package.json build:* and
// release:*), deciding one thing electron-builder.yml can't: how to sign the
// macOS app.
//
// - With a Developer ID certificate (CSC_LINK, or CSC_NAME for one in the
//   keychain): signed for real, with the hardened runtime, and notarized when
//   APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER are set too.
// - Without one (today): ad-hoc signed (identity "-"), which Apple Silicon
//   needs to open the app at all, and without the hardened runtime, which
//   would reject Electron's frameworks under an ad-hoc signature.
//
// So turning on real signing is adding those secrets in CI, nothing else
// (README.md, "Signing the macOS app").
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.includes("--mac")) {
	if (process.env.CSC_LINK || process.env.CSC_NAME) {
		console.log("macOS: signing with the Developer ID certificate");
	} else {
		console.log("macOS: no certificate (CSC_LINK), so ad-hoc signed and not notarized");
		args.push("-c.mac.identity=-", "-c.mac.hardenedRuntime=false", "-c.mac.notarize=false");
	}
}

const bin = join(
	root,
	"node_modules",
	".bin",
	process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);
const result = spawnSync(bin, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
