// Where to read up on each dungeon: Wowhead's Forever guide (one per wing
// where it has wings), the entrance on Wowhead's world map, and the guide's
// dungeon map where it has one. Collected from Wowhead's Forever dungeon
// guides (November 2026); a dungeon without a guide yet (Alcaz Prison,
// Blackmaw Hold, Shaper's Terrace) has none here.

export type DungeonResources = {
	guides: { wing?: string; url: string }[];
	/** Wowhead's world map, pinned at the entrance. */
	entrance?: string;
	/** The layout inside (a section of the guide). */
	dungeonMap?: string;
};

export const DUNGEON_RESOURCES: Record<string, DungeonResources> = {
	"kroldok-stronghold": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/kroldok-stronghold-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=16591/t=ndungeon.41456.21360",
		dungeonMap:
			"https://www.wowhead.com/forever/guide/kroldok-stronghold-dungeon-overview-location-rewards#dungeon-map",
	},
	"drowned-city": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/the-drowned-city-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/t=ndungeon.34288.27440",
		dungeonMap: "https://www.wowhead.com/forever/guide/the-drowned-city-dungeon-overview-location-rewards#dungeon-map",
	},
	"excavation-site-wetlands": {
		guides: [
			{ url: "https://www.wowhead.com/forever/guide/excavation-site-wetlands-dungeon-overview-location-rewards" },
		],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=11/t=ndungeon.39280.18000",
		dungeonMap:
			"https://www.wowhead.com/forever/guide/excavation-site-wetlands-dungeon-overview-location-rewards#dungeon-map",
	},
	"city-of-dalaran": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/city-of-dalaran-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=36/t=ndungeon.37072.14128",
	},
	"razorfen-downs": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/razorfen-downs-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=17/t=ndungeon.18819.20860",
	},
	"ruins-of-lordaeron": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/ruins-of-lordaeron-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=85/t=ndungeon.37136.12752",
		dungeonMap:
			"https://www.wowhead.com/forever/guide/ruins-of-lordaeron-dungeon-overview-location-rewards#dungeon-map",
	},
	"hall-of-thanes": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/hall-of-thanes-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=1/t=ndungeon.38177.19156",
		dungeonMap: "https://www.wowhead.com/forever/guide/hall-of-thanes-dungeon-overview-location-rewards#dungeon-map",
	},
	stratholme: {
		guides: [
			{
				wing: "Live Side",
				url: "https://www.wowhead.com/forever/guide/stratholme-live-side-dungeon-overview-location-rewards",
			},
			{
				wing: "Undead Side",
				url: "https://www.wowhead.com/forever/guide/stratholme-undead-side-dungeon-overview-location-rewards",
			},
		],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=139/t=ndungeon.40619.11079",
	},
	"blackrock-spire": {
		guides: [
			{
				wing: "Lower Spire",
				url: "https://www.wowhead.com/forever/guide/lower-blackrock-spire-dungeon-overview-location-rewards",
			},
			{
				wing: "Upper Spire",
				url: "https://www.wowhead.com/forever/guide/upper-blackrock-spire-dungeon-overview-location-rewards",
			},
		],
	},
	scholomance: {
		guides: [{ url: "https://www.wowhead.com/forever/guide/scholomance-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=28/t=ndungeon.39827.13112",
	},
	"dire-maul": {
		guides: [
			{
				wing: "Gordoks Commons",
				url: "https://www.wowhead.com/forever/guide/dire-maul-gordoks-commons-north-dungeon-overview-location-rewards",
			},
			{
				wing: "Capital Gardens",
				url: "https://www.wowhead.com/forever/guide/dire-maul-capital-gardens-west-dungeon-overview-location-rewards",
			},
			{
				wing: "Warpwood Quarter",
				url: "https://www.wowhead.com/forever/guide/dire-maul-warpwood-quarter-east-dungeon-overview-location-rewards",
			},
		],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=357/t=ndungeon.15299.20136",
	},
	"blackrock-depths": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/blackrock-depths-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=51/t=ndungeon.38268.21227",
	},
	"sunken-temple": {
		guides: [
			{ url: "https://www.wowhead.com/forever/guide/the-temple-of-atalhakkar-dungeon-overview-location-rewards" },
		],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=8/t=ndungeon.41212.24099",
	},
	maraudon: {
		guides: [{ url: "https://www.wowhead.com/forever/guide/maraudon-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=405/t=ndungeon.13576.17759",
	},
	zulfarrak: {
		guides: [{ url: "https://www.wowhead.com/forever/guide/zulfarrak-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=440/t=ndungeon.19160.22903",
	},
	uldaman: {
		guides: [{ url: "https://www.wowhead.com/forever/guide/uldaman-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=38/t=ndungeon.40213.20154",
	},
	"wailing-caverns": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/wailing-caverns-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=17/t=ndungeon.18505.17105",
	},
	"scarlet-monastery": {
		guides: [
			{
				wing: "Library",
				url: "https://www.wowhead.com/forever/guide/scarlet-monastery-library-dungeon-overview-location-rewards",
			},
			{
				wing: "Armory",
				url: "https://www.wowhead.com/forever/guide/scarlet-monastery-armory-dungeon-overview-location-rewards",
			},
			{ url: "https://www.wowhead.com/forever/guide/scarlet-monastery-cathedral-dungeon-overview-location-rewards" },
			{
				wing: "Graveyard",
				url: "https://www.wowhead.com/forever/guide/scarlet-monastery-graveyard-dungeon-overview-location-rewards",
			},
		],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=85/t=ndungeon.38155.11560",
	},
	"razorfen-kraul": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/razerfen-kraul-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=17/t=ndungeon.17978.20665",
	},
	gnomeregan: {
		guides: [{ url: "https://www.wowhead.com/forever/guide/gnomeregan-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=1/t=ndungeon.36482.19292",
	},
	stockade: {
		guides: [{ url: "https://www.wowhead.com/forever/guide/the-stockade-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=1519/t=ndungeon.36562.22748",
	},
	"blackfathom-deeps": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/blackfathom-deeps-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=148/t=ndungeon.15666.12305",
	},
	"shadowfang-keep": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/shadowfang-keep-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=130/t=ndungeon.35867.14558",
	},
	deadmines: {
		guides: [{ url: "https://www.wowhead.com/forever/guide/the-deadmines-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=40/t=ndungeon.35762.25096",
	},
	"ragefire-chasm": {
		guides: [{ url: "https://www.wowhead.com/forever/guide/ragefire-chasm-dungeon-overview-location-rewards" }],
		entrance: "https://www.wowhead.com/forever/world-map#l=dungeon/z=1637/t=ndungeon.20631.14640",
	},
};
