/** Read-only source analysis; --write permits issue-only changes, never code/deploys. */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const NEWS = "https://worldofwarcraft.blizzard.com";
const INDEX = `${NEWS}/en-us/news`;
const STATE = "<!-- guildie-game-watch-state:v1 -->";
const FAILURE = "<!-- guildie-game-watch-failure:v1 -->";
const USER_AGENT = "Guildie game-update check (https://github.com/natedunn/guildie)";

export const AREAS = [
	{
		name: "Classes, talents and scoring",
		pattern:
			/\b(talent|class|classes|shaman|paladin|warrior|hunter|rogue|priest|mage|warlock|druid|damage|healing|stat|scaling|coefficient|proc)\b/i,
		files: ["apps/web/convex/shared/weights.ts", "apps/web/convex/shared/foreverTalents.ts", "docs/gear-upgrades.md"],
		check:
			"Review affected specs/talents and scoring assumptions. Do not derive new weights from patch percentages alone. Run pnpm --filter @guildie/web test; rule changes also require matching addon logic and pnpm test:addon.",
	},
	{
		name: "Equipment and item data",
		pattern: /\b(item|items|equipment|weapon|armor|loot|enchant|trinket|relic|shield|set bonus)\b/i,
		files: ["apps/web/convex/items.ts", "apps/web/convex/shared/upgrades.ts", "docs/game-data.md"],
		check:
			"Compare changed item IDs/stats with cached/API data and upgrade results. The proficiency updater only covers who can wear/wield items, not item stats or all equipment rules.",
	},
	{
		name: "Professions and recipes",
		pattern:
			/\b(profession|recipe|craft|crafting|blacksmith|alchemy|enchanting|leatherworking|engineering|tailoring|cooking|fishing|reagent)\b/i,
		files: ["apps/web/convex/recipes.ts", "apps/web/convex/crons.ts"],
		check:
			"Check changed recipes, requirements and profession mappings against the catalog; distinguish the existing weekly catalog refresh from code/schema changes.",
	},
	{
		name: "Quests, dungeons and progression",
		pattern: /\b(quest|dungeon|raid|boss|reward|level|experience|reputation|attunement)\b/i,
		files: ["apps/web/convex/dungeons.ts", "apps/web/convex/shared/dungeons.ts", "apps/web/convex/shared/quests.ts"],
		check:
			"Check affected quest/reward IDs, dungeon requirements and level filters. Existing title backfills do not prove that rules or reward tables are current.",
	},
	{
		name: "API, roster and addon compatibility",
		pattern: /\b(api|addon|add-on|interface|guild|roster|character|namespace|savedvariables|lua)\b/i,
		files: ["apps/web/convex/sync.ts", "apps/web/convex/shared/wow.ts", "apps/addon", "packages/sync"],
		check:
			"Check affected API fields, namespace/flavor routing, addon events and exported data contracts; run pnpm check, pnpm test and pnpm test:addon where applicable.",
	},
];

export function plain(html) {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|li|h[1-6]|div|ul|ol)>/gi, "\n")
		.replace(/<[^>]*>/g, "")
		.replace(
			/&(?:nbsp|amp|lt|gt|quot|apos);/g,
			(s) => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[s],
		)
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join("\n");
}

export function discover(html) {
	const result = new Map();
	for (const match of html.matchAll(/href=["']([^"']*\/news\/(\d+)\/([^"']+))["']/g)) {
		if (/forever/i.test(match[3]) && /hotfix|patch|tuning|update|adjustment/i.test(match[3])) {
			result.set(match[2], `${NEWS}/en-us/news/${match[2]}/${match[3]}`);
		}
	}
	if (!result.size)
		throw new Error("No Forever update links found in the official news index; check source layout/filter coverage.");
	return [...result].map(([id, url]) => ({ id, url }));
}

