import { describe, expect, it } from "vitest"
import { CLAIM_NOTES, noteTimes, playClaimChime } from "../../src/lib/chime"

describe("claim chime", () => {
	it("rises note by note and starts them in order", () => {
		expect([...CLAIM_NOTES]).toEqual([...CLAIM_NOTES].sort((a, b) => a - b))
		const t = noteTimes(CLAIM_NOTES.length)
		expect(t[0]).toBe(0)
		expect(t).toEqual([...t].sort((a, b) => a - b))
	})

	it("is silent and safe where there is no audio (server, tests)", () => {
		expect(() => playClaimChime()).not.toThrow()
	})
})
