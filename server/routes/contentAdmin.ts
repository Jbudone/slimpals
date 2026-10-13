// Admin API for the content pipeline (docs/content_pipeline.md): the daily
// budget, what has been spent, the report settings, and a test call to check
// that a provider key works.
import { Router } from "express"
import {
	dailyCapUsd,
	dayNumber,
	dayOf,
	pipelineCapUsd,
} from "../../shared/content/budget.js"
import { db } from "../db/index.js"
import { requireAdmin } from "../middleware/requireAdmin.js"
import {
	getBudget,
	getReportConfig,
	getRoutes,
	setBudget,
	setReportConfig,
} from "../services/content/config.js"
import {
	type Adapters,
	BudgetError,
	createModelClient,
} from "../services/content/modelClient.js"
import { sendReport } from "../services/content/report.js"
import { spendSummary, spentOnDay } from "../services/content/spend.js"
import type { sendEmail } from "../services/email/resend.js"

export type ContentAdminDeps = {
	adapters?: Adapters
	send?: typeof sendEmail
	clock?: () => Date
}

export function createContentAdminRouter(deps: ContentAdminDeps = {}) {
	const router = Router()
	const clock = deps.clock ?? (() => new Date())

	router.get("/admin/content/overview", requireAdmin, async (req, res) => {
		const now = clock()
		const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90)
		const budget = await getBudget(db, now)
		res.json({
			now: now.toISOString(),
			budget,
			dayNumber: dayNumber(budget, now),
			capToday: dailyCapUsd(budget, now),
			pipelineCapToday: pipelineCapUsd(budget, now),
			spentToday: await spentOnDay(db, dayOf(now)),
			summary: await spendSummary(db, days, now),
			report: await getReportConfig(db),
			routes: await getRoutes(db),
			keys: {
				gemini: Boolean(process.env.GEMINI_API_KEY),
				openrouter: Boolean(process.env.OPENROUTER_API_KEY),
				resend: Boolean(process.env.RESEND_API_KEY),
			},
		})
	})

	router.put("/admin/content/budget", requireAdmin, async (req, res) => {
		try {
			res.json(await setBudget(db, req.body))
		} catch (err) {
			res.status(400).json({ error: (err as Error).message })
		}
	})

	router.put("/admin/content/report", requireAdmin, async (req, res) => {
		try {
			const current = await getReportConfig(db)
			res.json(await setReportConfig(db, { ...current, ...req.body }))
		} catch (err) {
			res.status(400).json({ error: (err as Error).message })
		}
	})

	router.post("/admin/content/report/send", requireAdmin, async (_req, res) => {
		res.json(await sendReport(db, clock(), deps.send))
	})

	// A tiny call to prove a provider key and model work (counts against the
	// budget like any call). Body: { provider, model }.
	router.post("/admin/content/test-call", requireAdmin, async (req, res) => {
		const { provider, model } = req.body ?? {}
		if (
			(provider !== "gemini" && provider !== "openrouter") ||
			typeof model !== "string" ||
			!model
		) {
			res.status(400).json({ error: "provider and model are required" })
			return
		}
		try {
			const client = createModelClient(db, deps.adapters, clock)
			const out = await client.generateText({
				task: "admin_test",
				prompt: "Reply with the single word: ready",
				maxOutputTokens: 20,
				reserve: true,
				route: { provider, model },
			})
			res.json({ ok: true, ...out })
		} catch (err) {
			res
				.status(err instanceof BudgetError ? 429 : 502)
				.json({ ok: false, error: (err as Error).message })
		}
	})

	return router
}
