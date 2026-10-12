// Small flat faces for the cutscene cards (staff room and story), one per named speaker.
// Skin and hair match the 3D cast (`people/cast.ts`); the rest is a few shapes.
// Speakers without a face here keep their initial.

type Face = {
	skin: string
	hair: string
	/** Hair shape drawn behind and over the head. */
	style: "short" | "buns" | "cap" | "long" | "slick" | "none"
	glasses?: boolean
	beard?: boolean
	freckles?: boolean
	/** Collar/shirt colour; the speaker's colour when absent. */
	shirt?: string
}

const FACES: Readonly<Record<string, Face>> = {
	marcus: { skin: "#9a633f", hair: "#2c1f1b", style: "short", beard: true },
	lisa: { skin: "#e8b48e", hair: "#c9573a", style: "buns", freckles: true },
	alex: { skin: "#e8b48e", hair: "#5a3a26", style: "short", glasses: true },
	kim: { skin: "#f6d2b4", hair: "#1f2a44", style: "slick", glasses: true },
	jordan: { skin: "#c98a5e", hair: "#2c1f1b", style: "cap" },
	derek: { skin: "#e8b48e", hair: "#5a3a26", style: "short" },
	victor: { skin: "#e8b48e", hair: "#2b3440", style: "slick" },
	dana: { skin: "#c98a5e", hair: "#2a2a30", style: "slick" },
	barry: { skin: "#f6d2b4", hair: "#b5532f", style: "short", beard: true },
	quill: { skin: "#f6d2b4", hair: "#9a9aa4", style: "slick", glasses: true },
	tess: { skin: "#e8b48e", hair: "#8a4a2a", style: "long", freckles: true },
	reyes: { skin: "#9a633f", hair: "#f2f2f2", style: "cap" },
	joe: { skin: "#e8b48e", hair: "#d8d8d8", style: "none", beard: true },
	rivera: { skin: "#6e4428", hair: "#2c1f1b", style: "none" },
}

export function hasFace(who: string): boolean {
	return who in FACES
}

/** An SVG string (viewBox 0 0 100 100) of the speaker's face, or "" when they
 * have none. `color` tints the shoulders. */
export function faceSvg(who: string, color: string): string {
	const f = FACES[who]
	if (!f) return ""
	const parts: string[] = []
	// shoulders
	parts.push(
		`<path d="M10 100 Q12 74 50 72 Q88 74 90 100Z" fill="${f.shirt ?? color}"/>`,
	)
	// neck
	parts.push(`<rect x="42" y="62" width="16" height="14" fill="${f.skin}"/>`)
	// hair behind
	if (f.style === "buns") {
		parts.push(`<circle cx="26" cy="22" r="10" fill="${f.hair}"/>`)
		parts.push(`<circle cx="74" cy="22" r="10" fill="${f.hair}"/>`)
	}
	if (f.style === "long")
		parts.push(
			`<rect x="22" y="30" width="56" height="46" rx="14" fill="${f.hair}"/>`,
		)
	// head
	parts.push(`<ellipse cx="50" cy="44" rx="23" ry="26" fill="${f.skin}"/>`)
	// hair over
	if (f.style === "short" || f.style === "buns" || f.style === "long")
		parts.push(
			`<path d="M27 40 Q28 14 50 14 Q72 14 73 40 Q62 28 50 28 Q38 28 27 40Z" fill="${f.hair}"/>`,
		)
	if (f.style === "slick")
		parts.push(
			`<path d="M27 38 Q30 14 52 15 Q72 16 73 38 Q60 24 27 38Z" fill="${f.hair}"/>`,
		)
	if (f.style === "cap") {
		parts.push(
			`<path d="M26 38 Q28 12 50 12 Q72 12 74 38Z" fill="${f.hair === "#2c1f1b" ? "#3f7ab5" : f.hair}"/>`,
		)
		parts.push(
			`<rect x="22" y="36" width="56" height="6" rx="3" fill="#2f5f8f"/>`,
		)
	}
	// eyes and mouth
	parts.push(`<circle cx="41" cy="46" r="2.6" fill="#2a1d16"/>`)
	parts.push(`<circle cx="59" cy="46" r="2.6" fill="#2a1d16"/>`)
	parts.push(
		`<path d="M42 58 Q50 64 58 58" stroke="#2a1d16" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
	)
	if (f.beard)
		parts.push(
			`<path d="M30 54 Q50 82 70 54 Q62 66 50 66 Q38 66 30 54Z" fill="${f.hair}"/>`,
		)
	if (f.freckles)
		for (const [x, y] of [
			[38, 53],
			[43, 55],
			[57, 55],
			[62, 53],
		])
			parts.push(`<circle cx="${x}" cy="${y}" r="1" fill="#b87850"/>`)
	if (f.glasses) {
		parts.push(
			`<circle cx="41" cy="46" r="7" fill="none" stroke="#2a2a30" stroke-width="2"/>`,
		)
		parts.push(
			`<circle cx="59" cy="46" r="7" fill="none" stroke="#2a2a30" stroke-width="2"/>`,
		)
		parts.push(`<path d="M48 46 H52" stroke="#2a2a30" stroke-width="2"/>`)
	}
	return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join("")}</svg>`
}
