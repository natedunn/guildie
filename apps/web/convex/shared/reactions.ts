// The feed's reactions (feedReactions.ts, the feed page): a heart and a
// thumbs up, then a few of the game's own icons. No emoji (the design
// rules): the basics are line icons, the rest Blizzard's icon renders.
// Adding one is safe; removing one strands its rows (filter them out).

export const REACTIONS = ["love", "like", "cheers", "hype", "rip"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** What each one is called (the picker's labels, "Sela reacted Epic"). */
export const REACTION_LABEL: Record<Reaction, string> = {
	love: "Love it",
	like: "Nice",
	cheers: "Cheers",
	hype: "Hype",
	rip: "RIP",
};

/** The game icon for the ones drawn from the game (the rest are line icons). */
export const REACTION_GAME_ICON: Partial<Record<Reaction, string>> = {
	cheers: "inv_drink_05",
	hype: "ability_warrior_battleshout",
	rip: "inv_misc_bone_humanskull_01",
};

export const gameIconUrl = (name: string) => `https://render.worldofwarcraft.com/us/icons/56/${name}.jpg`;
