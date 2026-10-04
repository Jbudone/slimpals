// Currency and coach art from the Layout Lab (inline SVG strings, used with
// {@html} so the HUD, chips and flying rewards share one look).
import type { CoachPersonality } from "../../../shared/types"

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

// One portrait per coach personality (#125), all on the friendly coach's 42x42
// frame so the outfits below sit the same on every one. Pixel-flat shapes only.
const FACE = '<circle cx="21" cy="19" r="9.5" fill="#e8b48e"/>'
const CHEEKS =
	'<circle cx="15" cy="23" r="1.6" fill="#f08a7a" opacity=".5"/><circle cx="27" cy="23" r="1.6" fill="#f08a7a" opacity=".5"/>'
const frame = (body: string) =>
	`<svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="21" fill="#fff1dc"/>${body}</svg>`

const PORTRAITS: Readonly<Record<CoachPersonality, string>> = {
	friendly: COACH_SVG,
	// campaign hat, olive jacket with chevrons, flat stern mouth
	drill_sergeant: frame(
		'<path d="M4 42c1-8.5 8-12.5 17-12.5S37 33.5 38 42z" fill="#6b7a3a"/><path d="M16 30l5 5 5-5" fill="none" stroke="#3f4a1f" stroke-width="2"/><path d="M19 37l2 1.6 2-1.6M19 39.6l2 1.6 2-1.6" fill="none" stroke="#f2c14a" stroke-width="1.3" stroke-linecap="round"/>' +
			FACE +
			'<ellipse cx="21" cy="11.2" rx="14" ry="2.6" fill="#7a5a2a"/><path d="M12.4 11C13 4.8 16.8 2.2 21 2.2S29 4.8 29.6 11z" fill="#8a6a34"/><rect x="12.4" y="8.2" width="17.2" height="2" fill="#4a3516"/><path d="M14.6 18.2l5-1.4M27.4 18.2l-5-1.4" stroke="#2a1c18" stroke-width="1.6" stroke-linecap="round"/><circle cx="17.6" cy="20.4" r="1.2" fill="#2a1c18"/><circle cx="24.4" cy="20.4" r="1.2" fill="#2a1c18"/><path d="M17.6 24.6h6.8" stroke="#7a2e28" stroke-width="1.6" stroke-linecap="round"/>',
	),
	// messy dark hair, orange hoodie with strings, one raised brow and a smirk
	roaster: frame(
		'<path d="M4 42c1-8.5 8-12.5 17-12.5S37 33.5 38 42z" fill="#e8743b"/><path d="M15.4 30.4l1.4 7M26.6 30.4l-1.4 7" stroke="#fff1dc" stroke-width="1.4" stroke-linecap="round"/><path d="M14 30c2 2.6 12 2.6 14 0" fill="none" stroke="#b9531f" stroke-width="2"/>' +
			FACE +
			'<path d="M10.8 18c-.8-7 4-10.6 10.2-10.6S32 11 31.2 18c-1.4-3.6-3-5-5-5.4l-1 2.2-2.2-2.6-2.4 2.4-2.6-2.2-1.2 2.6c-3 .4-5 2.4-6 5z" fill="#1f1a24"/><path d="M14.8 17.6l5.2-.6M22.8 15.4l5 1.2" stroke="#2a1c18" stroke-width="1.6" stroke-linecap="round"/><circle cx="17.6" cy="20.4" r="1.3" fill="#2a1c18"/><path d="M22.8 20.6q1.6-1.4 3.2 0" fill="none" stroke="#2a1c18" stroke-width="1.6" stroke-linecap="round"/><path d="M17.6 24.2q4.6 2.6 7.4-1" fill="none" stroke="#7a2e28" stroke-width="1.5" stroke-linecap="round"/>' +
			CHEEKS,
	),
	// topknot and headband, indigo kimono over white, calm closed eyes
	anime_sensei: frame(
		'<path d="M4 42c1-8.5 8-12.5 17-12.5S37 33.5 38 42z" fill="#3d4a8a"/><path d="M14 30.4l7 8.2 7-8.2" fill="#f6f1e6" stroke="#f6f1e6" stroke-width="1.6" stroke-linejoin="round"/><path d="M17 30l4 4.4 4-4.4" fill="#3d4a8a"/>' +
			FACE +
			'<circle cx="21" cy="5.6" r="3.6" fill="#1f1a24"/><path d="M11 17.4c0-6 4.5-9.6 10-9.6S31 11.4 31 17.4c-3-2.6-7.4-3.4-10-3.4S14 14.8 11 17.4z" fill="#1f1a24"/><rect x="10.6" y="12.4" width="20.8" height="3" rx="1.2" fill="#f6f1e6"/><circle cx="21" cy="13.9" r="1.1" fill="#d4463a"/><path d="M15.8 20.4q1.8 1.6 3.6 0M22.6 20.4q1.8 1.6 3.6 0" fill="none" stroke="#2a1c18" stroke-width="1.5" stroke-linecap="round"/><path d="M19 24.2q2 1.4 4 0" fill="none" stroke="#7a2e28" stroke-width="1.4" stroke-linecap="round"/>' +
			CHEEKS,
	),
	// backwards cap, blue tank, shades and a big grin
	bro: frame(
		'<path d="M8 42c.6-8 5-12.5 13-12.5S33.4 34 34 42z" fill="#3d9df0"/><path d="M14.4 31.4q6.6 4 13.2 0" fill="none" stroke="#e8b48e" stroke-width="3" stroke-linecap="round"/>' +
			FACE +
			'<path d="M11 16.6c0-6.2 4.4-9.2 10-9.2s10 3 10 9.2c-3-2-6.6-2.6-10-2.6s-7 .6-10 2.6z" fill="#2c6bb3"/><path d="M30.6 14.6l6.6 1.2q.8.2.2 1l-6.2 1.2z" fill="#2c6bb3"/><rect x="12.6" y="18" width="16.8" height="4.6" rx="2.2" fill="#1f1a24"/><path d="M14 19.2h5M23 19.2h5" stroke="#3d4a58" stroke-width="1" stroke-linecap="round"/><path d="M16.4 25.2q4.6 3.6 9.2 0z" fill="#fff" stroke="#7a2e28" stroke-width="1.2" stroke-linejoin="round"/>',
	),
}

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
export function coachSvg(
	owned: readonly string[] = [],
	voice: CoachPersonality = "friendly",
): string {
	const base = PORTRAITS[voice] ?? COACH_SVG
	const worn = owned.map((k) => COACH_OUTFITS[k]).filter(Boolean)
	return worn.length ? base.replace("</svg>", `${worn.join("")}</svg>`) : base
}

/** "+3" with the currency icon, for chips. */
export function chipHtml(kind: "xp" | "sw" | "gr" | "co", n: number): string {
	if (kind === "xp") return `+${n} XP`
	const icon = kind === "sw" ? SWEAT_SVG : kind === "gr" ? GREENS_SVG : COIN_SVG
	return `${icon}+${n}`
}
