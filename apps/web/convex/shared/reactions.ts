// The feed's reactions (feedReactions.ts, the feed page): a heart and a
// thumbs up, then a few of the game's own icons. No emoji (the design
// rules): the basics are line icons, the rest Blizzard's icon renders (or,
// for Thank you, our own edit of one).
// Adding one is safe; removing one strands its rows (filter them out).

export const REACTIONS = ["love", "like", "thanks", "cheers", "hype", "rip"] as const;
export type Reaction = (typeof REACTIONS)[number];

export function gameIconUrl(name: string) {
	return `https://render.worldofwarcraft.com/us/icons/56/${name}.jpg`;
}

/** What each one is called (the picker's labels, "Sela reacted Epic"). */
export const REACTION_LABEL: Record<Reaction, string> = {
	love: "Love it",
	like: "Nice",
	thanks: "Thank you",
	cheers: "Cheers",
	hype: "Hype",
	rip: "RIP",
};

/**
 * The picture for the ones drawn from the game (the rest are line icons):
 * Blizzard's icon renders, or our own edit of one in apps/web/public.
 */
export const REACTION_ICON: Partial<Record<Reaction, string>> = {
	// Prayer of Mending's praying hands, on a plain dark ground (the game's
	// gold pattern hid them at reaction size).
	thanks: "/reactions/thanks.png",
	cheers: gameIconUrl("inv_drink_05"),
	hype: gameIconUrl("ability_warrior_battleshout"),
	rip: gameIconUrl("inv_misc_bone_humanskull_01"),
};
