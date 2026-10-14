// One way for the content pipeline to call a text model: routes by task
// (config), checks the daily budget before the call and writes the cost to the
// ledger after it. Adapters: Gemini and OpenRouter. The app's own live features
// keep using GeminiAIService (also recorded in the ledger, never blocked).
import { GoogleGenerativeAI } from "@google/generative-ai"
import { canSpend, dayOf } from "../../../shared/content/budget.js"
import { costUsd } from "../../../shared/content/pricing.js"
import type { Db } from "../gym/layout3dStore.js"
import {
	getBudget,
	getPriceOverrides,
	getRoutes,
	type ModelRoute,
} from "./config.js"
import { recordSpend, spentOnDay } from "./spend.js"

export type TextRequest = {
	/** A content type or purpose; picks the route and labels the spend. */
	task: string
	prompt: string
	system?: string
	maxOutputTokens?: number
	/** An owner-requested regeneration may use the held-back reserve. */
	reserve?: boolean
	/** Skip the routes: try this model (the admin's test call). */
	route?: ModelRoute
}

export type TextResult = {
	text: string
	provider: ModelRoute["provider"]
	model: string
	usd: number
	tokensIn: number
	tokensOut: number
}

export class BudgetError extends Error {
	constructor(reason: string) {
		super(reason)
		this.name = "BudgetError"
	}
}

type Raw = {
	text: string
	tokensIn: number
	tokensOut: number
	/** Cost the provider reported, when it does. */
	usd?: number
}

export type Adapters = {
	gemini: (route: ModelRoute, req: TextRequest) => Promise<Raw>
	openrouter: (route: ModelRoute, req: TextRequest) => Promise<Raw>
}

export function geminiAdapter(apiKey = process.env.GEMINI_API_KEY ?? "") {
	const client = new GoogleGenerativeAI(apiKey)
	return async (route: ModelRoute, req: TextRequest): Promise<Raw> => {
		const model = client.getGenerativeModel({
			model: route.model,
			systemInstruction: req.system,
			generationConfig: { maxOutputTokens: req.maxOutputTokens },
		})
		const result = await model.generateContent(req.prompt)
		const u = result.response.usageMetadata
		return {
			text: result.response.text(),
			tokensIn: u?.promptTokenCount ?? 0,
			tokensOut: u?.candidatesTokenCount ?? 0,
		}
	}
}

export function openRouterAdapter(
	fetchImpl: typeof fetch = fetch,
	apiKey = process.env.OPENROUTER_API_KEY,
) {
	return async (route: ModelRoute, req: TextRequest): Promise<Raw> => {
		if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set")
		const res = await fetchImpl(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"X-Title": "SlimPals",
				},
				body: JSON.stringify({
					model: route.model,
					max_tokens: req.maxOutputTokens,
					// asks OpenRouter to report the real cost of the call
					usage: { include: true },
					messages: [
						...(req.system ? [{ role: "system", content: req.system }] : []),
						{ role: "user", content: req.prompt },
					],
				}),
			},
		)
		const body = (await res.json().catch(() => ({}))) as {
			choices?: { message?: { content?: string } }[]
			usage?: {
				prompt_tokens?: number
				completion_tokens?: number
				cost?: number
			}
			error?: { message?: string }
		}
		if (!res.ok)
			throw new Error(
				body.error?.message ?? `OpenRouter answered ${res.status}`,
			)
		const text = body.choices?.[0]?.message?.content
		if (typeof text !== "string") throw new Error("OpenRouter sent no text")
		return {
			text,
			tokensIn: body.usage?.prompt_tokens ?? 0,
			tokensOut: body.usage?.completion_tokens ?? 0,
			usd: typeof body.usage?.cost === "number" ? body.usage.cost : undefined,
		}
	}
}

/** A rough upper estimate used only for the budget check before a call. */
export function estimateUsd(
	model: string,
	req: TextRequest,
	overrides = {},
): number {
	const inTokens = Math.ceil(
		((req.system?.length ?? 0) + req.prompt.length) / 3,
	)
	return costUsd(model, inTokens, req.maxOutputTokens ?? 1000, 0, overrides)
}

export function createModelClient(
	db: Db,
	adapters: Adapters = {
		gemini: geminiAdapter(),
		openrouter: openRouterAdapter(),
	},
	clock: () => Date = () => new Date(),
) {
	return {
		async generateText(req: TextRequest): Promise<TextResult> {
			const now = clock()
			const routes = await getRoutes(db)
			const route = req.route ?? routes[req.task] ?? routes.default
			const prices = await getPriceOverrides(db)
			const verdict = canSpend(
				await getBudget(db, now),
				now,
				await spentOnDay(db, dayOf(now)),
				estimateUsd(route.model, req, prices),
				req.reserve,
			)
			if (!verdict.ok) throw new BudgetError(verdict.reason)
			let raw: Raw
			try {
				raw = await adapters[route.provider](route, req)
			} catch (err) {
				await recordSpend(
					db,
					{
						provider: route.provider,
						model: route.model,
						purpose: req.task,
						ok: false,
						note: err instanceof Error ? err.message : String(err),
					},
					now,
				).catch(() => undefined)
				throw err
			}
			const usd = await recordSpend(
				db,
				{
					provider: route.provider,
					model: route.model,
					purpose: req.task,
					tokensIn: raw.tokensIn,
					tokensOut: raw.tokensOut,
					usd: raw.usd,
				},
				now,
			)
			return {
				text: raw.text,
				provider: route.provider,
				model: route.model,
				usd,
				tokensIn: raw.tokensIn,
				tokensOut: raw.tokensOut,
			}
		},
	}
}

export type ModelClient = ReturnType<typeof createModelClient>
