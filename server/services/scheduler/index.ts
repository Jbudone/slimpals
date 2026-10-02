// In-process scheduler (gh-122). The app ships as one container with no
// external cron, so the Express process ticks every minute and runs whatever
// is due. Each job is claimed per period in scheduled_job_runs before it
// runs, so a restart, an overlapping tick or a second instance never
// generates the same month/week/day twice. Started from server/index.ts when
// isSchedulerEnabled() (SCHEDULER_ENABLED, default on in production only).
import {
	currentPeriod,
	DEFAULT_STALE_AFTER_MS,
	decide,
	describeSchedule,
	type JobSchedule,
	nextDueAt,
} from "./schedule.js"
import type { RunRecord, RunStore, RunTrigger } from "./store.js"

export type ScheduledJob = {
	key: string
	label: string
	schedule: JobSchedule
	staleAfterMs?: number
	/** Does the work; the returned summary is stored as the run's result. */
	run(now: Date): Promise<Record<string, unknown>>
}

export type Logger = Pick<Console, "log" | "error">

export type JobStatus = {
	key: string
	label: string
	schedule: string
	period: string
	lastRun: RunRecord | null
	nextDueAt: Date | null
}

export type RunNowResult =
	| { status: "ok"; result: unknown }
	| { status: "failed"; error: string }
	| { status: "busy" }

export type Scheduler = {
	readonly jobs: readonly ScheduledJob[]
	start(): void
	stop(): void
	readonly running: boolean
	/** Runs every due job once (sequentially); never throws. */
	tick(): Promise<void>
	/** Admin "Run now": runs the job immediately for the current period,
	 * unless a run is already in flight. Throws for an unknown key. */
	runNow(key: string): Promise<RunNowResult>
	status(): Promise<JobStatus[]>
}

export const TICK_MS = 60 * 1000
/** Let the boot-time seeds settle before the first tick. */
export const FIRST_TICK_DELAY_MS = 20 * 1000

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err)
}

export function createScheduler(opts: {
	jobs: ScheduledJob[]
	store: RunStore
	now?: () => Date
	tickMs?: number
	firstTickDelayMs?: number
	log?: Logger
}): Scheduler {
	const { jobs, store } = opts
	const now = opts.now ?? (() => new Date())
	const log = opts.log ?? console
	const tickMs = opts.tickMs ?? TICK_MS
	const firstDelay = opts.firstTickDelayMs ?? FIRST_TICK_DELAY_MS

	let firstTimer: ReturnType<typeof setTimeout> | null = null
	let interval: ReturnType<typeof setInterval> | null = null
	let ticking = false

	async function execute(
		job: ScheduledJob,
		period: string,
		attempt: number,
		trigger: RunTrigger,
	): Promise<RunNowResult> {
		const started = Date.now()
		log.log(
			`[scheduler] ${job.key} ${period} start (attempt ${attempt}, ${trigger})`,
		)
		let outcome: RunNowResult
		try {
			const result = await job.run(now())
			outcome = { status: "ok", result }
			log.log(
				`[scheduler] ${job.key} ${period} done in ${Date.now() - started}ms`,
				result,
			)
		} catch (err) {
			outcome = { status: "failed", error: errorMessage(err) }
			log.error(`[scheduler] ${job.key} ${period} failed:`, err)
		}
		try {
			await store.finish(job.key, period, attempt, outcome, now())
		} catch (err) {
			log.error(`[scheduler] ${job.key} ${period} could not record run:`, err)
		}
		return outcome
	}

	async function runIfDue(job: ScheduledJob): Promise<void> {
		const t = now()
		const period = currentPeriod(job.schedule, t).key
		const row = await store.get(job.key, period)
		if (!decide(job.schedule, t, row, job.staleAfterMs).due) return
		const attempt = await store.claim(job.key, period, row, t, "schedule")
		if (attempt === null) return // another tick/instance got it first
		await execute(job, period, attempt, "schedule")
	}

	async function tick(): Promise<void> {
		if (ticking) return
		ticking = true
		try {
			for (const job of jobs) {
				try {
					await runIfDue(job)
				} catch (err) {
					log.error(`[scheduler] ${job.key} tick failed:`, err)
				}
			}
		} finally {
			ticking = false
		}
	}

	return {
		jobs,
		get running() {
			return interval !== null || firstTimer !== null
		},
		start() {
			if (interval || firstTimer) return
			log.log(
				`[scheduler] started: ${jobs.map((j) => `${j.key} (${describeSchedule(j.schedule)})`).join(", ")}`,
			)
			firstTimer = setTimeout(() => {
				firstTimer = null
				void tick()
				interval = setInterval(() => void tick(), tickMs)
				interval.unref?.()
			}, firstDelay)
			firstTimer.unref?.()
		},
		stop() {
			if (firstTimer) clearTimeout(firstTimer)
			if (interval) clearInterval(interval)
			firstTimer = null
			interval = null
		},
		tick,
		async runNow(key) {
			const job = jobs.find((j) => j.key === key)
			if (!job) throw new Error(`Unknown job: ${key}`)
			const t = now()
			const period = currentPeriod(job.schedule, t).key
			const row = await store.get(job.key, period)
			const staleAfter = job.staleAfterMs ?? DEFAULT_STALE_AFTER_MS
			if (
				row?.status === "running" &&
				t.getTime() - row.startedAt.getTime() < staleAfter
			) {
				return { status: "busy" }
			}
			const attempt = await store.claim(job.key, period, row, t, "manual")
			if (attempt === null) return { status: "busy" }
			return execute(job, period, attempt, "manual")
		},
		async status() {
			const t = now()
			const latest = await store.latest(jobs.map((j) => j.key))
			const out: JobStatus[] = []
			for (const job of jobs) {
				const period = currentPeriod(job.schedule, t).key
				const row = await store.get(job.key, period)
				out.push({
					key: job.key,
					label: job.label,
					schedule: describeSchedule(job.schedule),
					period,
					lastRun: latest.get(job.key) ?? null,
					nextDueAt: nextDueAt(job.schedule, t, row, job.staleAfterMs),
				})
			}
			return out
		},
	}
}
