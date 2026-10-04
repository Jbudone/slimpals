import { describe, expect, it } from "vitest"
import {
	ALL_VISIT_LINES,
	delayIn,
	HAUNT_EVERY,
	PRANKS,
	pickPrank,
	ROUND_EVERY,
	roundRoleOf,
	roundTip,
} from "../../shared/gym3d/visits.js"

describe("ghost pranks and staff rounds", () => {
	it("the belt prank needs a treadmill, the rest do not", () => {
		const off = new Set<string>()
		for (let i = 0; i < 40; i++) off.add(pickPrank(false, [], () => i / 40).id)
		expect(off.has("belt")).toBe(false)
		const on = new Set<string>()
		for (let i = 0; i < 40; i++) on.add(pickPrank(true, [], () => i / 40).id)
		expect(on.has("belt")).toBe(true)
	})

	it("does not repeat the last prank while another fits", () => {
		const recent = PRANKS.filter((p) => !p.treadmill)
			.slice(0, -1)
			.map((p) => p.id)
		const last = PRANKS.filter((p) => !p.treadmill).at(-1)?.id
		for (let i = 0; i < 20; i++)
			expect(pickPrank(false, recent, () => i / 20).id).toBe(last)
	})

	it("delays fall inside their range", () => {
		for (const r of [HAUNT_EVERY, ROUND_EVERY]) {
			expect(delayIn(r, () => 0)).toBe(r[0])
			expect(delayIn(r, () => 0.999)).toBeLessThanOrEqual(r[1])
		}
	})

	it("picks a role from who they are", () => {
		expect(roundRoleOf("specialist_coach", null)).toBe("coach")
		expect(roundRoleOf("specialist_nutritionist", "Nutritionist")).toBe(
			"nutritionist",
		)
		expect(roundRoleOf("manager_alex", null)).toBe("manager")
		expect(roundRoleOf("trainer_marcus", null)).toBe("trainer")
		expect(roundRoleOf(null, null)).toBe("staff")
		expect(roundTip("coach", () => 0)).toBeTruthy()
	})

	it("keeps the tone: short, dry, no exclamation marks, no body talk", () => {
		for (const l of ALL_VISIT_LINES) {
			expect(l.length).toBeLessThanOrEqual(60)
			expect(l).not.toContain("!")
			expect(l).not.toMatch(/\b(fat|weight|skinny|lazy|belly|diet)\b/i)
		}
	})
})
