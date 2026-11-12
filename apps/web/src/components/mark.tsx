import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Guildie's shield in its gold gradient: the sidebar's wordmark, the landing
 * page's app mock, and the same as the app icons (icons/mark.svg; favicon,
 * PWA icons and the Windows app's icon render it too).
 */
export function GuildieMark({ className }: { className?: string }) {
	// Each copy on the page needs its own gradient id.
	const gold = useId();
	return (
		<svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-[18px]", className)}>
			<defs>
				<linearGradient id={gold} x1="0" y1="4" x2="0" y2="27.6" gradientUnits="userSpaceOnUse">
					<stop offset="0" stopColor="#ffdd8f" />
					<stop offset="0.5" stopColor="#ffb648" />
					<stop offset="1" stopColor="#e9781c" />
				</linearGradient>
			</defs>
			<path d="M16 4l10 4.2v7.3c0 6-4.1 10.4-10 12.1-5.9-1.7-10-6.1-10-12.1V8.2z" fill={`url(#${gold})`} />
			<path d="M16 10.5v11M10.5 16h11" stroke="var(--chrome)" strokeWidth="2.25" strokeLinecap="round" />
		</svg>
	);
}
