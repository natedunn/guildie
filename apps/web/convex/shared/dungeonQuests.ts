// What Blizzard's quest data leaves out about dungeon quests, by hand.
// Blizzard gives Forever's own quests a side (`requirements.faction`) but
// not the original ones, and no quest a chain. So, per quest id:
//
// - side: only this side can take it (when Blizzard doesn't say, or says it
//   wrong). Quests that reward one side's reputations get that side anyway
//   (questDetails in dungeons.ts).
// - after: the quest that comes right before it in its chain (a list when
//   any one of several will do: one per side or class). A dungeon quest
//   after another of the same dungeon's doesn't count toward "picked up"
//   (you can't have it before you go in).
// - hidden: in Blizzard's data but not in the game (placeholders, and old
//   ids Forever replaced with another copy of the same quest).
//
// Checked quest by quest (November 2026) against Wowhead's Forever database,
// warcraft.wiki.gg, Forever dungeon guides and Questie's Forever data. Where
// the sources disagreed or said nothing, Blizzard's data stands.
// Quests not listed are taken as Blizzard has them. Fix or add to it when a
// dungeon's quest list looks wrong in game (dungeons.test.ts checks it's
// consistent).
//
// The second part lists the steps of those chains outside the dungeons, so
// a dungeon's page can show each chain whole: before and after its quests.

export type QuestFacts = {
	side?: "alliance" | "horde";
	after?: number | number[];
	hidden?: true;
};

const A = "alliance" as const;
const H = "horde" as const;

