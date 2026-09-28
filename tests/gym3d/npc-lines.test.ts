import { describe, expect, it } from "vitest"
import {
	classFormation,
	classPose,
	classRoomType,
	getRelationshipStage,
	getStageLabel,
	moodInfo,
	moodSpeed,
} from "../../shared/gym3d/npcInfo.js"
import {
	extractBubbleLines,
	firstName,
	MAX_LINE,
	pairLines,
	pickLine,
	relationOf,
} from "../../shared/gym3d/npcLines.js"

/** Deterministic rng from a list of values (cycles). */
const seq =
	(...v: number[]) =>
	() => {
		const x = v.shift() ?? 0
		v.push(x)
		return x
	}

describe("extractBubbleLines", () => {
	it("drops stage directions and keeps short sentences", () => {
		const out = extractBubbleLines([
			"*leans in with a grin* You've earned this. Your squat depth is actually solid now — let's add 20% to your working weight and focus on tempo. Go!",
		])
		expect(out[0]).toBe("You've earned this.")
		expect(out.every((l) => !l.includes("*"))).toBe(true)
		expect(out.every((l) => l.length >= 8 && l.length <= MAX_LINE)).toBe(true)
	})

	it("limits lines per response and in all, and removes duplicates", () => {
		const r = "First line here. Second line here. Third line here."
		expect(extractBubbleLines([r], 2)).toHaveLength(2)
		// a repeated response adds only lines not said yet
		const twice = extractBubbleLines([r, r], 2)
		expect(new Set(twice).size).toBe(twice.length)
		expect(twice).toHaveLength(3)
		expect(
			extractBubbleLines([r, r.replace(/line/g, "row")], 3, 4),
		).toHaveLength(4)
	})

	it("ignores junk", () => {
		expect(
			extractBubbleLines(["", "ok.", 42 as unknown as string, "x".repeat(200)]),
		).toEqual([])
	})
})

describe("pickLine", () => {
	it("returns null with nothing to say", () => {
		expect(pickLine({}, [], Math.random)).toBeNull()
	})

	it("picks pools by weight: server, then own, then role", () => {
		const pools = { server: ["S"], own: ["O"], role: ["R"] }
		expect(pickLine(pools, [], seq(0.1, 0))).toBe("S")
		expect(pickLine(pools, [], seq(0.6, 0))).toBe("O")
		expect(pickLine(pools, [], seq(0.95, 0))).toBe("R")
	})

	it("falls back to the pools that exist", () => {
		expect(pickLine({ role: ["R"] }, [], seq(0.1, 0))).toBe("R")
	})

	it("avoids recent lines while it can", () => {
		const own = ["a", "b", "c"]
		for (let i = 0; i < 20; i++)
			expect(pickLine({ own }, ["a", "b"], Math.random)).toBe("c")
		expect(own).toContain(pickLine({ own }, own, Math.random))
	})
})

describe("pairs", () => {
	it("reads friends and rivals from either side", () => {
		const a = { friends: ["b"], rivals: [] }
		expect(relationOf(a, undefined, "a", "b")).toBe("friend")
		expect(relationOf(undefined, { rivals: ["a"] }, "a", "b")).toBe("rival")
		expect(relationOf({}, {}, "a", "b")).toBe("neutral")
		// a rivalry wins over a friendship
		expect(relationOf(a, { rivals: ["a"] }, "a", "b")).toBe("rival")
	})

	it("fills the other person's first name", () => {
		const l = pairLines("friend", 'Rex "The Titan" Ramirez', seq(0, 0))
		expect(l.open).toBe("Hey Rex!")
		expect(l.reply.length).toBeGreaterThan(0)
		expect(firstName("Dr. Kim")).toBe("Dr. Kim")
		expect(firstName("Coach Rivera")).toBe("Coach Rivera")
	})
})

describe("npc info", () => {
	it("maps mood to the sim's bands", () => {
		expect(moodInfo(80).word).toBe("Energized")
		expect(moodInfo(50).word).toBe("Happy")
		expect(moodInfo(25).word).toBe("Okay")
		expect(moodInfo(5).word).toBe("Tired")
		expect(moodInfo(-30).word).toBe("Grumpy")
		expect(moodSpeed(80)).toBe(1.2)
		expect(moodSpeed(10)).toBe(0.85)
		expect(moodSpeed(50)).toBe(1)
	})

	it("labels relationship stages like the dialog system", () => {
		expect(getStageLabel(getRelationshipStage(0))).toBe("Stranger")
		expect(getStageLabel(getRelationshipStage(30))).toBe("Acquaintance")
		expect(getStageLabel(getRelationshipStage(60))).toBe("Gym Buddy")
		expect(getStageLabel(getRelationshipStage(90))).toBe("Friend")
	})

	it("puts classes in the right room with a fitting pose", () => {
		expect(classRoomType("boxing")).toBe("boxing")
		expect(classRoomType("swimming")).toBe("pool")
		expect(classRoomType("lagree")).toBe("cardio")
		expect(classRoomType("decor")).toBeNull()
		expect(classPose("boxing")).toBe("punch")
		expect(classPose("pool")).toBe("stretch")
	})
})

describe("classFormation", () => {
	const room = { x0: 0, z0: 0, x1: 9, z1: 6 }

	it("fits an instructor and four members on open floor", () => {
		const f = classFormation(() => true, room, 4)
		expect(f?.members).toHaveLength(4)
		for (const m of f?.members ?? []) {
			expect(m.x).toBeGreaterThan(0)
			expect(m.x).toBeLessThan(9)
			expect(m.z).toBeGreaterThan(f?.instructor.z ?? 0)
		}
	})

	it("steers around blocked floor", () => {
		// the middle of the room is taken by a ring
		const walk = (x: number, z: number) => !(x > 2.5 && x < 6.5 && z < 4)
		const f = classFormation(walk, room, 4)
		expect(f).not.toBeNull()
		for (const p of [f?.instructor, ...(f?.members ?? [])])
			expect(walk(p?.x ?? 0, p?.z ?? 0)).toBe(true)
	})

	it("gives up when fewer than two members fit", () => {
		expect(classFormation(() => false, room)).toBeNull()
		expect(
			classFormation((x, z) => Math.abs(x - 4.5) < 0.1 && z < 3, room),
		).toBeNull()
	})
})
