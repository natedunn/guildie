/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as addonPayload from "../addonPayload.js";
import type * as addonView from "../addonView.js";
import type * as auth from "../auth.js";
import type * as authBattlenet from "../authBattlenet.js";
import type * as authGateway from "../authGateway.js";
import type * as blizzard from "../blizzard.js";
import type * as buildSite from "../buildSite.js";
import type * as claimRegions from "../claimRegions.js";
import type * as claims from "../claims.js";
import type * as crafting from "../crafting.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as guilds from "../guilds.js";
import type * as helper from "../helper.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as items from "../items.js";
import type * as origins from "../origins.js";
import type * as proficiencies from "../proficiencies.js";
import type * as profile from "../profile.js";
import type * as quests from "../quests.js";
import type * as recipes from "../recipes.js";
import type * as requests from "../requests.js";
import type * as sample from "../sample.js";
import type * as shared_foreverTalents from "../shared/foreverTalents.js";
import type * as shared_itemInfo from "../shared/itemInfo.js";
import type * as shared_proficiencies from "../shared/proficiencies.js";
import type * as shared_quests from "../shared/quests.js";
import type * as shared_requests from "../shared/requests.js";
import type * as shared_upgrades from "../shared/upgrades.js";
import type * as shared_weights from "../shared/weights.js";
import type * as shared_wow from "../shared/wow.js";
import type * as sync from "../sync.js";
import type * as talents from "../talents.js";
import type * as upgradeProfiles from "../upgradeProfiles.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addonPayload: typeof addonPayload;
  addonView: typeof addonView;
  auth: typeof auth;
  authBattlenet: typeof authBattlenet;
  authGateway: typeof authGateway;
  blizzard: typeof blizzard;
  buildSite: typeof buildSite;
  claimRegions: typeof claimRegions;
  claims: typeof claims;
  crafting: typeof crafting;
  crons: typeof crons;
  dev: typeof dev;
  guilds: typeof guilds;
  helper: typeof helper;
  http: typeof http;
  inventory: typeof inventory;
  items: typeof items;
  origins: typeof origins;
  proficiencies: typeof proficiencies;
  profile: typeof profile;
  quests: typeof quests;
  recipes: typeof recipes;
  requests: typeof requests;
  sample: typeof sample;
  "shared/foreverTalents": typeof shared_foreverTalents;
  "shared/itemInfo": typeof shared_itemInfo;
  "shared/proficiencies": typeof shared_proficiencies;
  "shared/quests": typeof shared_quests;
  "shared/requests": typeof shared_requests;
  "shared/upgrades": typeof shared_upgrades;
  "shared/weights": typeof shared_weights;
  "shared/wow": typeof shared_wow;
  sync: typeof sync;
  talents: typeof talents;
  upgradeProfiles: typeof upgradeProfiles;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authBattlenet: import("@convex-dev/auth/components/oauth/_generated/component.js").ComponentApi<"authBattlenet">;
  authAnonymous: import("@convex-dev/auth/components/anonymous/_generated/component.js").ComponentApi<"authAnonymous">;
};
