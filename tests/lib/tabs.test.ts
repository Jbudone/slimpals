import { describe, expect, it } from "vitest"
import { swipeDirection } from "../../src/lib/swipe"
import { neighbourPath, TABS, tabIndexOf } from "../../src/lib/tabs"

describe("tabs and swipes", () => {
	it("Compete holds challenges and tournaments, Social the feed and badges", () => {
		expect(tabIndexOf("/challenges")).toBe(tabIndexOf("/tournaments"))
		expect(TABS[tabIndexOf("/challenges")].id).toBe("compete")
		expect(tabIndexOf("/social")).toBe(tabIndexOf("/badges"))
		expect(TABS[tabIndexOf("/badges")].id).toBe("social")
		expect(tabIndexOf("/settings")).toBe(-1)
	})

	it("a swipe walks the tabs in order and stops at the ends", () => {
		expect(neighbourPath("/today", 1)).toBe("/challenges")
		expect(neighbourPath("/tournaments", 1)).toBe("/weight")
		expect(neighbourPath("/tournaments", -1)).toBe("/today")
		expect(neighbourPath("/today", -1)).toBe("/")
		expect(neighbourPath("/social", 1)).toBeNull()
		expect(neighbourPath("/", -1)).toBeNull()
		expect(neighbourPath("/settings", 1)).toBeNull()
	})

	it("only a quick, mostly sideways, long enough drag is a swipe", () => {
		expect(swipeDirection(-120, 10, 200)).toBe(-1)
		expect(swipeDirection(120, -10, 200)).toBe(1)
		expect(swipeDirection(-30, 0, 100)).toBeNull()
		expect(swipeDirection(-120, 80, 200)).toBeNull()
		expect(swipeDirection(-120, 10, 1500)).toBeNull()
	})
})
