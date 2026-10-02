// The scheduler loop with a fake clock and an in-memory run store (no DB,
// no AI): which jobs a tick runs, that a double tick/restart does not run a
// period twice, retries, isolation between jobs and the admin "Run now".
import { describe, expect, it, vi } from "vitest"
import {
	createScheduler,
	type ScheduledJob,
} from "../../server/services/scheduler/index.js"
import type {
	RunRecord,
	RunStore,
} from "../../server/services/scheduler/store.js"

const MIN = 60 * 1000

function memoryStore(): RunStore & { rows: Map<string, RunRecord> } {
	const rows = new Map<string, RunRecord>()
	const id = (job: string, period: string) => `${job}|${period}`
	return {
		rows,
		async get(job, period) {
			const r = rows.get(id(job, period))
			return r
				? { status: r.status, attempts: r.attempts, startedAt: r.startedAt }
				: null
		},
		async claim(job, period, expected, now, trigger) {
			const cur = rows.get(id(job, period))
			if (!expected) {
				if (cur) return null
			} else if (!cur || cur.attempts !== expected.attempts) {
				return null
			}
			const attempts = (cur?.attempts ?? 0) + 1
			rows.set(id(job, period), {
				job,
				period,
				status: "running",
				attempts,
				trigger,
				startedAt: now,
				finishedAt: null,
				result: null,
				error: null,
			})
			return attempts
		},
		async finish(job, period, attempt, outcome, now) {
			const cur = rows.get(id(job, period))
			if (!cur || cur.attempts !== attempt) return
			cur.status = outcome.status
			cur.finishedAt = now
			cur.result = outcome.status === "ok" ? outcome.result : null
			cur.error = outcome.status === "failed" ? outcome.error : null
		},
		async latest(jobs) {
			const out = new Map<string, RunRecord>()
			for (const r of rows.values()) {
				if (!jobs.includes(r.job)) continue
				const prev = out.get(r.job)
				if (!prev || prev.startedAt <= r.startedAt) out.set(r.job, r)
			}
			return out
		},
	}
}

const quiet = { log: () => {}, error: () => {} }

function setup(jobs: ScheduledJob[], start: string) {
	let now = new Date(start)
	const store = memoryStore()
	const scheduler = createScheduler({
		jobs,
		store,
		now: () => now,
		log: quiet,
	})
	return {
		store,
		scheduler,
		setNow(iso: string) {
			now = new Date(iso)
		},
	}
}

function job(
	key: string,
	schedule: ScheduledJob["schedule"],
	run: ScheduledJob["run"] = async () => ({ ok: true }),
): ScheduledJob & { run: ReturnType<typeof vi.fn> } {
	return { key, label: key, schedule, run: vi.fn(run) }
}

describe("scheduler tick", () => {
	it("runs only the jobs that are due at the fake time", async () => {
		const monthly = job("monthly", { kind: "monthly", atMinute: 5 })
		const weekly = job("weekly", { kind: "weekly", atMinute: 5 })
		const daily = job("daily", { kind: "daily", atMinute: 20 })
		// Thursday 2026-10-01 00:10 UTC: month window open, daily not yet,
		// weekly window (Mon 2026-09-28 00:05) open.
		const { scheduler } = setup(
			[monthly, weekly, daily],
			"2026-10-01T00:10:00Z",
		)
		await scheduler.tick()
		expect(monthly.run).toHaveBeenCalledTimes(1)
		expect(weekly.run).toHaveBeenCalledTimes(1)
		expect(daily.run).not.toHaveBeenCalled()
	})

	it("never runs a period twice, across ticks and a restart", async () => {
		const weekly = job("weekly", { kind: "weekly", atMinute: 5 })
		const { scheduler, store, setNow } = setup([weekly], "2026-10-05T00:06:00Z")
		await scheduler.tick()
		await scheduler.tick()
		setNow("2026-10-08T12:00:00Z")
		await scheduler.tick()
		expect(weekly.run).toHaveBeenCalledTimes(1)

		// A "restarted" scheduler sharing the same store does not rerun it.
		const restarted = createScheduler({
			jobs: [weekly],
			store,
			now: () => new Date("2026-10-09T00:00:00Z"),
			log: quiet,
		})
		await restarted.tick()
		expect(weekly.run).toHaveBeenCalledTimes(1)

		// Next week it is due again.
		setNow("2026-10-12T00:05:00Z")
		await scheduler.tick()
		expect(weekly.run).toHaveBeenCalledTimes(2)
		expect(store.rows.get("weekly|week-2026-10-12")?.status).toBe("ok")
	})

	it("two schedulers ticking at once run the job once", async () => {
		let release: () => void = () => {}
		const gate = new Promise<void>((r) => {
			release = r
		})
		const slow = job("daily", { kind: "daily", atMinute: 20 }, async () => {
			await gate
			return {}
		})
		const { scheduler, store } = setup([slow], "2026-10-02T01:00:00Z")
		const other = createScheduler({
			jobs: [slow],
			store,
			now: () => new Date("2026-10-02T01:00:00Z"),
			log: quiet,
		})
		const both = Promise.all([scheduler.tick(), other.tick()])
		release()
		await both
		expect(slow.run).toHaveBeenCalledTimes(1)
	})

	it("records a failure, keeps other jobs running and retries later", async () => {
		let fail = true
		const flaky = job("flaky", { kind: "daily", atMinute: 20 }, async () => {
			if (fail) throw new Error("AI down")
			return { generated: 2 }
		})
		const fine = job("fine", { kind: "daily", atMinute: 20 })
		const { scheduler, store, setNow } = setup(
			[flaky, fine],
			"2026-10-02T00:30:00Z",
		)
		await scheduler.tick()
		expect(fine.run).toHaveBeenCalledTimes(1)
		const failed = store.rows.get("flaky|2026-10-02")
		expect(failed).toMatchObject({ status: "failed", error: "AI down" })

		setNow("2026-10-02T00:50:00Z") // too soon to retry
		await scheduler.tick()
		expect(flaky.run).toHaveBeenCalledTimes(1)

		fail = false
		setNow("2026-10-02T01:31:00Z")
		await scheduler.tick()
		expect(flaky.run).toHaveBeenCalledTimes(2)
		expect(store.rows.get("flaky|2026-10-02")).toMatchObject({
			status: "ok",
			attempts: 2,
			result: { generated: 2 },
		})
		expect(fine.run).toHaveBeenCalledTimes(1)
	})

	it("gives up after MAX_ATTEMPTS failures in one period", async () => {
		const broken = job("broken", { kind: "daily", atMinute: 0 }, async () => {
			throw new Error("nope")
		})
		const { scheduler, setNow } = setup([broken], "2026-10-02T00:00:00Z")
		for (const t of ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00"]) {
			setNow(`2026-10-02T${t}:00Z`)
			await scheduler.tick()
		}
		expect(broken.run).toHaveBeenCalledTimes(3)
	})

	it("runs interval jobs every interval", async () => {
		const sweep = job("sweep", { kind: "interval", everyMs: 15 * MIN })
		const { scheduler, setNow } = setup([sweep], "2026-10-02T10:00:00Z")
		await scheduler.tick()
		setNow("2026-10-02T10:10:00Z")
		await scheduler.tick()
		setNow("2026-10-02T10:15:00Z")
		await scheduler.tick()
		expect(sweep.run).toHaveBeenCalledTimes(2)
	})

	it("survives a store that throws", async () => {
		const a = job("a", { kind: "daily", atMinute: 0 })
		const b = job("b", { kind: "daily", atMinute: 0 })
		const store = memoryStore()
		const realGet = store.get
		store.get = async (j, p) => {
			if (j === "a") throw new Error("db gone")
			return realGet(j, p)
		}
		const scheduler = createScheduler({
			jobs: [a, b],
			store,
			now: () => new Date("2026-10-02T12:00:00Z"),
			log: quiet,
		})
		await expect(scheduler.tick()).resolves.toBeUndefined()
		expect(a.run).not.toHaveBeenCalled()
		expect(b.run).toHaveBeenCalledTimes(1)
	})
})

