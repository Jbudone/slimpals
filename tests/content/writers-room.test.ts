import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { contentItems } from "../../server/db/schema.js"
import { setRoute } from "../../server/services/content/config.js"
import {
	type Adapters,
	createModelClient,
} from "../../server/services/content/modelClient.js"
import { generateBanterPool } from "../../server/services/gym/banterPool.js"
import {
	DEVICES,
	parseCritiques,
	parsePlans,
	pickDevices,
	shortlist,
} from "../../shared/content/comedy.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

describe("comedy structure (pure)", () => {
	it("has distinct devices and picks different ones", () => {
		expect(new Set(DEVICES.map((d) => d.key)).size).toBe(DEVICES.length)
		const picked = pickDevices(6, () => 0.3)
		expect(new Set(picked.map((d) => d.key)).size).toBe(6)
	})

	it("parses plans and drops malformed ones", () => {
		const plans = parsePlans(
			'noise [{"device":"literal","setup":"a","expected":"b","turn":"c","lines":["One line.","Two line."]},{"device":"x"},{"device":"y","setup":"a","expected":"b","turn":"c","lines":["only one"]}] tail',
		)
		expect(plans).toHaveLength(1)
		expect(plans[0]?.device).toBe("literal")
		expect(parsePlans("not json")).toEqual([])
	})

	it("shortlists by the critic: unscored and stingy ones go, funniest first", () => {
		const mk = (n: number) => ({
			device: "d",
			setup: "s",
			expected: "e",
			turn: "t",
			lines: [`L${n}a`, `L${n}b`],
		})
		const critiques = parseCritiques(
			'[{"index":0,"turn_works":true,"generic":false,"funny":2,"fix":""},{"index":1,"turn_works":true,"generic":false,"funny":4,"fix":"cut the last line"},{"index":2,"turn_works":false,"generic":true,"funny":1,"fix":"x"}]',
		)
		const out = shortlist([mk(0), mk(1), mk(2), mk(3)], critiques)
		expect(out.map((o) => o.plan.lines[0])).toEqual(["L1a", "L0a"])
	})
})

let n = 0
const plan = (device: string) => ({
	device,
	setup: `Setup ${++n} unique thing`,
	expected: `Expected ${n}`,
	turn: `Turn ${n}`,
	lines: [`Alpha${n} first line here`, `Bravo${n} second line there`],
})
function room(
	seen: { task: string }[],
	opts: { failWriter2?: boolean } = {},
): Adapters {
	return {
		gemini: async (_r, req) => {
			seen.push({ task: req.task })
			if (req.task === "writer" || req.task === "writer2") {
				if (req.task === "writer2" && opts.failWriter2) throw new Error("boom")
				if (req.prompt.startsWith("Revise"))
					return {
						text: JSON.stringify([{ ...plan("literal"), index: 0 }]),
						tokensIn: 10,
						tokensOut: 10,
					}
				const keys = [...req.prompt.matchAll(/^- (\S+) \(/gm)].map((m) => m[1])
				return {
					text: JSON.stringify(keys.map((k) => plan(k as string))),
					tokensIn: 10,
					tokensOut: 10,
				}
			}
			if (req.task === "critic") {
				const count = [...req.prompt.matchAll(/^#\d+ /gm)].length
				const crit = Array.from({ length: count }, (_, i) => ({
					index: i,
					turn_works: i % 2 === 0,
					generic: i % 2 === 1,
					funny: i === 0 ? 4 : i % 2 === 0 ? 3 : 1,
					fix: i === 0 ? "make the last line flatter" : "",
				}))
				return { text: JSON.stringify(crit), tokensIn: 10, tokensOut: 10 }
			}
			return { text: "", tokensIn: 0, tokensOut: 0 }
		},
		openrouter: async (_r, req) => {
			seen.push({ task: `or:${req.task}` })
			return room(seen, opts).gemini(_r, req)
		},
	}
}

describe("writers' room (db)", () => {
	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("drafts on devices, has the critic cut and the writer revise, and keeps the notes", async () => {
		const db = await getTestDb()
		const seen: { task: string }[] = []
		const run = await generateBanterPool(
			db,
			{} as never,
			new Date(),
			createModelClient(db, room(seen)),
		)
		expect(run.added).toBeGreaterThan(0)
		const tasks = new Set(seen.map((s) => s.task))
		expect(tasks.has("writer")).toBe(true)
		expect(tasks.has("critic")).toBe(true)
		expect(tasks.has("writer2")).toBe(false)
		const rows = await db.select().from(contentItems)
		const withRoom = rows.filter(
			(r) => (r.payload as { room?: unknown }).room !== undefined,
		)
		expect(withRoom.length).toBeGreaterThan(0)
		const meta = (
			withRoom[0]?.payload as { room: { device: string; funny: number } }
		).room
		expect(meta.device).toBeTruthy()
		expect(meta.funny).toBeGreaterThanOrEqual(2)
	})

	it("uses a second writer when one is routed, and survives it failing", async () => {
		const db = await getTestDb()
		await setRoute(db, "writer2", {
			provider: "openrouter",
			model: "other/model",
		})
		const seen: { task: string }[] = []
		const run = await generateBanterPool(
			db,
			{} as never,
			new Date(),
			createModelClient(db, room(seen, { failWriter2: true })),
		)
		expect(seen.some((s) => s.task.includes("writer2"))).toBe(true)
		expect(run.added).toBeGreaterThan(0)
	})
})
