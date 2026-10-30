import { describe, expect, it } from "vitest"
import { levelOfXp, xpOfLevel } from "../../shared/gym3d/levels"
import { respaceUnlocks, UNLOCK_RUNGS } from "../../shared/gym3d/unlockLadder"

describe("level curve", () => {
	it("is its own inverse at every boundary", () => {
		for (let l = 0; l <= 80; l++) {
			expect(levelOfXp(xpOfLevel(l))).toBe(l)
			if (l > 0) expect(levelOfXp(xpOfLevel(l) - 1)).toBe(l - 1)
		}
		expect(levelOfXp(-5)).toBe(0)
	})
	it("never needs less xp for the next level", () => {
		for (let l = 1; l < 80; l++)
			expect(xpOfLevel(l + 1)).toBeGreaterThan(xpOfLevel(l))
	})
})

describe("unlock ladder", () => {
	it("keeps order, spreads ties and leaves starters free", () => {
		const up = [
			{ k: "a", requiredXp: 200 },
			{ k: "s", requiredXp: 0 },
			{ k: "b", requiredXp: 100 },
		]
		const cl = [{ k: "c", requiredXp: 100 }]
		const [u, c] = respaceUnlocks(up, cl)
		expect(u.find((x) => x.k === "s")?.requiredXp).toBe(0)
		expect(u.find((x) => x.k === "b")?.requiredXp).toBe(UNLOCK_RUNGS[0])
		expect(c[0]?.requiredXp).toBe(UNLOCK_RUNGS[1])
		expect(u.find((x) => x.k === "a")?.requiredXp).toBe(UNLOCK_RUNGS[2])
	})
	it("rungs rise", () => {
		for (let i = 1; i < UNLOCK_RUNGS.length; i++)
			expect(UNLOCK_RUNGS[i]!).toBeGreaterThan(UNLOCK_RUNGS[i - 1]!)
	})
})