export const DUNGEON_QUEST_FACTS: Record<number, QuestFacts> = {
	// Ragefire Chasm
	5722: { side: H },
	5724: { side: H, after: 5722 },
	5728: { side: H, after: 5727 },
	5761: { side: H },

	// The Hall of Thanes
	96393: { side: A, after: 96391 },
	96394: { side: A },

	// Ruins of Lordaeron
	92401: { side: H },
	92415: { side: A },
	92421: { side: H },
	92422: { side: H, after: 99156 },
	95189: { side: A },
	95195: { side: A },
	95204: { side: H },
	95216: { side: H, after: 451 },
	95250: { side: A },
	97288: { side: H },

	// Deadmines
	166: { side: A, after: 155 },
	214: { side: A, after: 155 },
	92753: { side: A, after: 92752 },

	// Wailing Caverns
	914: { side: H, after: 1490 },
	1489: { side: H, after: 880 },
	1490: { side: H, after: 1489 },
	1491: { after: 865 },

	// Blackfathom Deeps
	1200: { side: A, after: 1198 },
	1275: { side: A, after: 3765 },
	6563: { side: H, after: 6562 },
	6565: { side: H, after: 6564 },

	// Stormwind Stockade
	378: { side: A, after: 303 },
	391: { side: A, after: 389 },

	// Razorfen Kraul
	1101: { side: A, after: 1100 },

	// Gnomeregan
	2922: { side: A, after: 2923 },
	2924: { side: A },
	2926: { side: A, after: 2927 },
	2930: { side: A },
	2947: { side: A, after: 2945 },
	2949: { side: H, after: 2945 },
	2952: { after: 2951 },
	2953: { after: 2952 },
	2962: { side: A, after: 2926 },
	4603: { after: 4605 },
	4604: { after: 4606 },
	4605: { after: 4601 },
	4606: { after: 4602 },

	// Excavation Site: Wetlands
	95646: { side: A, after: 275 },
	95663: { side: H },
	95664: { side: H },
	95682: { side: H, after: 95663 },
	95697: { side: H },
	95737: { side: A },
	95772: { side: A },
	95795: { side: A, after: 95772 },
	95809: { side: A, after: 95647 },
	95810: { side: A },
	98815: { side: A, after: 484 },
	98823: { side: H, after: 95664 },
	98824: { side: A, after: 95810 },

	// City of Dalaran
	92456: { side: A },
	92457: { side: A },
	92458: { side: A, after: 92432 },
	92489: { side: A },
	96984: { side: H, after: 92434 },
	96986: { side: H },
	96987: { side: H },
	96988: { side: H },

	// Scarlet Monastery
	1051: { side: H },
	1053: { side: A, after: 1052 },
	1113: { side: H, after: 1109 },
	1160: { side: H, after: 1159 },
	96257: { hidden: true },
	96800: { side: A },

	// Razorfen Downs
	3525: { after: 3523 },
	6521: { side: H, after: 6522 },
	6522: { side: H },
	93604: { after: 93601 },
	96773: { side: A },
	97196: { side: H },

	// The Drowned City
	95775: { side: H, after: 95770 },
	95776: { side: H, after: 95773 },
	95787: { side: A, after: 95786 },
	95788: { side: A, after: 95786 },

	// Uldaman
	17: { side: A, after: 2500 },
	704: { side: A, after: 739 },
	721: { side: A, after: 720 },
	722: { side: A, after: 721 },
	1139: { side: A, after: 762 },
	2198: { side: A },
	2199: { side: A, after: 2198 },
	2200: { side: A, after: 2199 },
	2201: { side: A, after: 2200 },
	2202: { side: H, after: 2258 },
	2204: { side: A, after: 2201 },
	2240: { side: A, after: 2398 },
	2280: { side: H, after: 2278 },
	2284: { side: H, after: 2283 },
	2318: { side: H, after: 2284 },
	2338: { side: H, after: 2318 },
	2339: { side: H, after: 2338 },
	2340: { side: H, after: 2339 },
	2341: { side: H, after: 2340 },
	2361: { side: A, after: 2204 },
	2398: { side: A },

	// Krol'dok Stronghold
	94968: { side: H },
	94969: { side: A },
	94972: { side: H },
	94975: { side: H },
	94982: { side: A },
	94983: { side: A },
	94984: { side: A, after: 94907 },
	95056: { hidden: true },
	96771: { side: A },

	// Maraudon
	7029: { side: H },
	7041: { side: A },
	7046: { after: 7044 },
	7064: { side: H },
	7065: { side: A },

	// Zul'Farrak
	2865: { after: 2864 },
	2936: { side: H, after: 2935 },
	2991: { side: A, after: 2990 },
	3527: { after: 3520 },

	// Sunken Temple
	1445: { side: H, after: 1444 },
	1475: { side: A, after: 1469 },
	2868: { hidden: true },
	3380: { side: H },
	3446: { after: 3444 },
	3447: { after: 3444 },
	3528: { after: 4787 },

	// Alcaz Prison
	95262: { side: A, after: 95198 },
	95263: { side: A, after: 95262 },
	95309: { side: H, after: 95285 },
	95454: { side: H, after: 95309 },
	95483: { side: H, after: 96369 },
	96337: { after: 96335 },
	96369: { side: H, after: 95454 },

	// Blackrock Depths
	3802: { after: 3801 },
	3907: { side: H, after: 3906 },
	3981: { side: H, after: 3906 },
	3982: { side: H, after: 3981 },
	4001: { side: H, after: 3982 },
	4002: { side: H, after: 4001 },
	4003: { side: H, after: 4002 },
	4004: { side: H, after: 4003 },
	4024: { after: 4022 },
	4063: { side: H, after: 4062 },
	4082: { side: H, after: 4081 },
	4121: { side: H, after: 4122 },
	4122: { side: H },
	4126: { side: A, after: 4128 },
	4128: { side: A },
	4132: { side: H, after: 4121 },
	4133: { side: H },
	4134: { side: H, after: 4133 },
	4136: { after: 4324 },
	4241: { side: A, after: 4224 },
	4242: { side: A, after: 4241 },
	4263: { side: A, after: 4262 },
	4264: { side: A, after: 4242 },
	4282: { side: A, after: 4264 },
	4299: { hidden: true },
	4322: { side: A, after: 4282 },
	4341: { side: A, after: 3701 },
	4342: { side: A },
	4361: { side: A, after: 4341 },
	4362: { side: A, after: 4361 },
	4363: { side: A, after: 4362 },
	9015: { after: 8950 },
	84338: { hidden: true },

	// Blackrock Spire
	4734: { after: 4810 },
	4735: { after: 4734 },
	4743: { after: 4742 },
	4764: { side: A, after: 4766 },
	4768: { side: H, after: 4769 },
	4788: { after: 5065 },
	4907: { after: 4810 },
	4974: { side: H, after: 4941 },
	4981: { side: H },
	4982: { side: H, after: 4981 },
	4983: { side: H, after: 4982 },
	5001: { side: A },
	5002: { side: A, after: 5001 },
	5081: { side: A, after: 5002 },
	5102: { side: A, after: 5089 },
	5127: { after: 5126 },
	6502: { side: A, after: 6501 },
	6569: { side: H, after: 6568 },
	6602: { side: H, after: 6601 },
	8966: { after: 8962 },
	8989: { after: 8986 },
	8995: { after: 8994 },
	85883: { hidden: true },

	// Dire Maul
	1318: { hidden: true },
	5519: { after: 5518 },
	7429: { after: 5525 },
	7462: { side: A, after: 7461 },
	7481: { side: H },
	7482: { side: A },
	7488: { side: A, after: 7494 },
	7489: { side: H, after: 7492 },
	7492: { side: H },
	7494: { side: A },
	7508: { after: 7507 },
	7877: { side: H, after: 7461 },
	8948: { after: 8947 },
	8949: { after: 8948 },
	8950: { after: 8949 },
	8967: { after: 8963 },
	8990: { after: 8985 },
	9030: { hidden: true },
	84548: { hidden: true },
	84549: { hidden: true },
	84550: { hidden: true },
	84551: { hidden: true },
	84555: { hidden: true },
	84556: { hidden: true },

	// Blackmaw Hold
	92065: { after: 86814 },
	92067: { hidden: true },
	92343: { side: H, after: 92346 },
	92344: { side: A, after: 92345 },
	96246: { hidden: true },
	97173: { side: A },
	97198: { side: H },

	// Stratholme
	5125: { after: 5122 },
	5213: { after: 5212 },
	5262: { after: 5251 },
	5263: { after: 5262 },
	5282: { after: 5281 },
	5463: { after: 5462 },
	5848: { after: 5846 },
	6163: { side: H, after: 6135 },
	8945: { after: 8929 },
	8968: { after: 8964 },
	8991: { after: 8987 },

	// Scholomance
	4771: { after: 5531 },
	5341: { side: H },
	5343: { side: A },
	5383: { hidden: true },
	5384: { after: 5515 },
	5466: { after: 5465 },
	5515: { after: 5382 },
	5531: { after: 5522 },
	5582: { after: 5529 },
	8969: { after: 8965 },
	8992: { after: 8988 },

	// The Shaper's Terrace
	95790: { side: A },
	95924: { side: A },
	95925: { side: A },
	95926: { side: H },
	95928: { side: H },
	97049: { side: H },

	// ---- Chain steps outside the dungeons ----

	// Ragefire Chasm's chains
	5726: { side: H },
	5727: { side: H, after: 5726 },
	5729: { side: H, after: 5728 },
	5730: { side: H, after: 5729 },

	// The Hall of Thanes's chains
	96391: { side: A },

	// Ruins of Lordaeron's chains
	356: { side: H },
	447: { side: H },
	450: { side: H, after: 447 },
	451: { side: H, after: 450 },
	95161: { side: A, after: 92415 },
	97289: { side: H, after: 97288 },
	97290: { side: H, after: 97289 },
	97291: { side: H, after: 97290 },
	97292: { side: H, after: 97291 },
	99156: { side: H, after: 356 },

	// Deadmines's chains
	65: { side: A },
	132: { side: A, after: 65 },
	135: { side: A, after: 132 },
	141: { side: A, after: 135 },
	142: { side: A, after: 141 },
	155: { side: A, after: 142 },
	92752: { side: A },

	// Wailing Caverns's chains
	865: {},
	870: { side: H },
	877: { side: H, after: 870 },
	880: { side: H, after: 877 },
	3369: { side: H, after: 6981 },
	3370: { side: A, after: 6981 },

	// Blackfathom Deeps's chains
	3765: { side: A },

	// Stormwind Stockade's chains
	303: { side: A },
	350: { side: A, after: 393 },
	373: { side: A },
	389: { side: A, after: 373 },
	392: { side: A, after: 391 },
	393: { side: A, after: 392 },
	394: { side: A, after: 434 },
	395: { side: A, after: 394 },
	396: { side: A, after: 395 },
	434: { side: A, after: 2746 },
	2745: { side: A, after: 350 },
	2746: { side: A, after: 2745 },

	// Razorfen Kraul's chains
	1100: { side: A },

	// Gnomeregan's chains
	2948: { side: A, after: 2947 },
	2950: { side: H, after: 2949 },

	// Excavation Site: Wetlands's chains
	275: { side: A, after: 277 },
	276: { side: A },
	277: { side: A, after: 276 },
	484: { side: A },

	// City of Dalaran's chains
	92432: { side: A },
	92434: { side: H },
	92459: { side: A, after: 92458 },
	97287: { side: H, after: 96984 },

	// Scarlet Monastery's chains
	261: { side: A },
	1052: { side: A, after: 261 },
	1149: { side: H },
	1150: { side: H, after: 1149 },
	1151: { side: H, after: 1150 },
	1152: { side: H, after: 1151 },
	1154: { side: H, after: 1152 },
	1159: { side: H, after: 6627 },
	1394: { side: H, after: 6628 },
	6627: { side: H, after: 1154 },
	6628: { side: H, after: 1160 },

	// Razorfen Downs's chains
	93601: { after: 93404 },

	// The Drowned City's chains
	205: { side: A, after: 207 },
	207: { side: A },
	629: { side: H },
	95748: { side: H, after: 629 },
	95770: { side: H, after: 95748 },
	95773: { side: H },
	95786: { side: A, after: 205 },

	// Uldaman's chains
	707: { side: A },
	720: { side: A },
	723: { side: A, after: 722 },
	724: { side: A, after: 723 },
	725: { side: A, after: 724 },
	726: { side: A, after: 725 },
	727: { side: A, after: 709 },
	728: { side: H, after: 709 },
	735: { side: A, after: 727 },
	736: { side: H, after: 728 },
	737: { after: [735, 736] },
	738: { side: A, after: 707 },
	739: { side: A, after: 738 },
	762: { side: A, after: 726 },
	2203: { side: H, after: 2202 },
	2258: { side: H },
	2279: { side: A, after: 2278 },
	2439: { side: A, after: 2279 },
	2440: { side: H, after: 2280 },
	2500: { side: A },
	2946: { side: A, after: 2963 },
	2954: { after: [2946, 2966] },
	2963: { side: A, after: 2439 },
	2964: { side: A, after: 2977 },
	2965: { side: H, after: 2440 },
	2966: { side: H, after: 2965 },
	2967: { side: H, after: 2954 },
	2968: { side: H, after: 2967 },
	2977: { side: A, after: 2954 },

	// Krol'dok Stronghold's chains
	94907: { side: A },
	94997: { side: A, after: 94983 },
	94998: { side: A, after: 94997 },

	// Zul'Farrak's chains
	2933: { side: H },
	2934: { side: H, after: 2933 },
	2935: { side: H, after: 2934 },
	2937: { side: H, after: 2936 },
	2938: { side: H, after: 2937 },
	2988: { side: A },
	2989: { side: A, after: 2988 },
	2990: { side: A, after: 2989 },
	2992: { side: A, after: 2991 },
	2993: { side: A, after: 2992 },
	2994: { side: A, after: 2993 },
	3520: {},
	4787: { after: 3527 },

	// Sunken Temple's chains
	1424: { side: H },
	1429: { side: H, after: 1424 },
	1444: { side: H, after: 1429 },
	1448: { side: A },
	1449: { side: A, after: 1448 },
	1450: { side: A, after: 1449 },
	1451: { side: A, after: 1450 },
	1452: { side: A, after: 1451 },
	1469: { side: A, after: 1452 },
	3374: { after: 3373 },
	3444: { after: [3380, 3445] },
	3512: { after: 3374 },
	5065: { after: 3528 },

	// Alcaz Prison's chains
	95194: { side: A },
	95196: { side: A, after: 95194 },
	95198: { side: A, after: 95196 },
	95283: { side: H },
	95284: { side: H, after: 95283 },
	95285: { side: H, after: 95284 },

	// Blackrock Depths's chains
	3441: {},
	3442: { after: 3441 },
	3443: { after: 3442 },
	3452: { after: 3443 },
	3453: { after: 3452 },
	3454: { after: 3453 },
	3462: { after: 3454 },
	3463: { after: 3462 },
	3481: { after: 3463 },
	3701: { side: A, after: 3702 },
	3702: { side: A },
	3906: { side: H },
	4022: { after: 3481 },
	4061: { side: H },
	4062: { side: H, after: 4061 },
	4182: { side: A },
	4183: { side: A, after: 4182 },
	4184: { side: A, after: 4183 },
	4185: { side: A, after: 4184 },
	4186: { side: A, after: 4185 },
	4223: { side: A, after: 4186 },
	4224: { side: A, after: 4223 },
	4262: { side: A },
	6402: { side: A, after: 4322 },
	6403: { side: A, after: 6402 },
	6501: { side: A, after: 6403 },
	8951: { side: A, after: 9015 },
	8952: { side: A, after: 9015 },
	8953: { side: A, after: 9015 },
	8954: { side: A, after: 9015 },
	8955: { side: A, after: 9015 },
	8956: { side: A, after: 9015 },
	8957: { side: H, after: 9015 },
	8958: { side: A, after: 9015 },
	8959: { side: A, after: 9015 },
	8960: { side: A, after: [8951, 8952, 8953, 8954, 8955, 8956, 8958, 8959] },
	8961: { after: [8960, 9032] },
	8962: { after: 8961 },
	8963: { after: 8961 },
	8964: { after: 8961 },
	8965: { after: 8961 },
	8985: { after: [8964, 8970] },
	8986: { after: [8965, 8970] },
	8987: { after: [8962, 8970] },
	8988: { after: [8963, 8970] },
	9016: { side: H, after: 9015 },
	9017: { side: H, after: 9015 },
	9018: { side: H, after: 9015 },
	9019: { side: H, after: 9015 },
	9020: { side: H, after: 9015 },
	9021: { side: H, after: 9015 },
	9022: { side: H, after: 9015 },
	9032: { side: H, after: [8957, 9016, 9017, 9018, 9019, 9020, 9021, 9022] },

	// Blackrock Spire's chains
	4726: {},
	4765: { side: A, after: 4764 },
	4808: { after: 4726 },
	4809: { after: 4808 },
	4810: { after: 4809 },
	4941: { side: H, after: 4903 },
	5063: { after: 5047 },
	5067: { after: 5047 },
	5068: { after: 5047 },
	5126: {},
	5161: { after: 5160 },
	5162: { after: 5161 },
	5164: { after: 5162 },
	5166: { after: 5164 },
	5167: { after: 5164 },
	5522: { after: 4735 },
	6566: { side: H, after: 4974 },
	6567: { side: H, after: 6566 },
	6568: { side: H, after: 6567 },
	6570: { side: H, after: 6569 },
	6582: { side: H, after: 6570 },
	6583: { side: H, after: 6570 },
	6584: { side: H, after: 6570 },
	6585: { side: H },
	6601: { side: H, after: 6585 },
	8181: { after: 4788 },
	8182: { after: 8181 },
	8970: { after: [8966, 8967, 8968, 8969] },
	8994: { after: [8989, 8990, 8991, 8992] },
	8996: { after: 8995 },
	8997: { side: A, after: 8996 },
	8998: { side: H, after: 8996 },
	8999: { side: A, after: 8997 },
	9000: { side: A, after: 8997 },
	9001: { side: A, after: 8997 },
	9002: { side: A, after: 8997 },
	9003: { side: A, after: 8997 },
	9004: { side: A, after: 8997 },
	9005: { side: A, after: 8997 },
	9006: { side: A, after: 8997 },
	9007: { side: H, after: 8998 },
	9008: { side: H, after: 8998 },
	9009: { side: H, after: 8998 },
	9010: { side: H, after: 8998 },
	9011: { side: H, after: 8998 },
	9012: { side: H, after: 8998 },
	9013: { side: H, after: 8998 },
	9014: { side: H, after: 8998 },

	// Dire Maul's chains
	7509: { after: 7508 },
	8946: { after: 8945 },
	8947: { after: 8946 },

	// Blackmaw Hold's chains
	86798: {},
	86814: { after: 87346 },
	87346: { after: 86798 },
	92345: { side: A },
	92346: { side: H },

	// Stratholme's chains
	5264: { after: 5263 },
	5265: { after: 5264 },
	5281: {},
	5461: { after: 5384 },
	5462: { after: 5461 },
	5464: { after: 5463 },
	5465: { after: 5464 },
	5742: {},
	5781: { after: 5742 },
	5845: { after: 5781 },
	5846: { after: 5845 },
	5861: { after: 5848 },
	5862: { after: 5861 },
	5944: { after: 5862 },
	6133: { side: H },
	6135: { side: H, after: 6133 },
	8905: { side: A },
	8906: { side: A },
	8907: { side: A },
	8908: { side: A },
	8909: { side: A },
	8910: { side: A },
	8911: { side: A },
	8912: { side: A },
	8913: { side: H },
	8914: { side: H },
	8915: { side: H },
	8916: { side: H },
	8917: { side: H },
	8918: { side: H },
	8919: { side: H },
	8920: { side: H },
	8921: { after: [8922, 8923] },
	8922: { side: A, after: [8905, 8906, 8907, 8908, 8909, 8910, 8911, 8912] },
	8923: { side: H, after: [8913, 8914, 8915, 8916, 8917, 8918, 8919, 8920] },
	8924: { after: 8921 },
	8925: { after: 8924 },
	8926: { side: A, after: 8977 },
	8928: { after: 8925 },
	8929: { side: A, after: [8926, 8931, 8932, 8933, 8934, 8935, 8936, 8937] },
	8931: { side: A, after: 8977 },
	8932: { side: A, after: 8977 },
	8933: { side: A, after: 8977 },
	8934: { side: A, after: 8977 },
	8935: { side: A, after: 8977 },
	8936: { side: A, after: 8977 },
	8937: { side: A, after: 8977 },
	8977: { side: A, after: 8928 },

	// Scholomance's chains
	5342: { side: H, after: 5341 },
	5344: { side: A, after: 5343 },
};

