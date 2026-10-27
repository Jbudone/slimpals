// The story council's stages (docs/story_council.md): arc, then outlines, then
// scenes, each from the approved output of the one above, each with roles on
// their own model routes (showrunner, reader, advocate, writer, critic). Drafts
// are kept in `story_drafts`; nothing reaches players from here.
import { and, desc, eq } from "drizzle-orm"
import { DEVICES } from "../../../shared/content/comedy.js"
import {
	type Arc,
	advocatePrompt,
	arcPrompt,
	arcRevisePrompt,
	type Outline,
	outlinePrompt,
	parseAdvocate,
	parseArcs,
	parseOutlines,
	parseReaderVerdict,
	parseScene,
	parseSceneVerdict,
	readerPrompt,
	type Scene,
	sceneCriticPrompt,
	scenePrompt,
	sceneRevisePrompt,
	validateArc,
} from "../../../shared/content/storyCouncil.js"
import { storyDrafts } from "../../db/schema.js"
import { readTuningDoc } from "../contentTuning/fs.js"
import type { Db } from "../gym/layout3dStore.js"
import type { ModelClient } from "./modelClient.js"
import { collectSpend } from "./spend.js"

export const STORY_ROLES = [
	"showrunner",
	"reader",
	"advocate",
	"writer",
	"critic",
] as const

export type Level = "arc" | "outline" | "scene"
export type DraftRow = typeof storyDrafts.$inferSelect

export class StoryCouncilError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message)
	}
}

const doc = (path: string): string => {
	try {
		return readTuningDoc(path)
	} catch {
		return ""
	}
}
const craft = () => doc("server/services/contentTuning/docs/story_craft.md")
const bible = () => doc("docs/story_bible.md")

const call = (
	client: ModelClient,
	task: (typeof STORY_ROLES)[number],
	prompt: string,
	maxOutputTokens = 4000,
) =>
	client.generateText({
		task,
		prompt,
		maxOutputTokens,
		reserve: true,
	})

async function save(
	db: Db,
	d: {
		campaign: number
		level: Level
		ref: string
		body: unknown
		trace: unknown
		costMicros: number
		notes?: string | null
	},
): Promise<DraftRow> {
	// an unapproved draft of the same thing is replaced, the record is kept
	await db
		.update(storyDrafts)
		.set({ status: "superseded" })
		.where(
			and(
				eq(storyDrafts.campaign, d.campaign),
				eq(storyDrafts.level, d.level),
				eq(storyDrafts.ref, d.ref),
				eq(storyDrafts.status, "draft"),
			),
		)
	const [res] = await db.insert(storyDrafts).values({
		campaign: d.campaign,
		level: d.level,
		ref: d.ref,
		body: d.body,
		trace: d.trace,
		costMicros: d.costMicros,
		notes: d.notes ?? null,
	})
	const [row] = await db
		.select()
		.from(storyDrafts)
		.where(eq(storyDrafts.id, Number((res as { insertId: number }).insertId)))
	return row as DraftRow
}

export async function latest(
	db: Db,
	campaign: number,
	level: Level,
	ref: string,
	status?: string,
): Promise<DraftRow | null> {
	const [row] = await db
		.select()
		.from(storyDrafts)
		.where(
			and(
				eq(storyDrafts.campaign, campaign),
				eq(storyDrafts.level, level),
				eq(storyDrafts.ref, ref),
				...(status ? [eq(storyDrafts.status, status)] : []),
			),
		)
		.orderBy(desc(storyDrafts.id))
		.limit(1)
	return row ?? null
}

export async function listDrafts(
	db: Db,
	campaign: number,
): Promise<DraftRow[]> {
	return db
		.select()
		.from(storyDrafts)
		.where(eq(storyDrafts.campaign, campaign))
		.orderBy(desc(storyDrafts.id))
}

export const chapterRef = (campaign: number, n: number) => `c${campaign}-${n}`

/** Level 1: three options, a cold read, a revision. */
export async function draftArc(
	db: Db,
	client: ModelClient,
	campaign: number,
	opts: { chapters?: number; ownerNotes?: string } = {},
): Promise<DraftRow> {
	const chapters = opts.chapters ?? 9
	const { result, usd } = await collectSpend(async () => {
		const first = await call(
			client,
			"showrunner",
			arcPrompt(bible(), campaign, chapters, opts.ownerNotes),
		)
		const options = parseArcs(first.text)
		if (options.length === 0)
			throw new StoryCouncilError(502, "The showrunner gave no usable arc")
		const verdict = parseReaderVerdict(
			(await call(client, "reader", readerPrompt(options))).text,
		)
		const chosenIndex = verdict && options[verdict.best] ? verdict.best : 0
		let arc: Arc = options[chosenIndex] as Arc
		if (verdict?.fix) {
			const rev = await call(
				client,
				"showrunner",
				arcRevisePrompt(arc, verdict.fix),
			)
			const m = rev.text.match(/\{[\s\S]*\}/)
			try {
				const revised = m ? validateArc(JSON.parse(m[0])) : null
				if (revised) arc = revised
			} catch {
				// keep the chosen option
			}
		}
		return {
			arc,
			options: options.length,
			chosenIndex,
			fix: verdict?.fix ?? "",
		}
	})
	return save(db, {
		campaign,
		level: "arc",
		ref: String(campaign),
		body: result.arc,
		trace: {
			options: result.options,
			chosen: result.chosenIndex,
			readerFix: result.fix,
		},
		costMicros: Math.round(usd * 1_000_000),
		notes: opts.ownerNotes ?? null,
	})
}