export function article(html) {
	const start = /<div\b[^>]*class=["']detail["'][^>]*>/i.exec(html);
	if (!start) throw new Error("Official article body selector changed (div.detail missing).");
	const tail = html.slice(start.index + start[0].length);
	let depth = 1;
	let end = -1;
	for (const token of tail.matchAll(/<\/?div\b[^>]*>/gi)) {
		depth += /^<\//.test(token[0]) ? -1 : 1;
		if (!depth) {
			end = token.index;
			break;
		}
	}
	if (end < 0) throw new Error("Official article body is incomplete.");
	const body = plain(tail.slice(0, end));
	const title = plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "WoW Forever update");
	if (body.length < 80) throw new Error("Official article body is unexpectedly short.");
	return { title, body, hash: hash(body) };
}
export function hash(value) {
	return createHash("sha256").update(value).digest("hex");
}

export function changes(before, after) {
	const previous = new Set(before || []);
	return after.split("\n").filter((line) => !previous.has(hash(line).slice(0, 16)));
}

export function analyze(lines, fullText = lines.join("\n")) {
	const context = new Map();
	let heading = "";
	for (const line of fullText.split("\n")) {
		if (
			line.length < 60 &&
			!/[.!?]/.test(line) &&
			AREAS.some((area) => area.pattern.test(`${line} ${line.replace(/\b(\w+)s\b/g, "$1")}`))
		)
			heading = line;
		context.set(line, heading);
	}
	const normalized = (line) => `${context.get(line) || ""} ${line} ${line.replace(/\b(\w+)s\b/g, "$1")}`;
	// Ignore headers/date-only edits and operational notices, not whole mixed articles.
	const meaningful = lines.filter(
		(line) =>
			line.length > 30 &&
			/\b(chang|increas|decreas|reduc|fix|add|remov|adjust|updat|now|no longer|new|correct|rework|introduc|improv)/i.test(
				line,
			) &&
			!/\b(maintenance|server restart|realm restart|outage|connection stability|server stability)\b/i.test(line),
	);
	return AREAS.map((area) => ({
		...area,
		evidence: meaningful.filter((line) => area.pattern.test(normalized(line))),
	})).filter((area) => area.evidence.length);
}

