import { describe, expect, it } from "vitest"
import { NPC_CATALOG } from "../../server/db/seed.js"
import {
	CAST,
	castHomes,
	outfitFor,
} from "../../src/components/gym3d/people/cast.js"
import {
	ACC_SETS,
	HAIRSTYLES,
	STAFF_UNIFORM,
	TEES,
} from "../../src/components/gym3d/people/outfits.js"

const STAFF_ROLES = new Set([
	"trainer",
	"receptionist",
	"specialist",
	"manager",
])

describe("3D gym cast (named NPC looks)", () => {
	it("has a look for every seeded NPC key", () => {
		const missing = NPC_CATALOG.map((n) => n.key).filter((k) => !CAST[k])
		expect(missing).toEqual([])
	})

	it("has no looks for NPCs the seed does not have", () => {
		const keys = new Set(NPC_CATALOG.map((n) => n.key))
		expect(Object.keys(CAST).filter((k) => !keys.has(k))).toEqual([])
	})

	it("dresses every staff role in the staff uniform, and only them", () => {
		for (const n of NPC_CATALOG) {
			const c = CAST[n.key]
			const isStaff = STAFF_ROLES.has(n.role)
			expect(c.staff, n.key).toBe(isStaff)
			if (isStaff) {
				expect(c.look.top, n.key).toBe(STAFF_UNIFORM.top)
				expect(c.look.bottom, n.key).toBe(STAFF_UNIFORM.bottom)
			} else expect(c.look.top, n.key).not.toBe(STAFF_UNIFORM.top)
		}
	})

	it("gives everyone a distinct look", () => {
		const sig = (k: string) => {
			const o = CAST[k].look
			return JSON.stringify([o.skin, o.hair, o.style, o.top, o.build, o.tee])
		}
		const seen = new Map<string, string>()
		for (const k of Object.keys(CAST)) {
			const s = sig(k)
			expect(seen.get(s), `${k} looks like ${seen.get(s)}`).toBeUndefined()
			seen.set(s, k)
		}
	})

	it("gives Lisa her fresh look (not the random pool)", () => {
		const lisa = CAST.receptionist_lisa.look
		expect(lisa.style).toBe("buns")
		expect(lisa.freckles).toBe(true)
		expect(lisa.acc).toContain("headset")
		expect(HAIRSTYLES).not.toContain("buns")
	})

	it("keeps the named-only prints and extras out of the random pool", () => {
		for (const t of ["staff", "titan", "sparks"] as const)
			expect(TEES).not.toContain(t)
		const pooled = ACC_SETS.flat()
		for (const a of ["headset", "whistle", "lanyard", "earrings"] as const)
			expect(pooled).not.toContain(a)
	})

	it("has a name, signature lines and a title for everyone", () => {
		for (const [k, c] of Object.entries(CAST)) {
			expect(c.name.length, k).toBeGreaterThan(0)
			expect(c.title.length, k).toBeGreaterThan(0)
			expect(c.lines.length, k).toBeGreaterThanOrEqual(3)
			for (const l of c.lines) expect(l.length, k).toBeLessThanOrEqual(90)
		}
	})

	it("outfitFor returns a copy, and a seeded look for unknown keys", () => {
		const a = outfitFor("trainer_marcus")
		a.top = "#000000"
		expect(CAST.trainer_marcus.look.top).toBe(STAFF_UNIFORM.top)
		expect(outfitFor("npc_from_the_future")).toEqual(
			outfitFor("npc_from_the_future"),
		)
	})

	it("sends heroes to the spotlight stage and the manager to the office", () => {
		const h = castHomes()
		expect(h.hero_bodybuilder_rex).toEqual({
			key: "hero_spotlight_stage",
			always: true,
		})
		expect(h.hero_influencer_maya.key).toBe("hero_spotlight_stage")
		expect(h.manager_alex).toEqual({
			key: "staff_manager_office",
			always: true,
		})
	})
})
