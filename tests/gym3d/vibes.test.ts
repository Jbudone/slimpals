import { describe, expect, it } from "vitest"
import { FLOOR_TINTS, WALL_COLORS } from "../../shared/gym3d/economy.js"
import { ratingOf } from "../../shared/gym3d/rating.js"
import { FLOOR_STYLES } from "../../shared/gym3d/rooms.js"
import {
	fxOf,
	isVibe,
	moteScale,
	STYLE_FX,
	STYLES,
	spawnMote,
	stepMote,
	styleOf,
	VIBE,
	VIBE_FX,
	VIBES,
	vibePace,
} from "../../shared/gym3d/vibes.js"

describe("room styles", () => {
	it("only use colours and floors the paint endpoint offers", () => {
		expect(new Set(STYLES.map((s) => s.key)).size).toBe(STYLES.length)
		for (const s of STYLES) {
			expect(WALL_COLORS).toContain(s.wall)
			expect(FLOOR_TINTS).toContain(s.floorColor)
			expect(FLOOR_STYLES).toContain(s.floorStyle)
		}
	})

	it("recognises a room painted exactly like a style", () => {
		const zen = STYLES.find((s) => s.key === "zen")
		if (!zen) throw new Error("no zen")
		expect(styleOf(zen)?.key).toBe("zen")
		expect(styleOf({ ...zen, wall: "#f4c9a0" })).toBeNull()
	})
})

describe("room vibes", () => {
	it("know their own names and change the pace of a workout", () => {
		expect(isVibe("hype")).toBe(true)
		expect(isVibe("karaoke")).toBe(false)
		expect(isVibe(null)).toBe(false)
		expect(vibePace(null)).toBe(1)
		expect(vibePace("hype")).toBeGreaterThan(1)
		expect(vibePace("chill")).toBeLessThan(1)
		expect(Object.keys(VIBES).length).toBeGreaterThan(1)
	})

	it("score half a point per room with a vibe, up to a cap", () => {
		const room = (vibe: string | null) => ({
			type: "cardio",
			level: 1,
			building: false,
			cells: [{ px: 1, pz: 1 }],
			vibe,
		})
		const parts = (n: number) =>
			ratingOf({
				rooms: Array.from({ length: n }, () => room("hype")),
				pieces: [],
			}).parts.vibes
		expect(parts(0)).toBe(0)
		expect(parts(2)).toBe(2 * VIBE.scorePoints)
		expect(parts(9)).toBe(VIBE.scoreCap * VIBE.scorePoints)
	})
})

describe("vibe motes", () => {
	const rect = { x: 10, z: 10, w: 8, d: 6 }

	it("every vibe has fx, and a mote starts on the floor of its plot", () => {
		for (const k of Object.keys(VIBES)) {
			expect(VIBE_FX[k]).toBeTruthy()
			const m = spawnMote(k, rect, () => 0.5)
			expect(m).not.toBeNull()
			expect(m?.y).toBeLessThan(0.1)
			expect(Math.abs((m?.x ?? 0) - rect.x)).toBeLessThanOrEqual(rect.w / 2)
		}
		expect(spawnMote("karaoke", rect, () => 0.5)).toBeNull()
	})

	it("rises, sways inside its reach and is spent at the end of its life", () => {
		const m = spawnMote("hype", rect, () => 0.5)
		if (!m) throw new Error("no mote")
		const y0 = m.y
		expect(stepMote(m, 0.5)).toBe(true)
		expect(m.y).toBeGreaterThan(y0)
		expect(Math.abs(m.x - m.x0)).toBeLessThanOrEqual(VIBE_FX.hype.sway)
		expect(stepMote(m, m.life)).toBe(false)
	})

	it("hype rises faster than chill and focus, and a mote fades in and out", () => {
		expect(VIBE_FX.hype.rise).toBeGreaterThan(VIBE_FX.chill.rise)
		expect(VIBE_FX.chill.rise).toBeGreaterThan(VIBE_FX.focus.rise)
		const m = spawnMote("focus", rect, () => 0.5)
		if (!m) throw new Error("no mote")
		expect(moteScale(m)).toBe(0)
		m.age = m.life / 2
		expect(moteScale(m)).toBeCloseTo(m.size, 5)
	})
})

describe("style motes", () => {
	const rect = { x: 10, z: 10, w: 8, d: 6 }

	it("Neon, Zen and Industrial have an effect, keyed by style, Retro none", () => {
		for (const k of ["neon", "zen", "industrial"]) {
			expect(STYLES.some((s) => s.key === k)).toBe(true)
			expect(STYLE_FX[`style-${k}`]).toBeTruthy()
			expect(fxOf(`style-${k}`)).toBe(STYLE_FX[`style-${k}`])
		}
		expect(fxOf("style-retro")).toBeUndefined()
		expect(fxOf("hype")).toBe(VIBE_FX.hype)
	})

	it("Zen petals start high and fall; Neon sparks rise", () => {
		const petal = spawnMote("style-zen", rect, () => 0.5)
		if (!petal) throw new Error("no petal")
		expect(petal.y).toBeGreaterThan(2)
		const y0 = petal.y
		stepMote(petal, 1)
		expect(petal.y).toBeLessThan(y0)
		const spark = spawnMote("style-neon", rect, () => 0.5)
		if (!spark) throw new Error("no spark")
		const s0 = spark.y
		stepMote(spark, 0.5)
		expect(spark.y).toBeGreaterThan(s0)
	})
})
