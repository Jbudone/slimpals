// MaxOut, the rival gym across the road (#131): it runs a promo on weekends.
// The sign across the road changes and the regulars grumble about it. Pure:
// the client asks `maxoutPromo(date)` (UTC) or forces it for tests with
// `?maxout=1` / `?maxout=0`.

export type MaxoutPromo = { on: boolean; sign: string }

/** What MaxOut's billboard says normally and during the promo. */
export const MAXOUT_SIGN = "MAXOUT"
export const MAXOUT_PROMO_SIGN = "MAXOUT 50% OFF"

/** Saturday and Sunday (UTC) are promo days. */
export function maxoutPromo(date: Date): MaxoutPromo {
	const d = date.getUTCDay()
	const on = d === 0 || d === 6
	return { on, sign: on ? MAXOUT_PROMO_SIGN : MAXOUT_SIGN }
}

/** `?maxout=1` forces the promo on, `?maxout=0` off, anything else: by date. */
export function maxoutFromQuery(v: string | null): boolean | null {
	if (v === "1") return true
	if (v === "0") return false
	return null
}
