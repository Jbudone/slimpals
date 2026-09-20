import { and, desc, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { contentTuningFeedback } from "../db/schema.js"
import { requireAdmin } from "../middleware/requireAdmin.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService } from "../services/ai/index.js"
import { readTuningDoc, writeTuningDoc } from "../services/contentTuning/fs.js"
import {
	CONTENT_TUNING_TYPES,
	type ContentTuningSubcategory,
	type ContentTuningType,
	getContentTuningType,
	getSubcategory,
} from "../services/contentTuning/registry.js"

export function createContentTuningRouter(aiService: AIService) {
	const router = Router()
	router.use(requireAdmin)

	function resolve(
		typeKey: string,
		subcategoryKey: string,
	): { type: ContentTuningType; subcategory: ContentTuningSubcategory } | null {
		const type = getContentTuningType(typeKey)
		const subcategory = type && getSubcategory(type, subcategoryKey)
		if (!type || !subcategory) return null
		return { type, subcategory }
	}

	router.get("/admin/content-tuning/types", (_req, res) => {
		res.json(
			CONTENT_TUNING_TYPES.map((t) => ({
				key: t.key,
				label: t.label,
				sampleKind: t.sampleKind ?? "text",
				subcategories: t.subcategories.map((s) => ({
					key: s.key,
					label: s.label,
				})),
				contextParamFields: t.contextParamFields,
				feedbackTags: t.feedbackTags,
			})),
		)
	})

	router.get(
		"/admin/content-tuning/:type/:subcategory/tuning-doc",
		(req, res) => {
			const resolved = resolve(req.params.type, req.params.subcategory)
			if (!resolved) {
				res.status(404).json({ error: "unknown content type/subcategory" })
				return
			}
			res.json({ doc: readTuningDoc(resolved.subcategory.tuningDocPath) })
		},
	)

	router.post(
		"/admin/content-tuning/:type/:subcategory/generate",
		async (req, res) => {
			const resolved = resolve(req.params.type, req.params.subcategory)
			if (!resolved) {
				res.status(404).json({ error: "unknown content type/subcategory" })
				return
			}
			const { type, subcategory } = resolved
			const contextParams = (req.body?.contextParams ?? {}) as Record<
				string,
				string
			>
			const tuningDocText = readTuningDoc(subcategory.tuningDocPath)
			const sample = await type.generateSample({
				subcategoryKey: subcategory.key,
				contextParams,
				tuningDocText,
				aiService,
			})
			res.json({ sample })
		},
	)

	router.post(
		"/admin/content-tuning/:type/:subcategory/feedback",
		async (req, res) => {
			const resolved = resolve(req.params.type, req.params.subcategory)
			if (!resolved) {
				res.status(404).json({ error: "unknown content type/subcategory" })
				return
			}
			const { type, subcategory } = resolved
			const { contextParams, sample, tags, note, noteScope } = req.body as {
				contextParams?: Record<string, string>
				sample?: string
				tags?: string[]
				note?: string | null
				noteScope?: "sample" | "global"
			}

			if (!sample || !Array.isArray(tags)) {
				res.status(400).json({ error: "sample and tags are required" })
				return
			}

			const resolvedContextParams = contextParams ?? {}
			const resolvedNoteScope = noteScope === "global" ? "global" : "sample"

			const tuningDocBefore = readTuningDoc(subcategory.tuningDocPath)
			const { updatedDoc, changelog } = await aiService.refineTuningDoc({
				contentTypeLabel: type.label,
				subcategoryLabel: subcategory.label,
				currentDoc: tuningDocBefore,
				sample,
				tags,
				note: note ?? null,
				noteScope: resolvedNoteScope,
			})
			writeTuningDoc(subcategory.tuningDocPath, updatedDoc)

			const newSample = await type.generateSample({
				subcategoryKey: subcategory.key,
				contextParams: resolvedContextParams,
				tuningDocText: updatedDoc,
				aiService,
			})

			const userId = (req as unknown as AuthRequest).user.id
			await db.insert(contentTuningFeedback).values({
				contentType: type.key,
				subcategory: subcategory.key,
				contextParams: resolvedContextParams,
				generatedSample: sample,
				tags,
				note: note ?? null,
				noteScope: resolvedNoteScope,
				tuningDocBefore,
				tuningDocAfter: updatedDoc,
				changelog,
				createdBy: userId,
			})

			res.json({ updatedDoc, changelog, newSample })
		},
	)

	router.get(
		"/admin/content-tuning/:type/:subcategory/history",
		async (req, res) => {
			const resolved = resolve(req.params.type, req.params.subcategory)
			if (!resolved) {
				res.status(404).json({ error: "unknown content type/subcategory" })
				return
			}
			const { type, subcategory } = resolved
			const rows = await db
				.select()
				.from(contentTuningFeedback)
				.where(
					and(
						eq(contentTuningFeedback.contentType, type.key),
						eq(contentTuningFeedback.subcategory, subcategory.key),
					),
				)
				.orderBy(desc(contentTuningFeedback.createdAt))
				.limit(50)
			res.json(rows)
		},
	)

	router.post(
		"/admin/content-tuning/:type/:subcategory/revert/:feedbackId",
		async (req, res) => {
			const resolved = resolve(req.params.type, req.params.subcategory)
			if (!resolved) {
				res.status(404).json({ error: "unknown content type/subcategory" })
				return
			}
			const { subcategory } = resolved
			const feedbackId = Number.parseInt(req.params.feedbackId, 10)
			if (Number.isNaN(feedbackId)) {
				res.status(400).json({ error: "invalid feedback id" })
				return
			}

			const [row] = await db
				.select()
				.from(contentTuningFeedback)
				.where(eq(contentTuningFeedback.id, feedbackId))
			if (!row) {
				res.status(404).json({ error: "feedback entry not found" })
				return
			}

			writeTuningDoc(subcategory.tuningDocPath, row.tuningDocBefore)
			res.json({ doc: row.tuningDocBefore })
		},
	)

	return router
}
