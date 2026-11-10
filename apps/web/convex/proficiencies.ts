import { internalQuery } from "./_generated/server";
import { auditReport, type Observation } from "./shared/proficiencies";
import { CLASS_TOKENS } from "./shared/weights";

const CLASS_ID_BY_TOKEN = new Map(Object.entries(CLASS_TOKENS).map(([id, token]) => [token, Number(id)]));

/**
 * Checks the armor and weapon rules (shared/proficiencies.ts) against what
 * players' games say: every addon snapshot with weapon and armor skills
 * (addon 0.7.0+) is compared with the rules for its class at the level the
 * skills were read. Lists characters with a skill the rules say they can't
 * have, and per override whether anyone contradicts it. Maintainers:
 *
 *   npx convex run proficiencies:audit --deployment scintillating-gnat-539
 */
export const audit = internalQuery({
	args: {},
	handler: async (ctx) => {
		const observations: (Observation & { who: string })[] = [];
		for await (const s of ctx.db.query("addonSnapshots")) {
			const p = s.proficiencies;
			const classId = s.classToken ? CLASS_ID_BY_TOKEN.get(s.classToken) : undefined;
			const level = p?.level ?? s.level;
			if (!p || !classId || !level) continue;
			const skills = p.dualWield && !p.skills.includes("Dual Wield") ? [...p.skills, "Dual Wield"] : p.skills;
			observations.push({ who: `${s.slug} (${s.region}, ${s.flavor})`, classId, level, skills });
		}
		return auditReport(observations);
	},
});
