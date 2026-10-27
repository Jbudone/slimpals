// Admin API for the content pipeline (docs/content_pipeline.md): the daily
// budget, what has been spent, the report settings, and a test call to check
// that a provider key works.
import { Router } from "express"
import {
	BAKEOFF_DEFAULT_MODELS,
	BAKEOFF_ENOUGH,
	parseModelLabel,
} from "../../shared/content/bakeoff.js"
import {
	dailyCapUsd,
	dayNumber,
	dayOf,
	pipelineCapUsd,
} from "../../shared/content/budget.js"
import { db } from "../db/index.js"
import { requireAdmin } from "../middleware/requireAdmin.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import {
	BakeoffError,
	bakeoffRunning,
	bakeoffState,
	castVote,
	latestRound,
	nextPair,
	runBakeoff,
} from "../services/content/bakeoff.js"
import {
	clearRoute,
	getAutoPublish,
	getBudget,
	getReportConfig,
	getRoutes,
	setAutoPublish,
	setBudget,
	setReportConfig,
	setRoute,
} from "../services/content/config.js"
import { contentStats, pullUnreviewed } from "../services/content/items.js"
import {
	type Adapters,
	BudgetError,
	createModelClient,
} from "../services/content/modelClient.js"
import { sendReport } from "../services/content/report.js"
import {
	nextForReview,
	ReviewError,
	reviewStats,
	submitReview,
} from "../services/content/reviews.js"
import { spendSummary, spentOnDay } from "../services/content/spend.js"
import {
	approveDraft,
	chapterRef,
	draftArc,
	draftOutlines,
	draftScene,
	listDrafts,
	rejectDraft,
	StoryCouncilError,
} from "../services/content/storyCouncil.js"
import type { sendEmail } from "../services/email/resend.js"