/**
 * Dungeon quests that start inside the dungeon: from an item that drops
 * there, or an NPC or object in it (the Crest of Lordaeron, Knot
 * Thimblejack). Nobody has them before going in, so they don't count
 * toward "picked up". The original dungeons' from where Questie's Forever
 * data has their quest givers, objects and drops; Forever's own from
 * Wowhead, guides and Blizzard's quest text.
 */
export const STARTS_INSIDE = new Set<number>([
	// Ragefire Chasm
	5724,
	// Hall of Thanes
	96395,
	// Ruins of Lordaeron
	92415, 95189, 95195, 95204, 95250, 97288,
	// Wailing Caverns
	6981,
	// Blackfathom Deeps
	1200, 6561, 6564,
	// Gnomeregan
	2904, 2945, 2947, 2949, 2951, 2952, 2953, 4601, 4602, 4603, 4604, 4605, 4606,
	// Excavation Site
	95664, 95795, 95809, 95810,
	// City of Dalaran
	96987,
	// Razorfen Downs
	3523, 3525, 6522,
	// Uldaman
	2198,
	// Krol'dok Stronghold
	94969,
	// Sunken Temple
	3373,
	// Alcaz Prison
	95263, 95454, 95483, 96335, 96337, 96369,
	// Blackrock Depths
	4264, 7604,
	// Blackrock Spire
	4867, 4903, 4982, 4983, 5001, 5002, 5089, 5160, 7761,
	// Dire Maul
	1193, 5518, 5519, 5525, 5528, 7429, 7461, 7462, 7463, 7483, 7484, 7485, 7498, 7499, 7500, 7501, 7502, 7503, 7504,
	7505, 7506, 7507, 7508, 7703, 7877, 8949, 8950, 98685, 98830,
	// Blackmaw Hold
	92070,
	// Stratholme
	5122, 5125, 5262,
	// Scholomance
	5582,
	// Shaper's Terrace
	95790,
	// Deadmines, Scarlet Monastery (EXTRA_DUNGEON_QUESTS)
	373, 1051,
]);

/**
 * Dungeon quests Blizzard doesn't type "Dungeon", so the sync doesn't find
 * them in the dungeon's quest area: they start inside and are done
 * outside. Looked up and counted like the rest. (Quests only one
 * profession can take, like Blackrock Spire's "Hot Fiery Death", stay out.)
 */
export const EXTRA_DUNGEON_QUESTS: Record<string, number[]> = {
	// The Unsent Letter: from a letter Edwin VanCleef drops.
	deadmines: [373],
	// Vorrel's Revenge: from Vorrel Sengutz inside.
	"scarlet-monastery": [1051],
};
