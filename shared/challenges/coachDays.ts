// The coach's line for each day of a joined challenge (#125). An AI writes the
// set when the player joins (in their coach's voice); this keeps only lines
// that follow the coach rules, so a day without a good line falls back to the
// scripted ones. Pure so the rules are unit-tested.

const BODY_TALK = /weight|\bfat\b|lazy|skinny|diet|belly|calorie|scale/i

/** One line per day (index 0 = day 1): the cleaned text or null when the
 * AI gave nothing usable for that day. */
export function cleanCoachLines(raw: unknown, days: number): (string | null)[] {
	const out: (string | null)[] = Array.from({ length: days }, () => null)
	if (!Array.isArray(raw)) return out
	for (let i = 0; i < Math.min(days, raw.length); i++) {
		const v = raw[i]
		if (typeof v !== "string") continue
		const line = v.trim().replace(/\s+/g, " ")
		if (line.length < 8 || line.length > 200) continue
		if (BODY_TALK.test(line)) continue
		out[i] = line
	}
	return out
}
