import { and, desc, eq } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import { scheduledJobRuns } from "../../db/schema.js"
import type { RunRow, RunStatus } from "./schedule.js"

type Db = MySql2Database<typeof schema>

export type RunTrigger = "schedule" | "manual"

export type RunRecord = RunRow & {
	job: string
	period: string
	trigger: RunTrigger
	finishedAt: Date | null
	result: unknown
	error: string | null
}

export type RunOutcome =
	| { status: "ok"; result: unknown }
	| { status: "failed"; error: string }

/** Where the scheduler keeps its per-period claims (scheduled_job_runs in
 * production; an in-memory map in unit tests). */
export interface RunStore {
	get(job: string, period: string): Promise<RunRow | null>
	/**
	 * Claims the (job, period) run. `expected` is the row the caller decided
	 * on (null = none): the claim only succeeds if the row is still exactly
	 * that, so two ticks, two instances or a tick and an admin "Run now"
	 * cannot both win. Returns the claimed attempt number, or null if lost.
	 */
	claim(
		job: string,
		period: string,
		expected: RunRow | null,
		now: Date,
		trigger: RunTrigger,
	): Promise<number | null>
	/** Records how attempt `attempt` ended (ignored if it was re-claimed). */
	finish(
		job: string,
		period: string,
		attempt: number,
		outcome: RunOutcome,
		now: Date,
	): Promise<void>
	/** The most recent run of each of `jobs` (admin panel). */
	latest(jobs: string[]): Promise<Map<string, RunRecord>>
}

export function createDbRunStore(db: Db): RunStore {
	const t = scheduledJobRuns
	return {
		async get(job, period) {
			const [row] = await db
				.select({
					status: t.status,
					attempts: t.attempts,
					startedAt: t.startedAt,
				})
				.from(t)
				.where(and(eq(t.job, job), eq(t.period, period)))
				.limit(1)
			return row ?? null
		},

		async claim(job, period, expected, now, trigger) {
			if (!expected) {
				const [res] = await db.insert(t).ignore().values({
					job,
					period,
					status: "running",
					attempts: 1,
					trigger,
					startedAt: now,
				})
				return res.affectedRows ? 1 : null
			}
			const [res] = await db
				.update(t)
				.set({
					status: "running",
					attempts: expected.attempts + 1,
					trigger,
					startedAt: now,
					finishedAt: null,
					result: null,
					error: null,
				})
				.where(
					and(
						eq(t.job, job),
						eq(t.period, period),
						eq(t.attempts, expected.attempts),
					),
				)
			return res.affectedRows ? expected.attempts + 1 : null
		},

		async finish(job, period, attempt, outcome, now) {
			await db
				.update(t)
				.set({
					status: outcome.status,
					finishedAt: now,
					result: outcome.status === "ok" ? (outcome.result ?? null) : null,
					error: outcome.status === "failed" ? outcome.error : null,
				})
				.where(
					and(eq(t.job, job), eq(t.period, period), eq(t.attempts, attempt)),
				)
		},

		async latest(jobs) {
			const out = new Map<string, RunRecord>()
			for (const job of jobs) {
				const [r] = await db
					.select()
					.from(t)
					.where(eq(t.job, job))
					.orderBy(desc(t.startedAt), desc(t.id))
					.limit(1)
				if (!r) continue
				out.set(job, {
					job: r.job,
					period: r.period,
					status: r.status as RunStatus,
					attempts: r.attempts,
					trigger: r.trigger as RunTrigger,
					startedAt: r.startedAt,
					finishedAt: r.finishedAt,
					result: r.result,
					error: r.error,
				})
			}
			return out
		},
	}
}
