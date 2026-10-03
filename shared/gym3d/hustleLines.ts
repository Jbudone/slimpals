// What a member says as they are hurried along (tap-to-hustle). Short, a
// little dry, escalating; `hustleLine(n)` picks by how many taps they have had.
export const HUSTLE_LINES: readonly string[] = [
	"Okay okay, I'm going!",
	"Is this a gym or boot camp?!",
	"My form! Look at my form!",
	"I can't feel my arms...",
	"Who hired you?",
	"Fine. FINE.",
]

export const HUSTLE_DONE_LINES: readonly string[] = [
	"...worth it.",
	"Done. Water. Now.",
	"Same time tomorrow?",
	"I regret nothing. Mostly.",
]

/** The line for a member's `n`th tap (1-based) out of `total`, or null to
 * stay quiet between lines. */
export function hustleLine(
	n: number,
	total: number,
	pick: number,
): string | null {
	if (n >= total)
		return HUSTLE_DONE_LINES[pick % HUSTLE_DONE_LINES.length] ?? null
	// a line on the first tap, then about every third
	if (n === 1 || n % 3 === 0)
		return (
			HUSTLE_LINES[Math.min(HUSTLE_LINES.length - 1, Math.floor(n / 2))] ?? null
		)
	return null
}
