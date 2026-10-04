// Which event look the app wears now (see eventTheme.ts): the joined
// challenge's theme or the season, if the player has not switched it off.
import { api } from "./api.js"
import { type EventTheme, pickEventTheme, THEME_ACCENT } from "./eventTheme.js"

const KEY = "sp-event-theme"

function savedOn(): boolean {
	try {
		return localStorage.getItem(KEY) !== "off"
	} catch {
		return true
	}
}

export const eventLook = $state<{
	/** The player's switch (kept in this browser). */
	on: boolean
	challengeTheme: string | null
	joined: boolean
	/** 0-1 of the challenge's goals done (the sunrise sky follows it). */
	progress: number
}>({ on: savedOn(), challengeTheme: null, joined: false, progress: 0 })

/** `?event=arcade|sunrise|greens|spring|summer|halloween|harvest|winter|none`
 * forces a look (tests, demos); read once. */
const forced = (() => {
	const q = new URLSearchParams(globalThis.location?.search ?? "").get("event")
	if (q === "none") return "none"
	return q && q in THEME_ACCENT ? (q as EventTheme) : null
})()

/** The look to wear, or null. */
export function activeEventTheme(): EventTheme | null {
	if (forced === "none") return null
	if (forced) return forced
	if (!eventLook.on) return null
	return pickEventTheme(
		eventLook.challengeTheme,
		eventLook.joined,
		new Date().getUTCMonth() + 1,
	)
}

export function setEventThemeOn(on: boolean): void {
	eventLook.on = on
	try {
		localStorage.setItem(KEY, on ? "on" : "off")
	} catch {
		// not remembered, still works for this visit
	}
}

type Current = {
	theme: string | null
	joined: boolean
	goalsCompleted: number
	totalGoals: number
} | null

/** Reads this month's challenge (after a login, a join or a goal logged). */
export async function loadEventTheme(): Promise<void> {
	try {
		const c = await api.get<Current>("/challenges/current")
		eventLook.challengeTheme = c?.theme ?? null
		eventLook.joined = !!c?.joined
		eventLook.progress = c?.totalGoals ? c.goalsCompleted / c.totalGoals : 0
	} catch {
		// the season's look still applies
	}
}
