// Currency and coach art from the Layout Lab (inline SVG strings, used with
// {@html} so the HUD, chips and flying rewards share one look).

export const COIN_SVG =
	'<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#f2c14a" stroke="#b8862a" stroke-width="2"/><circle cx="10" cy="10" r="4.6" fill="none" stroke="#b8862a" stroke-width="1.6"/></svg>'

export const SWEAT_SVG =
	'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8C7.4 5.6 4.4 8.9 4.4 12.4a5.6 5.6 0 0 0 11.2 0c0-3.5-3-6.8-5.6-10.6z" fill="#3d9df0" stroke="#bfe1ff" stroke-width="1.2"/><path d="M7.4 12.6a2.6 2.6 0 0 0 2.2 2.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/></svg>'

export const GREENS_SVG =
	'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.8 3.2C9.6 2.6 3.6 5.8 3.6 12c0 1.6.5 3 1.3 4.1C6 10.8 9.4 8 13 6.6 9.8 8.6 7.4 11.6 6.4 17.2 13.6 18 17.6 11.6 16.8 3.2z" fill="#62b83f" stroke="#d9f5c8" stroke-width="1.1" stroke-linejoin="round"/></svg>'

export const FLAME_SVG =
	'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10.3 1.5c.6 3-1.6 4.5-2.8 6.3-.8-1-1-2-.9-3C4.7 6.6 3.6 9 3.6 11.6A6.4 6.4 0 0 0 10 18a6.4 6.4 0 0 0 6.4-6.4c0-4.4-3-7.6-6.1-10.1z" fill="#ff8a3d"/><path d="M10 18a3.3 3.3 0 0 1-3.3-3.3c0-2.1 1.8-3.3 2.6-5 1.8 1.5 4 3 4 5A3.3 3.3 0 0 1 10 18z" fill="#ffd35a"/></svg>'

export const TICK_SVG =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

export const COACH_SVG =
	'<svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="21" fill="#fff1dc"/><path d="M4 42c1-8.5 8-12.5 17-12.5S37 33.5 38 42z" fill="#34c973"/><path d="M17 30l4 4 4-4" fill="none" stroke="#1f9a55" stroke-width="2"/><circle cx="21" cy="19" r="9.5" fill="#e8b48e"/><path d="M11 17c0-6 4.5-9.5 10-9.5S31 11 31 17c-3-2.8-7.5-3.8-10-3.8S14 14.2 11 17z" fill="#1f3a2a"/><path d="M10.5 14.5c2-3.5 6-5.4 10.5-5.4s8.5 1.9 10.5 5.4l3 .8c.6.2.6 1 0 1.1l-3.6.3c-2.6-2-6.2-2.9-9.9-2.9s-7.3.9-9.9 2.9z" fill="#34c973"/><circle cx="17.6" cy="20" r="1.3" fill="#2a1c18"/><circle cx="24.4" cy="20" r="1.3" fill="#2a1c18"/><path d="M18 23.6q3 2.6 6 0" fill="none" stroke="#7a2e28" stroke-width="1.5" stroke-linecap="round"/><circle cx="15" cy="23" r="1.6" fill="#f08a7a" opacity=".5"/><circle cx="27" cy="23" r="1.6" fill="#f08a7a" opacity=".5"/></svg>'

/** Outfit pieces drawn on the coach, by cosmetic key (shared/gym3d/cosmetics.ts):
 * a witch or holiday hat sits on top of the head, a scarf at the neck. */
const COACH_OUTFITS: Readonly<Record<string, string>> = {
	gratitude_scarf:
		'<path d="M13 31.5q8 3.6 16 0l.6 3q-8.6 3.8-17.2 0z" fill="#d9822b"/><rect x="26" y="31.5" width="3.6" height="8" rx="1" fill="#c26a1e"/><path d="M13.6 33.4h15.2" stroke="#f2c14a" stroke-width="1" fill="none"/>',
	winter_hat:
		'<path d="M11.5 11.5Q13 3.5 22 1.4Q27.5 2 30.5 11.5z" fill="#d4463a"/><rect x="10.4" y="9.6" width="21.2" height="3.4" rx="1.7" fill="#f6f1e6"/><circle cx="22.4" cy="1.6" r="2.2" fill="#f6f1e6"/>',
	halloween_hat:
		'<ellipse cx="21" cy="9.4" rx="12.5" ry="2.6" fill="#3b2a55"/><path d="M14.5 9.2Q19 4.5 22.6 0.6Q23.4 5.4 27.6 9.2z" fill="#4b3470"/><rect x="15.6" y="6.6" width="10.6" height="1.8" rx=".6" fill="#f2a03a"/>',
}

/** The coach with the outfits the gym owns (worn automatically). */
export function coachSvg(owned: readonly string[] = []): string {
	const worn = owned.map((k) => COACH_OUTFITS[k]).filter(Boolean)
	return worn.length
		? COACH_SVG.replace("</svg>", `${worn.join("")}</svg>`)
		: COACH_SVG
}

/** "+3" with the currency icon, for chips. */
export function chipHtml(kind: "xp" | "sw" | "gr" | "co", n: number): string {
	if (kind === "xp") return `+${n} XP`
	const icon = kind === "sw" ? SWEAT_SVG : kind === "gr" ? GREENS_SVG : COIN_SVG
	return `${icon}+${n}`
}
