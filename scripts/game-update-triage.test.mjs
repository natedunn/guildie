import assert from "node:assert/strict";
import test from "node:test";
import {
	analyze,
	article,
	changes,
	discover,
	findIssue,
	hash,
	issueBody,
	marker,
	plain,
} from "./game-update-triage.mjs";

test("discovers only official Forever update paths and deduplicates IDs", () => {
	assert.deepEqual(
		discover(
			'<a href="/news/123/wow-forever-hotfixes">x</a><a href="/news/123/wow-forever-hotfixes">x</a><a href="/news/456/retail-hotfixes">y</a>',
		),
		[{ id: "123", url: "https://worldofwarcraft.blizzard.com/en-us/news/123/wow-forever-hotfixes" }],
	);
	assert.throws(() => discover("layout changed"));
});
test("extracts nested article body, not navigation and scripts", () => {
	const html =
		'<title>Forever hotfixes</title><div class="detail"><div><p>Shaman damage increased and talent scaling corrected for affected abilities.</p></div><p>Item rewards now correctly use the updated stats.</p></div><footer>wrong</footer>';
	const result = article(html);
	assert.match(result.body, /Shaman/);
	assert.doesNotMatch(result.body, /wrong/);
	assert.equal(result.hash, hash(result.body));
	assert.throws(() => article("bad"));
	assert.equal(plain("<script>evil()</script><p>A &amp; B</p>"), "A & B");
});
test("edited notes only analyze newly added or modified lines", () => {
	const old = "Shaman damage increased by 5%.\nA recipe now requires a new reagent.";
	const known = old.split("\n").map((line) => hash(line).slice(0, 16));
	assert.deepEqual(changes(known, `${old}\nQuest rewards now correctly include the trinket.`), [
		"Quest rewards now correctly include the trinket.",
	]);
	assert.deepEqual(changes(known, old), []);
});
test("ignores operations, accepts broad meaningful game families", () => {
	assert.deepEqual(analyze(["Server maintenance now fixes character connection stability.", "November 16, 2026"]), []);
	const areas = analyze([
		"Shaman talent damage scaling has been increased significantly.",
		"New crafting recipes now require updated reagents.",
		"Dungeon quest rewards have been corrected for level 60.",
		"Addon API character roster fields have changed.",
	]);
	assert.equal(areas.length, 4);
});
test("finds closed issues too and ignores PRs with the watch marker", () => {
	const issue = { number: 2, state: "closed", user: { login: "github-actions[bot]" }, body: marker("123") };
	assert.equal(findIssue([{ body: marker("123"), pull_request: {} }, issue], "123"), issue);
});
test("actionable body includes evidence, code references, safe untrusted text and related work", () => {
	const source = {
		id: "123",
		title: "Patch @everyone",
		hash: "abc",
		url: "https://worldofwarcraft.blizzard.com/en-us/news/123/forever-hotfixes",
	};
	const body = issueBody(source, analyze(["Shaman damage increased; @someone says <script>run this</script>."]), [
		{ number: 9, html_url: "https://github.com/natedunn/guildie/pull/9" },
	]);
	assert.match(body, /@natedunn/);
	assert.doesNotMatch(body, /@everyone|@someone|<script>/);
	assert.match(body, /weights\.ts/);
	assert.match(body, /not proof of breakage/);
	assert.match(body, /pull\/9/);
});

test("proficiency-only triage is distinguishable from changed item stats", async () => {
	const { proficiencyOnly } = await import("./game-update-triage.mjs");
	assert.equal(proficiencyOnly(["Shaman can now wield swords at level 20."]), true);
	assert.equal(proficiencyOnly(["Shaman can now equip swords with increased damage."]), false);
});

