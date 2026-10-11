// The gym's dressing for every month (new year to winter): which season it is (by UTC month, or
// forced with `?season=` for tests and demos), and what each one puts by the
// door and on the people. Pure; the 3D side builds the props.

export type Season =
	| "newyear"
	| "valentine"
	| "clover"
	| "spring"
	| "summer"
	| "halloween"
	| "harvest"
	| "winter"

export const SEASONS: readonly Season[] = [
	"newyear",
	"valentine",
	"clover",
	"spring",
	"summer",
	"halloween",
	"harvest",
	"winter",
]

/** The season in `month` (1-12), or null the rest of the year. */
export function seasonOf(month: number): Season | null {
	if (month === 1) return "newyear"
	if (month === 2) return "valentine"
	if (month === 3) return "clover"
	if (month === 4 || month === 5) return "spring"
	if (month >= 6 && month <= 8) return "summer"
	if (month === 9 || month === 11) return "harvest"
	if (month === 10) return "halloween"
	if (month === 12) return "winter"
	return null
}

/** What `?season=` names: a season, "none", or null when it is not a
 * recognised value (the calendar decides). `?ghost=1` is the old name for
 * Halloween. */
export function seasonFromQuery(
	season: string | null,
	ghost: string | null,
): Season | "none" | null {
	if (season === "none") return "none"
	if ((SEASONS as readonly string[]).includes(season ?? ""))
		return season as Season
	if (ghost === "1") return "halloween"
	if (ghost === "0") return "none"
	return null
}

/** The hat a season puts on about one member or passer-by in four. */
export const SEASON_HAT: Readonly<Record<Season, "witch" | "santa" | null>> = {
	newyear: null,
	valentine: null,
	clover: null,
	spring: null,
	summer: null,
	halloween: "witch",
	harvest: null,
	winter: "santa",
}
