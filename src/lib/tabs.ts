// The primary tabs in the order a swipe walks them: Gym (Today lives in its
// drawer), Compete (challenges and tournaments), Progress, Social (the feed
// and badges).
import type { RoutePath } from "../router.svelte.js"

export type Tab = {
	id: string
	label: string
	icon: string
	targetPath: RoutePath
	matchPaths: RoutePath[]
}

export const TABS: readonly Tab[] = [
	{
		id: "gym",
		label: "Gym",
		icon: '<path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M8.5 15h7M8.5 13.5v3M15.5 13.5v3"/>',
		targetPath: "/",
		matchPaths: ["/"],
	},
	{
		id: "compete",
		label: "Compete",
		icon: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4.5a3 3 0 0 0 3 4M16 6h3.5a3 3 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
		targetPath: "/challenges",
		matchPaths: ["/challenges", "/tournaments"],
	},
	{
		id: "progress",
		label: "Progress",
		icon: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
		targetPath: "/weight",
		matchPaths: ["/weight", "/food", "/upgrades"],
	},
	{
		id: "social",
		label: "Social",
		icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.4c1.9.8 3 2.8 3 5.6"/>',
		targetPath: "/social",
		matchPaths: ["/social", "/badges"],
	},
]

/** Which tab a path belongs to (-1: none, e.g. Settings). */
export function tabIndexOf(path: RoutePath): number {
	return TABS.findIndex((t) => t.matchPaths.includes(path))
}

/** Where a swipe from `path` goes: the next tab (`dir` 1) or the one before
 * (-1); null at either end or off the tabs. */
export function neighbourPath(path: RoutePath, dir: 1 | -1): RoutePath | null {
	const i = tabIndexOf(path)
	if (i < 0) return null
	return TABS[i + dir]?.targetPath ?? null
}
