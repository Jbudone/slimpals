import { describe, expect, it } from "vitest"
import {
	MAXOUT_PROMO_SIGN,
	MAXOUT_SIGN,
	maxoutFromQuery,
	maxoutPromo,
	rivalSign,
} from "../../shared/gym3d/maxout.js"

describe("MaxOut promo", () => {
	it("runs on weekends (UTC) and changes the sign", () => {
		// 2026-10-03 is a Saturday
		const sat = maxoutPromo(new Date("2026-10-03T12:00:00Z"))
		const sun = maxoutPromo(new Date("2026-10-04T23:59:00Z"))
		const mon = maxoutPromo(new Date("2026-10-05T00:00:00Z"))
		expect(sat).toEqual({ on: true, sign: MAXOUT_PROMO_SIGN })
		expect(sun.on).toBe(true)
		expect(mon).toEqual({ on: false, sign: MAXOUT_SIGN })
		expect(maxoutPromo(new Date("2026-10-07T12:00:00Z")).on).toBe(false)
	})

	it("can be forced on or off from the query, otherwise follows the date", () => {
		expect(maxoutFromQuery("1")).toBe(true)
		expect(maxoutFromQuery("0")).toBe(false)
		expect(maxoutFromQuery(null)).toBeNull()
		expect(maxoutFromQuery("yes")).toBeNull()
	})
})

describe("the rival's sign", () => {
	it("shows the promo first, then the Open's result, else the plain name", () => {
		expect(rivalSign("MAXOUT", false, null).label).toBe("MAXOUT")
		expect(rivalSign("MAXOUT", true, null).label).toBe(MAXOUT_PROMO_SIGN)
		expect(rivalSign("FITZONE", true, "win").label).toBe("FITZONE 50% OFF")
		expect(rivalSign("MAXOUT", false, "win").label).toBe("MAXOUT: 2ND")
		expect(rivalSign("MAXOUT", false, "lose").label).toBe("MAXOUT: CHAMPS")
		expect(rivalSign("MAXOUT", false, "lose").label.length).toBeLessThanOrEqual(
			14,
		)
	})
})
