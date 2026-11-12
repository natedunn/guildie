import { LandingFooter, LandingNav } from "./chrome";
import { AddonSection, CraftingSection, DungeonsSection, GearSection, RosterSection } from "./features";
import { Hero } from "./hero";
import { AiSection, BentoSection, ClosingSection, OpenSourceSection, WindowsAppSection } from "./more";

// "/" for signed-out visitors: what Guildie is, and sign in. It draws its own
// nav and footer; the root renders it without the app shell (lib/shell.ts,
// LandingShell in routes/__root.tsx), and the window scrolls.

export function Landing() {
	return (
		<>
			<LandingNav />
			<Hero />
			<RosterSection />
			<GearSection />
			<CraftingSection />
			<DungeonsSection />
			<AddonSection />
			<WindowsAppSection />
			<AiSection />
			<BentoSection />
			<OpenSourceSection />
			<ClosingSection />
			<LandingFooter />
		</>
	);
}
