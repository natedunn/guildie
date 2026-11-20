#!/usr/bin/env node
// Cut a release of the Guildie app: `pnpm release 0.3.6` (add `--push` to
// push it). Turns CHANGELOG.md's "## Unreleased" into "## 0.3.6", bumps
// apps/desktop/package.json, commits "Release 0.3.6" and tags desktop-v0.3.6.
// Pushing the tag runs .github/workflows/desktop-release.yml, which builds the
// app for Windows, macOS and Linux and publishes them as the GitHub release
// installed apps update from.
//
// Run it on an up-to-date main with a clean tree. Maintainers only (main is
// protected; admins can push the release commit).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const fail = (message) => {
	console.error(`release: ${message}`);
	process.exit(1);
};

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const push = args.includes("--push");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) fail("give the new version, e.g. pnpm release 0.3.6");

if (git("status", "--porcelain")) fail("the working tree has changes; commit or stash them first");
if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("run it on main");
git("fetch", "--quiet", "origin", "main", "--tags");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main"))
	fail("main isn't the same as origin/main; pull first");
if (git("tag", "--list", `desktop-v${version}`)) fail(`desktop-v${version} already exists`);

const pkgPath = join(root, "apps/desktop/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const parts = (v) => v.split(".").map(Number);
const [a, b] = [parts(version), parts(pkg.version)];
if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] <= b[2]))))
	fail(`${version} isn't newer than the current ${pkg.version}`);

const changelogPath = join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const start = changelog.indexOf("## Unreleased\n");
if (start === -1) fail("CHANGELOG.md has no '## Unreleased' section");
const bodyStart = start + "## Unreleased\n".length;
const next = changelog.indexOf("\n## ", bodyStart);
const body = changelog.slice(bodyStart, next === -1 ? undefined : next + 1);
if (!/^- /m.test(body)) fail("'## Unreleased' has no entries; add what changed first");

writeFileSync(
	changelogPath,
	`${changelog.slice(0, bodyStart)}\n## ${version}\n${body.replace(/^\n*/, "\n")}${next === -1 ? "" : changelog.slice(next + 1)}`,
);
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);

git("add", "CHANGELOG.md", "apps/desktop/package.json");
git("commit", "-m", `Release ${version}`);
git("tag", `desktop-v${version}`);
console.log(`Committed "Release ${version}" and tagged desktop-v${version}.`);

if (push) {
	git("push", "origin", "main");
	git("push", "origin", `desktop-v${version}`);
	console.log("Pushed. The Desktop release workflow builds and publishes it (Windows, macOS, Linux):");
	console.log(
		"  gh run watch $(gh run list --workflow desktop-release.yml --limit 1 --json databaseId -q '.[0].databaseId')",
	);
} else {
	console.log(`Push when ready: git push origin main && git push origin desktop-v${version}`);
}