describe("scheduler runNow / status", () => {
	it("runs a job on demand even when already done this period", async () => {
		const monthly = job(
			"monthly",
			{ kind: "monthly", atMinute: 5 },
			async () => ({
				created: true,
			}),
		)
		const { scheduler, store } = setup([monthly], "2026-10-02T00:00:00Z")
		await scheduler.tick()
		const res = await scheduler.runNow("monthly")
		expect(res).toEqual({ status: "ok", result: { created: true } })
		expect(monthly.run).toHaveBeenCalledTimes(2)
		expect(store.rows.get("monthly|2026-10")).toMatchObject({
			trigger: "manual",
			attempts: 2,
		})
		// Still not due on the next tick.
		await scheduler.tick()
		expect(monthly.run).toHaveBeenCalledTimes(2)
	})

	it("refuses to start a second copy of a running job", async () => {
		const { scheduler, store } = setup(
			[job("daily", { kind: "daily", atMinute: 0 })],
			"2026-10-02T12:00:00Z",
		)
		await store.claim(
			"daily",
			"2026-10-02",
			null,
			new Date("2026-10-02T11:59:00Z"),
			"schedule",
		)
		expect(await scheduler.runNow("daily")).toEqual({ status: "busy" })
		await expect(scheduler.runNow("nope")).rejects.toThrow(/Unknown job/)
	})

	it("reports the last run and next due time per job", async () => {
		const daily = job("daily", { kind: "daily", atMinute: 20 })
		const { scheduler } = setup([daily], "2026-10-02T00:30:00Z")
		await scheduler.tick()
		const [s] = await scheduler.status()
		expect(s.key).toBe("daily")
		expect(s.schedule).toBe("Daily at 00:20 UTC")
		expect(s.lastRun).toMatchObject({ period: "2026-10-02", status: "ok" })
		expect(s.nextDueAt).toEqual(new Date("2026-10-03T00:20:00Z"))
	})
})

describe("scheduler start/stop", () => {
	it("ticks on a timer only after start(), and stops cleanly", async () => {
		vi.useFakeTimers()
		try {
			const daily = job("daily", { kind: "daily", atMinute: 0 })
			const scheduler = createScheduler({
				jobs: [daily],
				store: memoryStore(),
				now: () => new Date("2026-10-02T12:00:00Z"),
				tickMs: 1000,
				firstTickDelayMs: 500,
				log: quiet,
			})
			await vi.advanceTimersByTimeAsync(5000)
			expect(daily.run).not.toHaveBeenCalled()
			scheduler.start()
			expect(scheduler.running).toBe(true)
			await vi.advanceTimersByTimeAsync(600)
			expect(daily.run).toHaveBeenCalledTimes(1)
			scheduler.stop()
			expect(scheduler.running).toBe(false)
		} finally {
			vi.useRealTimers()
		}
	})
})