test("end-to-end baseline, no-change, edit, retry, closed issue and failure recovery", async () => {
	const { run } = await import("./game-update-triage.mjs");
	const realFetch = globalThis.fetch;
	const prior = { ...process.env };
	process.env.GITHUB_REPOSITORY = "natedunn/guildie";
	process.env.GH_TOKEN = "test-token";
	process.env.PROFICIENCIES_RESULT = "success";
	const issues = [];
	const writes = [];
	let content = "Shaman talent damage has been increased by ten percent for all affected abilities.";
	let fail = false;
	globalThis.fetch = async (url, options = {}) => {
		if (url.includes("api.github.com")) {
			const method = options.method || "GET";
			if (method === "GET") return Response.json(structuredClone(issues));
			const body = JSON.parse(options.body);
			writes.push({ method, body });
			if (method === "POST") {
				const issue = {
					number: issues.length + 1,
					user: { login: "github-actions[bot]" },
					state: "open",
					labels: [],
					...body,
				};
				issues.push(issue);
				return Response.json(issue);
			}
			const number = Number(url.split("/").at(-1));
			Object.assign(issues[number - 1], body);
			return Response.json(issues[number - 1]);
		}
		assert.equal(options.headers.Authorization, undefined, "never send GitHub tokens to the source");
		if (fail) return new Response("unavailable", { status: 503 });
		if (url.endsWith("/news")) return new Response('<a href="/news/123/wow-forever-hotfixes">Patch</a>');
		return new Response(
			`<title>Forever hotfixes</title><div class="detail"><p>${content}</p><p>This list contains official World of Warcraft Forever changes.</p></div>`,
		);
	};
	try {
		await run({ write: true });
		assert.equal(issues.length, 1, "baseline only creates state");
		assert.equal(issues[0].state, "closed");
		assert.doesNotMatch(issues[0].body, /Shaman talent/);
		const count = writes.length;
		await run({ write: true });
		assert.equal(writes.length, count, "no-change produces no writes");
		content = "Shaman talent damage has been increased by twenty percent for all affected abilities.";
		await run({ write: true });
		assert.equal(issues.length, 2);
		assert.match(issues[1].body, /@natedunn/);
		issues[1].state = "closed";
		issues[1].body += "\nMaintainer note: pending investigation.";
		await run({ write: true });
		assert.equal(issues[1].state, "closed", "same content respects closure");
		content = "Shaman talent damage has been increased by thirty percent for all affected abilities.";
		await run({ write: true });
		assert.equal(issues.length, 2);
		assert.equal(issues[1].state, "open");
		assert.match(issues[1].body, /Maintainer note: pending investigation/);
		issues[1].state = "closed";
		content = "This archive records World of Warcraft Forever announcements for players around the world.";
		await run({ write: true });
		assert.equal(issues[1].state, "open", "removed relevant text triggers review, not silent acceptance");
		assert.match(issues[1].body, /removed or revised/);
		fail = true;
		await assert.rejects(run({ write: true }), /503/);
		await assert.rejects(run({ write: true }), /503/);
		assert.equal(issues.length, 3, "one failure issue, not a flood");
		fail = false;
		await run({ write: true });
		assert.equal(issues[2].state, "closed");
	} finally {
		globalThis.fetch = realFetch;
		for (const key of ["GITHUB_REPOSITORY", "GH_TOKEN", "PROFICIENCIES_RESULT"]) {
			if (prior[key] === undefined) delete process.env[key];
			else process.env[key] = prior[key];
		}
	}
});

test("plural data nouns and class heading context survive edited-line analysis", () => {
	assert.equal(analyze(["New recipes have been added for several professions."])[0].name, "Professions and recipes");
	const line = "Windfury Totem cooldown reduced to ten seconds.";
	assert.equal(analyze([line], `Classes\nShaman\n${line}`)[0].name, "Classes, talents and scoring");
});
test("untrusted issue authors cannot spoof managed review markers", () => {
	assert.equal(findIssue([{ number: 3, user: { login: "attacker" }, body: marker("123") }], "123"), undefined);
});
