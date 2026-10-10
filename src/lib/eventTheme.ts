// The app's event looks (#124, #141): a joined challenge's theme (retro
// arcade, sunrise, greens) or the month's look (new year, Valentine's, clover,
// spring, summer, Halloween, harvest, winter) dresses the pages behind the cards with a slow animated backdrop,
// a tinted accent and now and then a tiny event drifting past. Pure rules
// here; ThemeLayer.svelte draws them.

export type EventTheme =
	| "arcade"
	| "sunrise"
	| "greens"
	| "spring"
	| "summer"
	| "halloween"
	| "harvest"
	| "winter"
	| "newyear"
	| "valentine"
	| "clover"

const CHALLENGE_THEMES: readonly string[] = ["arcade", "sunrise", "greens"]

/** The month's look by UTC month (1-12): every month has one, so the app
 * always wears something (a joined challenge's look still wins). */
export function seasonTheme(month: number): EventTheme | null {
	switch (month) {
		case 1:
			return "newyear"
		case 2:
			return "valentine"
		case 3:
			return "clover"
		case 4:
		case 5:
			return "spring"
		case 6:
		case 7:
		case 8:
			return "summer"
		case 9:
		case 11:
			return "harvest"
		case 10:
			return "halloween"
		case 12:
			return "winter"
		default:
			return null
	}
}

/** What dresses the app now: a joined challenge's theme first, else the
 * season, else nothing. */
export function pickEventTheme(
	challengeTheme: string | null,
	joined: boolean,
	month: number,
): EventTheme | null {
	if (joined && challengeTheme && CHALLENGE_THEMES.includes(challengeTheme))
		return challengeTheme as EventTheme
	return seasonTheme(month)
}

/** A tiny thing that drifts across the backdrop now and then. */
export type ThemeEvent = {
	id: string
	/** CSS class of the movement. */
	cls: string
	/** A glyph (emoji), or markup (pixel art). */
	glyph?: string
	svg?: string
	/** Seconds between one of these and the next. */
	every: readonly [number, number]
}

/** A pixel space invader (11 x 8), crisp at any size. */
export const INVADER_SVG =
	'<svg viewBox="0 0 11 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 0h1v1h1v1h3V1h1V0h1v1h-1v1h1v1h1v3h-1V5h-1v2H8V6H3v1H2V5H1v1H0V3h1V2h1V1H2z"/><path fill="#14091f" d="M3 3h1v1H3zM7 3h1v1H7z"/></svg>'

/** A pixel coin (8 x 8). */
export const PIXEL_COIN_SVG =
	'<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="#ffd23a" d="M2 0h4v1h1v1h1v4H7v1H6v1H2V7H1V6H0V2h1V1h1z"/><path fill="#b8860b" d="M3 2h2v4H3z"/><path fill="#ffd23a" d="M3.5 3h1v2h-1z"/></svg>'

export const THEME_EVENTS: Readonly<Record<EventTheme, readonly ThemeEvent[]>> =
	{
		arcade: [
			{ id: "invader", cls: "cross", svg: INVADER_SVG, every: [14, 26] },
			{ id: "coin", cls: "rise", svg: PIXEL_COIN_SVG, every: [9, 18] },
		],
		sunrise: [{ id: "bird", cls: "cross", glyph: "🐦", every: [18, 34] }],
		greens: [
			{ id: "sprout", cls: "rise", glyph: "🌱", every: [14, 26] },
			{ id: "bee", cls: "cross", glyph: "🐝", every: [20, 36] },
		],
		spring: [
			{ id: "butterfly", cls: "cross", glyph: "🦋", every: [16, 30] },
			{ id: "petal", cls: "fall", glyph: "🌸", every: [8, 16] },
		],
		summer: [
			{ id: "bird", cls: "cross", glyph: "🐦", every: [16, 30] },
			{ id: "cloud", cls: "cross slow", glyph: "☁️", every: [20, 36] },
		],
		halloween: [
			{ id: "bat", cls: "cross", glyph: "🦇", every: [12, 24] },
			{ id: "ghost", cls: "rise", glyph: "👻", every: [18, 34] },
		],
		harvest: [
			{ id: "leaf", cls: "fall", glyph: "🍂", every: [6, 12] },
			{ id: "bird", cls: "cross", glyph: "🐦", every: [22, 40] },
		],
		winter: [
			{ id: "flake", cls: "fall", glyph: "❄️", every: [5, 10] },
			{ id: "star", cls: "streak", glyph: "⭐", every: [20, 38] },
		],
		newyear: [
			{ id: "firework", cls: "rise", glyph: "🎆", every: [10, 20] },
			{ id: "sparkle", cls: "streak", glyph: "✨", every: [14, 26] },
		],
		valentine: [
			{ id: "heart", cls: "rise", glyph: "💗", every: [8, 16] },
			{ id: "letter", cls: "cross", glyph: "💌", every: [20, 36] },
		],
		clover: [
			{ id: "clover", cls: "fall", glyph: "🍀", every: [8, 16] },
			{ id: "rainbow", cls: "cross slow", glyph: "🌈", every: [24, 40] },
		],
	}

/** A random wait inside `range` seconds. */
export function nextDelay(
	range: readonly [number, number],
	rng: () => number,
): number {
	return range[0] + rng() * (range[1] - range[0])
}

/** The accent each look tints the app with. */
export const THEME_ACCENT: Readonly<Record<EventTheme, string>> = {
	arcade: "#ff4fd8",
	sunrise: "#ff9f43",
	greens: "#5bd16a",
	spring: "#ff8fb1",
	summer: "#ffc533",
	halloween: "#ff8a1f",
	harvest: "#d98a2b",
	winter: "#6fc3ff",
	newyear: "#ffd23a",
	valentine: "#ff5c8a",
	clover: "#3ec46d",
}
