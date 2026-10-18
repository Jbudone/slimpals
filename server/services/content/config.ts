// The content pipeline's settings, kept in `content_config` so the admin page
// can change them without a deploy: the daily budget, the report and the
// model routes. Missing rows fall back to the defaults here.
import { eq } from "drizzle-orm"
import {
	type BudgetConfig,
	defaultBudget,
	validateBudget,
} from "../../../shared/content/budget.js"
import type { ModelPrice } from "../../../shared/content/pricing.js"
import { contentConfig } from "../../db/schema.js"
import type { Db } from "../gym/layout3dStore.js"

export type ReportConfig = {
	enabled: boolean
	cadence: "daily" | "weekly"
	/** UTC hour the report goes out (daily: every day, weekly: Mondays). */
	hourUtc: number
	/** Extra addresses. With none, it goes to the admin users' emails. */
	recipients: string[]
	/** The period key last sent (a UTC day), so a report goes out once. */
	lastSentKey: string | null
}

export type ModelRoute = { provider: "gemini" | "openrouter"; model: string }

export type ModelRoutes = Record<string, ModelRoute>

export const DEFAULT_REPORT: ReportConfig = {
	enabled: true,
	cadence: "daily",
	hourUtc: 14,
	recipients: [],
	lastSentKey: null,
}

export const DEFAULT_ROUTES: ModelRoutes = {
	default: { provider: "gemini", model: "gemini-2.5-flash" },
	// the judge is a cheaper model than the generator; point it at another
	// family (an OpenRouter model) in the routes config to avoid self-preference
	judge: { provider: "gemini", model: "gemini-2.5-flash-lite" },
}

async function read<T>(db: Db, key: string): Promise<T | null> {
	const [row] = await db
		.select({ value: contentConfig.value })
		.from(contentConfig)
		.where(eq(contentConfig.key, key))
	return (row?.value as T | undefined) ?? null
}

async function write(db: Db, key: string, value: unknown): Promise<void> {
	await db
		.insert(contentConfig)
		.values({ key, value })
		.onDuplicateKeyUpdate({ set: { value } })
}

/** The budget; the first read stores the default so its start date is fixed
 * (the $5 first week counts from then). */
export async function getBudget(db: Db, now: Date): Promise<BudgetConfig> {
	const stored = await read<unknown>(db, "budget")
	const v = stored === null ? null : validateBudget(stored)
	if (v && typeof v !== "string") return v
	const fresh = defaultBudget(now)
	await write(db, "budget", fresh)
	return fresh
}

export async function setBudget(db: Db, raw: unknown): Promise<BudgetConfig> {
	const v = validateBudget(raw)
	if (typeof v === "string") throw new Error(v)
	await write(db, "budget", v)
	return v
}

export function validateReport(raw: unknown): ReportConfig | string {
	if (!raw || typeof raw !== "object") return "report must be an object"
	const r = raw as Partial<ReportConfig>
	if (typeof r.enabled !== "boolean") return "enabled must be true or false"
	if (r.cadence !== "daily" && r.cadence !== "weekly")
		return "cadence must be daily or weekly"
	if (
		!Number.isInteger(r.hourUtc) ||
		(r.hourUtc as number) < 0 ||
		(r.hourUtc as number) > 23
	)
		return "hourUtc must be 0 to 23"
	const rec = r.recipients ?? []
	if (
		!Array.isArray(rec) ||
		rec.length > 10 ||
		rec.some(
			(e) => typeof e !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
		)
	)
		return "recipients must be up to 10 email addresses"
	return {
		enabled: r.enabled,
		cadence: r.cadence,
		hourUtc: r.hourUtc as number,
		recipients: rec,
		lastSentKey: typeof r.lastSentKey === "string" ? r.lastSentKey : null,
	}
}

export async function getReportConfig(db: Db): Promise<ReportConfig> {
	const stored = await read<unknown>(db, "report")
	const v = stored === null ? null : validateReport(stored)
	return v && typeof v !== "string" ? v : { ...DEFAULT_REPORT }
}

export async function setReportConfig(
	db: Db,
	raw: unknown,
): Promise<ReportConfig> {
	const v = validateReport(raw)
	if (typeof v === "string") throw new Error(v)
	await write(db, "report", v)
	return v
}

export async function getRoutes(db: Db): Promise<ModelRoutes> {
	const stored = await read<ModelRoutes>(db, "routes")
	return { ...DEFAULT_ROUTES, ...(stored ?? {}) }
}

export async function getPriceOverrides(
	db: Db,
): Promise<Record<string, ModelPrice>> {
	return (await read<Record<string, ModelPrice>>(db, "prices")) ?? {}
}

/** Points a task (for example "banter") at a model; the next call uses it. */
export async function setRoute(
	db: Db,
	task: string,
	route: ModelRoute,
): Promise<ModelRoutes> {
	if (
		!/^[a-z_]{2,30}$/.test(task) ||
		(route.provider !== "gemini" && route.provider !== "openrouter") ||
		!route.model
	)
		throw new Error("bad route")
	const stored = (await read<ModelRoutes>(db, "routes")) ?? {}
	await write(db, "routes", { ...stored, [task]: route })
	return getRoutes(db)
}

/** True when the owner pointed this task at a model (the default is not one). */
export async function hasRoute(db: Db, task: string): Promise<boolean> {
	return Boolean((await read<ModelRoutes>(db, "routes"))?.[task])
}
