import { describe, expect, it } from "vitest"
import { buildInbox, tabFromQuery } from "../shared/admin/inbox"

const none = {
	candidates: 0,
	bakeoffVotesLeft: null,
	storyDrafts: 0,
	openrouterKey: true,
}

describe("admin inbox", () => {
	it("shows only manual checks when nothing is waiting", () => {
		const t = buildInbox(none)
		expect(t.every((x) => x.kind === "check")).toBe(true)
		expect(t.length).toBeGreaterThan(0)
	})
	it("adds a card per waiting thing, each with steps, a tell line and a link", () => {
		const t = buildInbox({
			candidates: 9,
			bakeoffVotesLeft: 12,
			storyDrafts: 2,
			openrouterKey: false,
		})
		expect(t.filter((x) => x.kind === "waiting").map((x) => x.id)).toEqual([
			"setup-openrouter",
			"review-queue",
			"bakeoff-votes",
			"story-drafts",
		])
		for (const x of t) {
			expect(x.steps.length).toBeGreaterThan(0)
			expect(x.tell.length).toBeGreaterThan(10)
			expect(x.href.startsWith("/")).toBe(true)
		}
		expect(t.find((x) => x.id === "review-queue")?.count).toBe(9)
	})
	it("hides a finished bake-off", () => {
		expect(
			buildInbox({ ...none, bakeoffVotesLeft: 0 }).some(
				(x) => x.id === "bakeoff-votes",
			),
		).toBe(false)
	})
	it("reads a tab from the url and falls back to the to do tab", () => {
		expect(tabFromQuery("content")).toBe("content")
		expect(tabFromQuery("nope")).toBe("todo")
		expect(tabFromQuery(null)).toBe("todo")
	})
})
