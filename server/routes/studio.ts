// The Studio (docs/studio): the owner's board of writing pieces. Admin only.
import { and, desc, eq } from "drizzle-orm"
import { Router } from "express"
import {
	isKind,
	isStatus,
	parseScript,
	type ScriptLine,
} from "../../shared/studio/pieces.js"
import { db } from "../db/index.js"
import { studioPieces, studioPieceVersions } from "../db/schema.js"
import { requireAdmin } from "../middleware/requireAdmin.js"

const str = (v: unknown, max: number): string | null =>
	typeof v === "string" ? v.trim().slice(0, max) : null

export function createStudioRouter() {
	const router = Router()
	router.use("/admin/studio", requireAdmin)

	router.get("/admin/studio/pieces", async (_req, res) => {
		const rows = await db
			.select()
			.from(studioPieces)
			.orderBy(desc(studioPieces.updatedAt))
		res.json({
			pieces: rows.map((r) => ({
				...r,
				lines: undefined,
				lineCount: (r.lines as ScriptLine[]).length,
			})),
		})
	})

	router.post("/admin/studio/pieces", async (req, res) => {
		const title = str(req.body?.title, 120)
		if (!title) return res.status(400).json({ error: "A title is needed" })
		const kind = isKind(req.body?.kind) ? req.body.kind : "other"
		const status = isStatus(req.body?.status) ? req.body.status : "idea"
		const [r] = await db.insert(studioPieces).values({
			title,
			kind,
			status,
			premise: str(req.body?.premise, 600) ?? "",
			lines: [],
		})
		res.status(201).json({ id: r.insertId })
	})

	router.get("/admin/studio/pieces/:id", async (req, res) => {
		const id = Number(req.params.id)
		const [piece] = await db
			.select()
			.from(studioPieces)
			.where(eq(studioPieces.id, id))
		if (!piece) return res.status(404).json({ error: "Not found" })
		const versions = await db
			.select()
			.from(studioPieceVersions)
			.where(eq(studioPieceVersions.pieceId, id))
			.orderBy(desc(studioPieceVersions.version))
		res.json({ piece, versions })
	})

	// Edit fields; a script in `script` (or `restore` of an old version) saves a new version.
	router.patch("/admin/studio/pieces/:id", async (req, res) => {
		const id = Number(req.params.id)
		const [piece] = await db
			.select()
			.from(studioPieces)
			.where(eq(studioPieces.id, id))
		if (!piece) return res.status(404).json({ error: "Not found" })
		const b = req.body ?? {}
		const set: Partial<typeof studioPieces.$inferInsert> = {}
		const title = str(b.title, 120)
		if (title) set.title = title
		if (isKind(b.kind)) set.kind = b.kind
		if (isStatus(b.status)) set.status = b.status
		if (typeof b.premise === "string") set.premise = b.premise.slice(0, 600)
		if (typeof b.notes === "string") set.notes = b.notes.slice(0, 2000)
		if (
			b.slot === null ||
			(typeof b.slot === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.slot))
		)
			set.slot = b.slot

		let lines: ScriptLine[] | null = null
		let note: string | null = str(b.versionNote, 200)
		if (typeof b.script === "string") lines = parseScript(b.script)
		else if (Number.isInteger(b.restore)) {
			const [v] = await db
				.select()
				.from(studioPieceVersions)
				.where(
					and(
						eq(studioPieceVersions.pieceId, id),
						eq(studioPieceVersions.version, b.restore),
					),
				)
			if (!v) return res.status(404).json({ error: "No such version" })
			lines = v.lines as ScriptLine[]
			note = note ?? `Restored version ${b.restore}`
		}
		let version = piece.version
		if (lines && JSON.stringify(lines) !== JSON.stringify(piece.lines)) {
			version = piece.version + 1
			set.lines = lines
			set.version = version
			await db
				.insert(studioPieceVersions)
				.values({ pieceId: id, version, lines, note })
		}
		set.updatedAt = new Date()
		await db.update(studioPieces).set(set).where(eq(studioPieces.id, id))
		res.json({ ok: true, version })
	})

	router.delete("/admin/studio/pieces/:id", async (req, res) => {
		const id = Number(req.params.id)
		await db
			.delete(studioPieceVersions)
			.where(eq(studioPieceVersions.pieceId, id))
		await db.delete(studioPieces).where(eq(studioPieces.id, id))
		res.json({ ok: true })
	})

	return router
}