export function marker(id) {
	return `<!-- guildie-game-update:news:${id} -->`;
}
export function proficiencyOnly(lines) {
	return (
		lines.length > 0 &&
		lines.every(
			(line) =>
				/\b(proficienc|can (?:now )?(?:wear|wield|equip)|learn.*(?:armor|weapon))/i.test(line) &&
				!/\b(stat|damage|healing|bonus|proc)\b/i.test(line),
		)
	);
}
export function managed(issue) {
	return issue.user?.login === "github-actions[bot]" && !issue.pull_request;
}
export function findIssue(issues, id) {
	return issues.find((issue) => managed(issue) && issue.body?.includes(marker(id)));
}
export function safe(value) {
	return value.replace(/@/g, "＠").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`/g, "'");
}
export function issueBody(source, areas, related) {
	const excerpt = areas[0]?.evidence[0].split(/\s+/).slice(0, 15).join(" ") || "";
	return `${marker(source.id)}\n<!-- content:${source.hash} -->\n@${"natedunn"}, this official update contains changes that need a Guildie impact review. A rebuild is **not** assumed to fix them.\n\nSource: [${safe(source.title)}](${source.url})\n\nChanged text (short excerpt): ${safe(excerpt)}…\n\n${areas.map((area) => `### ${area.name}\n\nCheck: ${area.check}\n\nRepository references: ${area.files.map((file) => `\`${file}\``).join(", ")}`).join("\n\n")}\n\n### Existing automation and related work\n\nThe proficiency job remains the only automatic data writer; review its output before doing the same work. ${related.length ? related.map((issue) => `[#${issue.number}](${issue.html_url})`).join(", ") : "No related issue/PR was found by source URL or game-data label."}\n\n### Review checklist\n- [ ] Confirm each inferred impact against the actual game and current code. Keyword matches are leads, not proof of breakage.\n- [ ] Reuse existing data refresh/PR coverage; do not repeat a covered proficiency update.\n- [ ] If rules changed, add focused regression tests and review web/addon parity.\n- [ ] Build/release only if validated code or data changes require it.\n\nThis is deterministic, broad data-family triage, not exhaustive semantic analysis. Close when resolved or irrelevant; unchanged content will not reopen it. Later edits with new relevant content may reopen it.`;
}

async function request(url, options = {}) {
	const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000), ...options });
	if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).origin}${new URL(url).pathname}`);
	return response;
}
async function sourceText(url) {
	const parsed = new URL(url);
	if (parsed.origin !== NEWS || !parsed.pathname.startsWith("/en-us/news")) throw new Error("Unapproved news URL");
	return (await request(url, { headers: { "User-Agent": USER_AGENT } })).text();
}

export async function collect(previous = {}) {
	const found = discover(await sourceText(INDEX));
	// Revisit tracked articles even after they fall off the index, bounded to the newest 10.
	const sources = new Map(Object.entries(previous).map(([id, item]) => [id, { id, url: item.url }]));
	for (const item of found) sources.set(item.id, item);
	const results = [];
	for (const source of [...sources.values()].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 10)) {
		results.push({ ...source, ...article(await sourceText(source.url)) });
	}
	return results;
}

export async function run({ write = false, sourcesOnly = false } = {}) {
	if (sourcesOnly) {
		const sources = await collect();
		console.log(
			JSON.stringify(
				sources.map(({ id, title, hash: digest, body }) => ({
					id,
					title,
					hash: digest,
					lines: body.split("\n").length,
					areas: analyze(body.split("\n")).map((area) => area.name),
				})),
				null,
				2,
			),
		);
		return;
	}
	const repo = process.env.GITHUB_REPOSITORY;
	const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GH_TOKEN are required (or use --sources-only).");
	if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Invalid repository");
	const api = async (path, method = "GET", body) => {
		if (method !== "GET" && !write) {
			console.log(`Would ${method} ${path}`);
			return {};
		}
		return (
			await request(`https://api.github.com/repos/${repo}/${path}`, {
				method,
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/vnd.github+json",
					"Content-Type": "application/json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			})
		).json();
	};
	const issues = [];
	for (let page = 1; ; page++) {
		const batch = await api(`issues?state=all&per_page=100&page=${page}`);
		issues.push(...batch);
		if (batch.length < 100) break;
		if (page === 100) throw new Error("Issue pagination exceeded safety limit; state not advanced.");
	}
	const stateIssue = issues.find((issue) => managed(issue) && issue.body?.startsWith(STATE));
	let state = {};
	try {
		if (stateIssue) {
			const match = /```json\n([\s\S]*?)\n```/.exec(stateIssue.body);
			if (!match) throw new Error("Watch state is corrupt; refusing to reset/replay history.");
			state = JSON.parse(match[1]);
			const validDigests = (values) =>
				Array.isArray(values) && values.every((value) => typeof value === "string" && /^[a-f0-9]{16}$/.test(value));
			if (
				!state ||
				Array.isArray(state) ||
				typeof state !== "object" ||
				Object.entries(state).some(
					([id, item]) =>
						!/^\d+$/.test(id) ||
						!item ||
						typeof item.url !== "string" ||
						!/^[a-f0-9]{64}$/.test(item.hash) ||
						!validDigests(item.lines) ||
						(item.relevant !== undefined &&
							(!item.relevant ||
								typeof item.relevant !== "object" ||
								Object.values(item.relevant).some((values) => !validDigests(values)))),
				)
			) {
				throw new Error("Watch state schema is invalid; refusing to reset/replay history.");
			}
		}
		const sources = await collect(state);
		const next = {};
		for (const source of sources) {
			next[source.id] = {
				url: source.url,
				hash: source.hash,
				lines: source.body.split("\n").map((line) => hash(line).slice(0, 16)),
				relevant: Object.fromEntries(
					analyze(source.body.split("\n"), source.body).map((area) => [
						area.name,
						area.evidence.map((line) => hash(line).slice(0, 16)),
					]),
				),
			};
			// First run baselines existing notes, deliberately avoiding an old-patch issue flood.
			if (!stateIssue || state[source.id]?.hash === source.hash) continue;
			const changed = changes(state[source.id]?.lines, source.body);
			const areas = analyze(changed, source.body);
			const currentHashes = new Set(next[source.id].lines);
			for (const area of AREAS) {
				const removed = state[source.id]?.relevant?.[area.name]?.filter((digest) => !currentHashes.has(digest)) || [];
				if (removed.length && !areas.some((finding) => finding.name === area.name))
					areas.push({
						...area,
						evidence: [
							`The official note removed or revised ${removed.length} previously relevant lines in ${area.name}. Review the source revision before changing game data; removal does not prove an in-game rollback.`,
						],
					});
			}
			if (!areas.length) continue;
			const existing = findIssue(issues, source.id);
			// Safe restart if issue write succeeded but saving state failed.
			if (/<!-- content:([a-f0-9]+) -->/.exec(existing?.body || "")?.[1] === source.hash) continue;
			const related = issues.filter(
				(issue) =>
					issue.number !== stateIssue?.number &&
					!issue.body?.startsWith(FAILURE) &&
					issue.number !== existing?.number &&
					(issue.body?.includes(source.url) ||
						(issue.state === "open" && issue.labels?.some((label) => label.name === "game-data"))),
			);
			// Only exact evidence coverage can suppress another review. A label or URL alone
			// is not proof that an older PR covers an edited/new hotfix.
			const evidence = [...new Set(areas.flatMap((area) => area.evidence))];
			if (
				!existing &&
				related.some(
					(issue) =>
						issue.user?.login === "github-actions[bot]" && evidence.every((line) => issue.body?.includes(line)),
				)
			)
				continue;
			const update = issueBody(source, areas, related);
			const body = existing
				? `${update}\n\n---\n## Prior review context (preserved)\n\n${existing.body || ""}`
				: update;
			if (body.length > 60_000)
				throw new Error(
					`Review issue #${existing?.number} needs its history archived before another revision can be added.`,
				);
			const payload = {
				title: `Game update review: ${safe(source.title)}`.slice(0, 240),
				body,
				...(existing ? { state: "open" } : {}),
			};
			await api(existing ? `issues/${existing.number}` : "issues", existing ? "PATCH" : "POST", payload);
		}
		// GitHub issues have a 65,536-character body limit. Fail rather than silently truncate history.
		const stateBody = `${STATE}\nMachine state for Game data triage. Do not edit. No action needed.\n\n\`\`\`json\n${JSON.stringify(next)}\n\`\`\``;
		if (stateBody.length > 60_000)
			throw new Error("Watch state exceeds issue storage limit; move state to larger durable storage before next run.");
		if (!stateIssue || stateBody !== stateIssue.body) {
			const saved = await api(stateIssue ? `issues/${stateIssue.number}` : "issues", stateIssue ? "PATCH" : "POST", {
				title: "Game update watch state (no action needed)",
				body: stateBody,
				...(stateIssue ? { state: "closed" } : {}),
			});
			if (!stateIssue && saved.number)
				await api(`issues/${saved.number}`, "PATCH", { state: "closed", state_reason: "completed" });
		}
		if (process.env.PROFICIENCIES_RESULT === "failure")
			throw new Error(
				"The existing proficiency updater failed. Inspect its job logs; no duplicate data update was attempted.",
			);
		const failure = issues.find((issue) => managed(issue) && issue.body?.startsWith(FAILURE) && issue.state === "open");
		if (failure) await api(`issues/${failure.number}`, "PATCH", { state: "closed", state_reason: "completed" });
		console.log(`${stateIssue ? "Checked" : "Baselined"} ${sources.length} official update articles.`);
	} catch (error) {
		const failure = issues.find((issue) => managed(issue) && issue.body?.startsWith(FAILURE) && issue.state === "open");
		const runUrl = `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID || ""}`;
		const body = `${FAILURE}\n@natedunn, the game-update check needs attention.\n\n${safe(error.message)}\n\n[Inspect this run](${runUrl}). Check source availability/parsing and permissions before rerunning. Do not interpret a failed check as no game changes. Existing proficiency automation is separate; no merge/deploy was attempted.`;
		await api(failure ? `issues/${failure.number}` : "issues", failure ? "PATCH" : "POST", {
			title: "Game update check needs attention",
			body,
		});
		throw error;
	}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	run({ write: process.argv.includes("--write"), sourcesOnly: process.argv.includes("--sources-only") }).catch(
		(error) => {
			console.error(error.message);
			process.exitCode = 1;
		},
	);
}