/** The roles whose model the owner can choose. */
export const ROOM_ROLES = [
	"writer",
	"writer2",
	"critic",
	"judge",
	"coach",
	"showrunner",
	"reader",
	"advocate",
	"default",
]

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
			content: await contentStats(db, now),
			reviews: await reviewStats(db, new Date(now.getTime() - 86_400_000)),
			report: await getReportConfig(db),
			routes: await getRoutes(db),
			autoPublish: await getAutoPublish(db),
			keys: {
				gemini: Boolean(process.env.GEMINI_API_KEY),
				openrouter: Boolean(process.env.OPENROUTER_API_KEY),
				resend: Boolean(process.env.RESEND_API_KEY),
			},
		})
	})

	// The phone review queue: the next items worth the owner's attention.
	router.get("/admin/content/review/next", requireAdmin, async (req, res) => {
		const skip = String(req.query.skip ?? "")
			.split(",")
			.map(Number)
			.filter((n) => Number.isInteger(n) && n > 0)
			.slice(0, 200)
		const out = await nextForReview(db, 3, skip)
		const since = new Date(clock().getTime() - 86_400_000)
		res.json({ ...out, stats: await reviewStats(db, since) })
	})

	router.post("/admin/content/review", requireAdmin, async (req, res) => {
		try {
			const userId = (req as AuthRequest).user.id
			res.json(await submitReview(db, userId, req.body ?? {}))
		} catch (err) {
			if (err instanceof ReviewError) {
				res.status(err.status).json({ error: err.message })
				return
			}
			throw err
		}
	})

	// The blind bake-off: start a round (runs in the background), vote on
	// unnamed pairs, read the standings, point banter at the winner.
	router.get("/admin/content/bakeoff", requireAdmin, async (_req, res) => {
		res.json({
			...(await bakeoffState(db, await latestRound(db))),
			defaults: BAKEOFF_DEFAULT_MODELS,
		})
	})

	router.post(
		"/admin/content/bakeoff/start",
		requireAdmin,
		async (req, res) => {
			if (bakeoffRunning()) {
				res.status(409).json({ error: "A round is already running" })
				return
			}
			const raw: unknown[] = Array.isArray(req.body?.models)
				? req.body.models
				: BAKEOFF_DEFAULT_MODELS.map((m) => `${m.provider}:${m.model}`)
			const models = raw
				.map((m) => (typeof m === "string" ? parseModelLabel(m) : null))
				.filter((m): m is NonNullable<typeof m> => m !== null)
				.slice(0, 8)
			if (models.length < 2) {
				res.status(400).json({
					error:
						"Give at least two models as provider:model (gemini or openrouter)",
				})
				return
			}
			const client = createModelClient(db, deps.adapters, clock)
			const round = `b${clock().getTime().toString(36)}`
			const done = runBakeoff(db, client, models, round).catch((err) =>
				console.error("[bakeoff] failed:", err),
			)
			if (req.body?.wait) await done
			res.status(202).json({ round })
		},
	)

	router.get("/admin/content/bakeoff/next", requireAdmin, async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const round = await latestRound(db)
		const state = await bakeoffState(db, round)
		const enough = state.votes >= BAKEOFF_ENOUGH
		const pair = round && !enough ? await nextPair(db, userId, round) : null
		res.json({ pair, enough, ...state })
	})

	router.post("/admin/content/bakeoff/vote", requireAdmin, async (req, res) => {
		try {
			await castVote(db, (req as AuthRequest).user.id, req.body ?? {})
			res.json({ ok: true })
		} catch (err) {
			if (err instanceof BakeoffError) {
				res.status(err.status).json({ error: err.message })
				return
			}
			throw err
		}
	})

	router.post(
		"/admin/content/bakeoff/apply",
		requireAdmin,
		async (req, res) => {
			const route =
				typeof req.body?.model === "string"
					? parseModelLabel(req.body.model)
					: null
			if (!route) {
				res.status(400).json({ error: "model must be provider:model" })
				return
			}
			res.json({ routes: await setRoute(db, "banter", route) })
		},
	)

	// Whether a content type plays as soon as it is written (off: the owner's
	// good in the review queue publishes it).
	router.put("/admin/content/autopublish", requireAdmin, async (req, res) => {
		const { type, on } = req.body ?? {}
		if (typeof type !== "string" || typeof on !== "boolean") {
			res.status(400).json({ error: "type and on are required" })
			return
		}
		try {
			res.json({ autoPublish: await setAutoPublish(db, type, on) })
		} catch (err) {
			res.status(400).json({ error: (err as Error).message })
		}
	})

	// Takes the AI banter and coach lines that nobody reviewed out of play.
	router.post(
		"/admin/content/pull-unreviewed",
		requireAdmin,
		async (_req, res) => {
			res.json({ pulled: await pullUnreviewed(db, ["banter", "coach"]) })
		},
	)

	// The model behind each role of the writers' room ("" puts it back on the default).
	router.put("/admin/content/routes", requireAdmin, async (req, res) => {
		const { task, model } = req.body ?? {}
		if (typeof task !== "string" || !ROOM_ROLES.includes(task)) {
			res
				.status(400)
				.json({ error: `task must be one of ${ROOM_ROLES.join(", ")}` })
			return
		}
		try {
			if (model === "" || model === null) {
				res.json({ routes: await clearRoute(db, task) })
				return
			}
			const route = typeof model === "string" ? parseModelLabel(model) : null
			if (!route) {
				res.status(400).json({ error: "model must be provider:model" })
				return
			}
			res.json({ routes: await setRoute(db, task, route) })
		} catch (err) {
			res.status(400).json({ error: (err as Error).message })
		}
	})

	// The story council (docs/story_council.md): arc, then outlines, then a
	// scene, each from the approved level above. Slow, so it runs in the
	// background and the owner reads the drafts when they appear.
	const storyRunning = new Set<string>()
	const campaignOf = (v: unknown): number | null => {
		const n = Number(v)
		return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null
	}

	router.get(
		"/admin/content/story/:campaign",
		requireAdmin,
		async (req, res) => {
			const campaign = campaignOf(req.params.campaign)
			if (campaign === null) {
				res.status(400).json({ error: "bad campaign" })
				return
			}
			res.json({
				drafts: await listDrafts(db, campaign),
				running: [...storyRunning].filter((k) => k.startsWith(`${campaign}:`)),
			})
		},
	)

	router.post(
		"/admin/content/story/:campaign/:stage",
		requireAdmin,
		async (req, res) => {
			const campaign = campaignOf(req.params.campaign)
			const stage = String(req.params.stage ?? "")
			if (campaign === null || !["arc", "outlines", "scene"].includes(stage)) {
				res
					.status(400)
					.json({ error: "campaign and stage (arc, outlines, scene) required" })
				return
			}
			if (stage === "scene" && !Number.isInteger(Number(req.body?.chapter))) {
				res.status(400).json({ error: "chapter is required" })
				return
			}
			const ref =
				stage === "scene"
					? chapterRef(campaign, Number(req.body?.chapter))
					: (stage as string)
			const key = `${campaign}:${ref}`
			if (storyRunning.has(key)) {
				res.status(409).json({ error: "That is already being written" })
				return
			}
			const ownerNotes =
				typeof req.body?.notes === "string"
					? req.body.notes.slice(0, 500)
					: undefined
			const client = createModelClient(db, deps.adapters, clock)
			const run = async () => {
				if (stage === "arc")
					await draftArc(db, client, campaign, {
						chapters: Number(req.body?.chapters) || undefined,
						ownerNotes,
					})
				else if (stage === "outlines")
					await draftOutlines(db, client, campaign, { ownerNotes })
				else await draftScene(db, client, campaign, ref, { ownerNotes })
			}
			storyRunning.add(key)
			const done = run()
				.catch((err) =>
					console.error(
						`[story] ${key} failed:`,
						err instanceof Error ? err.message : err,
					),
				)
				.finally(() => storyRunning.delete(key))
			if (req.body?.wait) await done
			res.status(202).json({ started: key })
		},
	)

	router.post(
		"/admin/content/story/drafts/:id/:verdict",
		requireAdmin,
		async (req, res) => {
			const id = Number(req.params.id)
			try {
				if (!Number.isInteger(id)) throw new StoryCouncilError(400, "bad id")
				if (req.params.verdict === "approve")
					res.json({ draft: await approveDraft(db, id) })
				else if (req.params.verdict === "reject")
					res.json({
						draft: await rejectDraft(
							db,
							id,
							typeof req.body?.notes === "string" ? req.body.notes : "",
						),
					})
				else throw new StoryCouncilError(400, "approve or reject")
			} catch (err) {
				if (err instanceof StoryCouncilError) {
					res.status(err.status).json({ error: err.message })
					return
				}
				throw err
			}
		},
	)

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
