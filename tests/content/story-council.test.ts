import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	type Adapters,
	createModelClient,
} from "../../server/services/content/modelClient.js"
import {
	approveDraft,
	chapterRef,
	draftArc,
	draftOutlines,
	draftScene,
	latest,
	listDrafts,
	rejectDraft,
	StoryCouncilError,
} from "../../server/services/content/storyCouncil.js"
import {
	validateArc,
	validateScene,
} from "../../shared/content/storyCouncil.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const arc = (title: string) => ({
	title,
	premise: "A small gym and a street that is changing under it.",
	stakes: "If the gym stops mattering, so does the street it holds together.",
	threads: ["the lease", "the notebook"],
	chapters: Array.from({ length: 7 }, (_, i) => ({
		level: i + 1,
		title: `Chapter ${i + 1}`,
		logline: `Something happens at level ${i + 1}.`,
		turn: `Something changes ${i + 1}.`,
	})),
})
const outline = (i: number) => ({
	title: `Outline ${i}`,
	place: "The lobby",
	object: "a laminated sign",
	goal: "Lisa wants the sign up straight.",
	conflict: "Marcus keeps nudging it.",
	turn: "He admits why.",
	emotion: "tender",
	wants: [
		{ who: "lisa", want: "order" },
		{ who: "marcus", want: "to be forgiven" },
	],
	ending: "Lisa straightens it anyway.",
})
const scene = (extra = "") => ({
	title: "The sign",
	recap: "Lisa and Marcus argue about a sign.",
	lines: [
		{ who: "narrator", text: "The laminated sign hangs a degree off level." },
		{ who: "lisa", text: `It's crooked.${extra}` },
		{ who: "marcus", text: "It's characterful." },
	],
})

let calls: string[] = []
const adapters: Adapters = {
	gemini: async (_r, req) => {
		calls.push(req.task)
		const p = req.prompt
		let text = ""
		if (req.task === "showrunner" && p.includes("Propose THREE"))
			text = JSON.stringify([arc("A"), arc("B"), arc("C")])
		else if (req.task === "reader")
			text = JSON.stringify({ best: 1, fix: "Sharpen chapter three." })
		else if (req.task === "showrunner" && p.startsWith("Revise this arc"))
			text = JSON.stringify(arc("B revised"))
		else if (req.task === "showrunner")
			text = JSON.stringify(Array.from({ length: 7 }, (_, i) => outline(i + 1)))
		else if (req.task === "advocate")
			text = JSON.stringify([{ index: 0, ok: false, fix: "Give Lisa a want." }])
		else if (req.task === "writer" && p.startsWith("Revise this scene"))
			text = JSON.stringify(scene(" Revised."))
		else if (req.task === "writer") text = JSON.stringify(scene())
		else if (req.task === "critic")
			text = JSON.stringify({ score: 3, fix: "Cut the quip." })
		return { text, tokensIn: 10, tokensOut: 10 }
	},
	openrouter: async () => ({ text: "", tokensIn: 0, tokensOut: 0 }),
}

describe("story validators", () => {
	it("accepts a usable arc and rejects thin or backwards ones", () => {
		expect(validateArc(arc("A"))).not.toBeNull()
		expect(
			validateArc({ ...arc("A"), chapters: arc("A").chapters.slice(0, 3) }),
		).toBeNull()
		const back = arc("A")
		;(back.chapters[3] as { level: number }).level = 1
		expect(validateArc(back)).toBeNull()
	})

	it("holds a scene to the house rules", () => {
		expect(validateScene(scene(), "c1-1")).not.toBeNull()
		expect(validateScene(scene(" Go!"), "c1-1")).toBeNull()
		expect(
			validateScene(
				{
					...scene(),
					lines: [{ who: "lisa", text: "x".repeat(101) }, ...scene().lines],
				},
				"c1-1",
			),
		).toBeNull()
		expect(
			validateScene(
				{
					...scene(),
					lines: scene().lines.map((l) => ({ ...l, who: "lisa" })),
				},
				"c1-1",
			),
		).toBeNull()
		expect(
			validateScene(
				{
					...scene(),
					lines: [
						...scene().lines.slice(0, 2),
						{ who: "marcus", text: "Mind your weight." },
					],
				},
				"c1-1",
			),
		).toBeNull()
	})
})

describe("story council (db)", () => {
	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
		calls = []
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("goes arc, outlines, scene, each gated on the approval above", async () => {
		const db = await getTestDb()
		const client = createModelClient(db, adapters)
		await expect(draftOutlines(db, client, 13)).rejects.toThrow(
			"Approve the arc first",
		)

		const a = await draftArc(db, client, 13)
		expect((a.body as { title: string }).title).toBe("B revised")
		expect(calls).toEqual(["showrunner", "reader", "showrunner"])
		await approveDraft(db, a.id)

		await expect(draftScene(db, client, 13, chapterRef(13, 1))).rejects.toThrow(
			"Approve the outline first",
		)
		const outlines = await draftOutlines(db, client, 13)
		expect(outlines).toHaveLength(7)
		expect(calls).toContain("advocate")
		await approveDraft(db, outlines[0]?.id as number)

		const s = await draftScene(db, client, 13, chapterRef(13, 1))
		const body = s.body as { lines: { text: string }[] }
		// the critic asked for a fix, so the revised scene is what is kept
		expect(body.lines[1]?.text).toContain("Revised.")
		expect((s.trace as { criticScore: number }).criticScore).toBe(3)
		expect(s.status).toBe("draft")
	})

	it("keeps the owner's note, supersedes a redraft, and lets only a draft be decided", async () => {
		const db = await getTestDb()
		const client = createModelClient(db, adapters)
		const first = await draftArc(db, client, 14)
		await rejectDraft(db, first.id, "Make Victor warmer")
		expect((await latest(db, 14, "arc", "14"))?.status).toBe("rejected")
		const second = await draftArc(db, client, 14, {
			ownerNotes: "Make Victor warmer",
		})
		const third = await draftArc(db, client, 14)
		const all = await listDrafts(db, 14)
		expect(all.find((d) => d.id === second.id)?.status).toBe("superseded")
		expect(all.find((d) => d.id === third.id)?.status).toBe("draft")
		await approveDraft(db, third.id)
		await expect(approveDraft(db, third.id)).rejects.toBeInstanceOf(
			StoryCouncilError,
		)
	})
})
