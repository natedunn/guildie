import { useEffect, useRef, useState } from "react";

/**
 * A search box that lives in the URL (`?q=`). Typing stays local (instant);
 * the URL follows a beat later, replacing the history entry so Back doesn't
 * step through every keystroke. Back/forward or a pasted link changing the
 * URL updates the box.
 */
export function useSearchText(fromUrl: string | undefined, write: (q: string | undefined) => void) {
	const [text, setText] = useState(fromUrl ?? "");
	const pushed = useRef(fromUrl);
	const writeRef = useRef(write);
	writeRef.current = write;

	useEffect(() => {
		const q = text.trim() || undefined;
		if (q === pushed.current) return;
		const t = setTimeout(() => {
			pushed.current = q;
			writeRef.current(q);
		}, 250);
		return () => clearTimeout(t);
	}, [text]);

	useEffect(() => {
		if (fromUrl !== pushed.current) {
			pushed.current = fromUrl;
			setText(fromUrl ?? "");
		}
	}, [fromUrl]);

	return [text, setText] as const;
}
