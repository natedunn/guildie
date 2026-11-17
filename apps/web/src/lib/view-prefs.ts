import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef } from "react";

// Remembered views. Some URL params are also how a player likes to look at a
// page (the roster's sort and filters, later Inventory's list or grid). For
// those, a page reads:
//
//   1. the URL, so a shared link opens as sent;
//   2. what the player saved (convex/viewPrefs.ts), signed in only;
//   3. the page's default, which neither of them holds.
//
// The saved settings come with every page (the root loader), so the server
// render already shows the player's view: no flash. Changing a control writes
// the URL and saves. On arrival, saved settings the URL lacks are copied into
// it, so the address bar is always what you see and copying it shares that.
// Search text and selections (`q`, `item`, a character) stay URL-only.

type Pages = NonNullable<FunctionReturnType<typeof api.viewPrefs.mine>>;
export type PrefPage = keyof Pages;

/** The root loader awaits this, so it's in the cache on every page. */
export const viewPrefsQuery = convexQuery(api.viewPrefs.mine, {});

const pick = (from: Record<string, unknown>, keys: readonly string[]) =>
	Object.fromEntries(keys.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));

/**
 * A page's search params with its remembered ones filled in. `parse` is the
 * route's `validateSearch`, so a saved value from an older version of the
 * page is checked like a URL is (and dropped if it no longer means anything).
 * `set` takes a patch; `undefined` means the default (and leaves the URL).
 */
export function useRememberedSearch<S extends Record<string, unknown>>({
	page,
	search: fromRouter,
	remembered,
	parse,
}: {
	page: PrefPage;
	search: S;
	remembered: readonly (keyof S & string)[];
	parse: (raw: Record<string, unknown>) => S;
}) {
	// The router hands every route the raw URL params too, with only the keys
	// validateSearch kept overwritten: "?sort=bogus" would come through. Check again.
	const search = useMemo(() => parse(fromRouter), [parse, fromRouter]);
	const { data: pages } = useSuspenseQuery(viewPrefsQuery);
	const saved = pages?.[page];
	const fromSaved = useMemo(
		() => pick(parse((saved ?? {}) as Record<string, unknown>), remembered) as Partial<S>,
		[saved, parse, remembered],
	);
	const values = { ...fromSaved, ...search } as S;

	const navigate = useNavigate();
	const save = useMutation(api.viewPrefs.set).withOptimisticUpdate((store, args) => {
		const current = store.getQuery(api.viewPrefs.mine, {});
		if (current) store.setQuery(api.viewPrefs.mine, {}, { ...current, ...args });
	});

	// Once per visit: put saved settings the URL doesn't have into it.
	const mirrored = useRef(false);
	useEffect(() => {
		if (mirrored.current) return;
		mirrored.current = true;
		const missing = Object.keys(fromSaved).filter((k) => search[k] === undefined);
		if (!missing.length) return;
		navigate({
			to: ".",
			search: (prev: Record<string, unknown>) => ({ ...pick(fromSaved, missing), ...prev }),
			replace: true,
			resetScroll: false,
		} as never);
	}, [fromSaved, search, navigate]);

	const set = (patch: Partial<S>) => {
		navigate({
			to: ".",
			search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
			replace: true,
			resetScroll: false,
		} as never);
		if (pages && remembered.some((k) => k in patch)) {
			void save({ [page]: pick({ ...values, ...patch }, remembered) }).catch(() => {
				// Not saved (offline, signed out meanwhile): the URL still has it.
			});
		}
	};

	return { values, set };
}
