// The look's palette for the celebrations (level-up confetti): the colours and
// one glyph come from CSS custom properties that styles/app.css sets for each
// event look (`--sk-conf`, `--sk-glyph`), so a pumpkin night rains orange and
// pumpkins and a retro challenge rains pixels, with the green default when no
// look is on.

export const DEFAULT_CONFETTI = [
	"#34c973",
	"#f2c14a",
	"#ff8a3d",
	"#3d9df0",
	"#62b83f",
	"#fff",
]

/** A custom property's value as a list: quotes dropped, commas split. */
export function parseSkinList(value: string): string[] {
	return value
		.trim()
		.replace(/^["']|["']$/g, "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
}

/** A custom property's value as one plain string (quotes dropped). */
export function parseSkinText(value: string): string {
	return value.trim().replace(/^["']|["']$/g, "")
}

export type Skin = { colors: string[]; glyph: string }

/** The current look's confetti colours and glyph (the default when none). */
export function currentSkin(): Skin {
	if (typeof document === "undefined")
		return { colors: DEFAULT_CONFETTI, glyph: "" }
	const cs = getComputedStyle(document.documentElement)
	const colors = parseSkinList(cs.getPropertyValue("--sk-conf"))
	return {
		colors: colors.length ? colors : DEFAULT_CONFETTI,
		glyph: parseSkinText(cs.getPropertyValue("--sk-glyph")),
	}
}
