---

name: blizzard-forever-api
description: What Blizzard's Game Data and Profile APIs return for WoW Forever and how Guildie calls them. Use when adding or debugging a Blizzard API call (apps/web/convex/blizzard.ts, sync.ts, items.ts, recipes.ts, talents.ts, claims), when data is missing for a character or item, or when working out whether Blizzard has some data at all or the addon has to read it in game.
---

# Blizzard's API for WoW: Forever

Forever's API isn't documented by Blizzard. Paths come from community testing
([Pinta365/blizzard_api](https://github.com/Pinta365/blizzard_api)) and from
trying them. Verify a new path with a probe before building on it.

## Calling it

Only from Convex **actions** (convex-in-guildie skill):

```ts
import { appToken, blizzardGet } from "./blizzard";
const token = await appToken(ctx, "us"); // client credentials, cached in apiTokens
const res = await blizzardGet<MyShape>({
	token,
	flavor: "forever",
	region: "us",
	namespace: "static",
	path: "/data/wow/item/2520",
});
if (!res.ok) {
	/* res.status === 404: not there (yet); other errors throw */
}
```

- Host: `https://{region}.api.blizzard.com`, regions `us`, `eu`, `kr`, `tw`.
  `locale=en_US` always (the site and the gear rules read English strings).
- Namespaces (`FLAVORS.forever.namespace` in `convex/shared/wow.ts`):
  `profile-forever-{region}` (characters, guilds), `static-forever-{region}`
  (items, recipes, professions, talent trees, media),
  `dynamic-forever-{region}`.
- Static data is the same in every region; we read it from `us`.
- Keys: `AUTH_BATTLENET_CLIENT_ID` / `_SECRET` on the Convex deployment, never
  in the repo (docs/blizzard-setup.md). Local work doesn't need them (sample
  data). `npx convex run dev:probe '{"guild": "Name", "region": "us"}'`
  checks keys and shows which fields come back;
  `npx convex run dev:get '{"path": "/data/wow/quest/166", "namespace": "static"}'`
  prints one raw response.

## Names and slugs

- **Realmless.** Characters are `{name}-{surname}` (slug lowercased,
  `/profile/wow/character/{name}-{surname}`); guilds are a bare slug of the
  name (`guildSlug`: lowercase, spaces to hyphens, `/data/wow/guild/{slug}`).
  No realm anywhere. A realm-based flavor (Classic Era) would need realm
  slugs in both paths (`FLAVORS`).
- The in-game GUID's trailing hex number is Blizzard's character id; that's
  how addon uploads match characters.

## What exists and what doesn't

| Want                                                                    | Endpoint                                                                                                        | Notes                                                                                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guild + roster                                                          | `/data/wow/guild/{slug}`, `/roster` (profile)                                                                   | Rank numbers only (0 = guild master), no rank names. Members under 10 are listed                                                                                         |
| Character profile                                                       | `/profile/wow/character/{slug}` + `/equipment`, `/professions`, `/specializations`, `/character-media`          | **Only from level 10, and only after the character logs out** at 10+. Until then 404 (`UNFETCHED_NOTE`). Updated on logout, so it lags play                              |
| Quests in progress                                                      | `/profile/wow/character/{slug}/quests` → `in_progress: [{ id, name }]`, `completed` (a link)                    | With the profile sync; as of the last logout like the rest. No progress or complete state (the addon has those)                                                          |
| A quest                                                                 | `/data/wow/quest/{id}` (static)                                                                                 | `title`, `area` (zone, or the dungeon), `type` only for some (`Dungeon`, id 81), `requirements` mostly empty, no quest level (`quests.ts`)                               |
| Character renders                                                       | `/character-media` assets: `avatar`, `main-raw`                                                                 | Can 404 for a day after a character first appears                                                                                                                        |
| Items                                                                   | `/data/wow/item/{id}`, `/data/wow/media/item/{id}` (static)                                                     | The item endpoint **404s for many Forever items whose media works**: fall back to what we already know (`items.ts` hints: name, quality, tooltip from the equipped item) |
| Item tooltips                                                           | `preview_item` display strings → `tooltipLines()` (`items.ts`)                                                  | English; `shared/itemInfo.ts` reads them back                                                                                                                            |
| Recipes                                                                 | `/data/wow/profession/index` → `/profession/{id}` → `/skill-tier/{id}` → `/recipe/{id}`                         | Weekly cron, ~1 request per recipe, batched. Skip names with `[DNT]`                                                                                                     |
| Talent trees                                                            | `/data/wow/talent-tree/index` → each tree (`display_row`, `display_col`, ranks) + `/media/spell/{id}` for icons | Weekly with recipes (`talents.ts`). Talent ids are TraitDefinition ids, same as the addon's                                                                              |
| A user's characters                                                     | `/profile/user/wow` with the **user's** token, per region host                                                  | Claims only (`claimRegions.ts`); 404 = none in that region                                                                                                               |
| Online status, rank names, bank, bags, known recipes beyond the profile | none                                                                                                            | The addon reads them in game                                                                                                                                             |

## Rate limits

100 requests/second and 36,000/hour per client. A character sync is ~5
requests; a 500-member guild is ~2,500/hour. So:

- Stagger with `ctx.scheduler.runAfter(i * STAGGER_MS, ...)` (see
  `PROFILE_STAGGER_MS` in `sync.ts`, `BATCH`/`BATCH_STAGGER_MS` in
  `items.ts`/`recipes.ts`).
- Skip what's fresh (`PROFILE_TTL_MS`, `items.missing`, recipe refresh age).
- Never call Blizzard per page view; sync into tables and read those.

## Media URLs

Media endpoints return asset URLs (`assets[].key`/`value`): `icon` for items
and spells, `avatar`/`main-raw` for characters. Store the URL and render it
directly (`ItemIcon`, `CharacterAvatar`); don't proxy or re-host.