async function approvedArc(db: Db, campaign: number): Promise<Arc> {
	const row = await latest(db, campaign, "arc", String(campaign), "approved")
	if (!row) throw new StoryCouncilError(409, "Approve the arc first")
	return row.body as Arc
}

/** Level 2: an outline for every chapter of the approved arc. */
export async function draftOutlines(
	db: Db,
	client: ModelClient,
	campaign: number,
	opts: { ownerNotes?: string } = {},
): Promise<DraftRow[]> {
	const arc = await approvedArc(db, campaign)
	const ids = arc.chapters.map((c) => chapterRef(campaign, c.n))
	const { result, usd } = await collectSpend(async () => {
		let outlines = parseOutlines(
			(
				await call(
					client,
					"showrunner",
					outlinePrompt(craft(), arc, opts.ownerNotes),
				)
			).text,
			ids,
		)
		if (outlines.length === 0)
			throw new StoryCouncilError(502, "The showrunner gave no usable outlines")
		const notes = parseAdvocate(
			(await call(client, "advocate", advocatePrompt(outlines))).text,
		).filter((n) => !n.ok && n.fix)
		if (notes.length) {
			const fixes = notes
				.map((n) => `${outlines[n.index]?.title ?? n.index}: ${n.fix}`)
				.join(" | ")
			const again = parseOutlines(
				(
					await call(
						client,
						"showrunner",
						outlinePrompt(
							craft(),
							arc,
							`${opts.ownerNotes ? `${opts.ownerNotes} ` : ""}The character advocate asks: ${fixes}`,
						),
					)
				).text,
				ids,
			)
			if (again.length >= outlines.length) outlines = again
		}
		return { outlines, fixes: notes.length }
	})
	const each = Math.round((usd * 1_000_000) / result.outlines.length)
	const rows: DraftRow[] = []
	for (const o of result.outlines)
		rows.push(
			await save(db, {
				campaign,
				level: "outline",
				ref: o.id,
				body: o,
				trace: { advocateFixes: result.fixes },
				costMicros: each,
				notes: opts.ownerNotes ?? null,
			}),
		)
	return rows
}

/** Level 3: one chapter's dialogue from its approved outline. */
export async function draftScene(
	db: Db,
	client: ModelClient,
	campaign: number,
	ref: string,
	opts: { ownerNotes?: string } = {},
): Promise<DraftRow> {
	const arc = await approvedArc(db, campaign)
	const outlineRow = await latest(db, campaign, "outline", ref, "approved")
	if (!outlineRow) throw new StoryCouncilError(409, "Approve the outline first")
	const outline = outlineRow.body as Outline
	const chapter = arc.chapters.find((c) => chapterRef(campaign, c.n) === ref)
	if (!chapter) throw new StoryCouncilError(404, "No such chapter")
	const devices = DEVICES.map((d) => `- ${d.name}: ${d.how}`).join("\n")
	const { result, usd } = await collectSpend(async () => {
		const first = await call(
			client,
			"writer",
			scenePrompt(craft(), arc, outline, chapter, devices, opts.ownerNotes),
		)
		let scene: Scene | null = parseScene(first.text, ref)
		if (!scene)
			throw new StoryCouncilError(502, "The writer gave no usable scene")
		const verdict = parseSceneVerdict(
			(await call(client, "critic", sceneCriticPrompt(scene, outline))).text,
		)
		if (verdict && verdict.score <= 4 && verdict.fix) {
			const rev = parseScene(
				(await call(client, "writer", sceneRevisePrompt(scene, verdict.fix)))
					.text,
				ref,
			)
			if (rev) scene = rev
		}
		return { scene, verdict }
	})
	return save(db, {
		campaign,
		level: "scene",
		ref,
		body: result.scene,
		trace: {
			criticScore: result.verdict?.score ?? null,
			criticFix: result.verdict?.fix ?? "",
		},
		costMicros: Math.round(usd * 1_000_000),
		notes: opts.ownerNotes ?? null,
	})
}

export async function approveDraft(db: Db, id: number): Promise<DraftRow> {
	const [row] = await db
		.select()
		.from(storyDrafts)
		.where(eq(storyDrafts.id, id))
	if (!row) throw new StoryCouncilError(404, "No such draft")
	if (row.status !== "draft")
		throw new StoryCouncilError(409, `That draft is ${row.status}`)
	// approving replaces an earlier approval of the same thing
	await db
		.update(storyDrafts)
		.set({ status: "superseded" })
		.where(
			and(
				eq(storyDrafts.campaign, row.campaign),
				eq(storyDrafts.level, row.level),
				eq(storyDrafts.ref, row.ref),
				eq(storyDrafts.status, "approved"),
			),
		)
	await db
		.update(storyDrafts)
		.set({ status: "approved" })
		.where(eq(storyDrafts.id, id))
	return { ...row, status: "approved" }
}

export async function rejectDraft(
	db: Db,
	id: number,
	notes: string,
): Promise<DraftRow> {
	const [row] = await db
		.select()
		.from(storyDrafts)
		.where(eq(storyDrafts.id, id))
	if (!row) throw new StoryCouncilError(404, "No such draft")
	if (row.status !== "draft")
		throw new StoryCouncilError(409, `That draft is ${row.status}`)
	await db
		.update(storyDrafts)
		.set({ status: "rejected", notes: notes.slice(0, 500) })
		.where(eq(storyDrafts.id, id))
	return { ...row, status: "rejected", notes }
}
