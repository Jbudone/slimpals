import { describe, expect, it } from "vitest"
import {
	ALL_POKE_LINES,
	POKE_GAP_MS,
	type PokeWho,
	pokeResult,
} from "../../shared/gym3d/pokes.js"

describe("poking people", () => {
	it("a treadmill runner stumbles on the third poke when the roll is low, always by the sixth", () => {
		expect(pokeResult("treadmill", 1, 0, 0).effect).toBe("hop")
		expect(pokeResult("treadmill", 2, 0, 0).effect).toBe("hop")
		expect(pokeResult("treadmill", 3, 0.1, 0).effect).toBe("trip")
		expect(pokeResult("treadmill", 3, 0.9, 0).effect).toBe("hop")
		const sure = pokeResult("treadmill", 6, 0.99, 0)
		expect(sure.effect).toBe("trip")
		expect(sure.reset).toBe(true)
		expect(sure.line).toBeTruthy()
	})

	it("other gear is slower to stumble, and the hustle lines speak before that", () => {
		expect(pokeResult("worker", 3, 0, 0).effect).toBe("hop")
		expect(pokeResult("worker", 3, 0, 0).line).toBeNull()
		expect(pokeResult("worker", 5, 0.1, 0).effect).toBe("trip")
		expect(pokeResult("worker", 6, 0.99, 0).effect).toBe("trip")
	})

	it("anyone else greets, plays along, gets annoyed and goes dizzy", () => {
		const who: PokeWho[] = ["member", "staff"]
		for (const w of who) {
			expect(pokeResult(w, 1, 0, 0).line).toBeTruthy()
			expect(pokeResult(w, 2, 0, 0).line).toBeTruthy()
			expect(pokeResult(w, 4, 0.5, 0).line).toBeTruthy()
			const dizzy = pokeResult(w, 6, 0.5, 0)
			expect(dizzy.effect).toBe("spin")
			expect(dizzy.reset).toBe(true)
		}
	})

	it("the ghost haunts instead", () => {
		expect(pokeResult("ghost", 1, 0.9, 0).line).toBeTruthy()
		expect(pokeResult("ghost", 5, 0, 0).effect).toBe("spin")
	})

	it("keeps the tone: short, dry, no body talk", () => {
		expect(POKE_GAP_MS).toBeGreaterThan(500)
		for (const l of ALL_POKE_LINES) {
			expect(l.length).toBeLessThanOrEqual(60)
			expect(l).not.toMatch(/\b(fat|weight|skinny|lazy|belly|diet)\b/i)
		}
	})
})
