import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// the real api module over a stubbed fetch
const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

const {
	flush,
	netState,
	onOpDropped,
	onQueueSent,
	queuedOps,
	sendOrQueue,
	startQueue,
} = await import("../../src/lib/net/queue.js")

const ok = (body: unknown) =>
	Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
const fail = (status: number, error: string) =>
	Promise.resolve(new Response(JSON.stringify({ error }), { status }))
const offline = () => Promise.reject(new TypeError("Failed to fetch"))

beforeEach(async () => {
	vi.useFakeTimers()
	fetchMock.mockReset()
	await startQueue(null)
	await startQueue(`u-${Math.random()}`)
})

afterEach(() => {
	vi.useRealTimers()
})

describe("offline queue", () => {
	it("sends straight away when there is a connection", async () => {
		fetchMock.mockImplementationOnce(() => ok({ done: true }))
		const r = await sendOrQueue<{ done: boolean }>(
			"POST",
			"/missions/1/complete",
		)
		expect(r).toEqual({ queued: false, data: { done: true } })
		expect(queuedOps()).toHaveLength(0)
	})

	it("queues when offline, keeps order, and sends it all once back", async () => {
		fetchMock.mockImplementation(offline)
		const a = await sendOrQueue("POST", "/missions/1/complete")
		const b = await sendOrQueue("POST", "/missions/2/complete")
		expect(a).toEqual({ queued: true })
		expect(b).toEqual({ queued: true })
		expect(queuedOps().map((o) => o.path)).toEqual([
			"/missions/1/complete",
			"/missions/2/complete",
		])
		expect(netState.pending).toBe(2)

		// the second one did not even try the network: it waits behind the first
		const calls = fetchMock.mock.calls.length
		await sendOrQueue("POST", "/missions/3/complete")
		expect(fetchMock.mock.calls.length).toBe(calls)

		const sentPaths: string[] = []
		fetchMock.mockReset()
		fetchMock.mockImplementation((url: string) => {
			sentPaths.push(url.replace("/api", ""))
			return ok({})
		})
		const done = vi.fn()
		onQueueSent(done)
		await flush()
		expect(sentPaths).toEqual([
			"/missions/1/complete",
			"/missions/2/complete",
			"/missions/3/complete",
		])
		expect(queuedOps()).toHaveLength(0)
		expect(netState.pending).toBe(0)
		expect(done).toHaveBeenCalledTimes(1)
	})

	it("stops at a failure that may pass and tries again later", async () => {
		fetchMock.mockImplementation(offline)
		await sendOrQueue("POST", "/a")
		await sendOrQueue("POST", "/b")
		await flush() // still offline
		expect(queuedOps()).toHaveLength(2)
		expect(queuedOps()[0].tries).toBe(1)
	})

	it("treats 'already done' as done, and drops what the server refuses", async () => {
		fetchMock.mockImplementation(offline)
		await sendOrQueue("POST", "/m/1/complete", undefined, {
			settleOn: "already completed",
		})
		await sendOrQueue("POST", "/m/2/complete")
		const dropped: string[] = []
		onOpDropped((op, why) => dropped.push(`${op.path}:${why}`))
		fetchMock.mockReset()
		fetchMock
			.mockImplementationOnce(() =>
				fail(400, "Mission already completed this period"),
			)
			.mockImplementationOnce(() => fail(404, "Mission not found"))
		await flush()
		expect(queuedOps()).toHaveLength(0)
		expect(dropped).toEqual(["/m/2/complete:Mission not found"])
	})

	it("keeps an op that hit a server error and retries it", async () => {
		fetchMock.mockImplementation(offline)
		await sendOrQueue("POST", "/x")
		fetchMock.mockReset()
		fetchMock.mockImplementationOnce(() => fail(503, "Unavailable"))
		await flush()
		expect(queuedOps()).toHaveLength(1)
		fetchMock.mockImplementationOnce(() => ok({}))
		await flush()
		expect(queuedOps()).toHaveLength(0)
	})

	it("tells the player only after the trouble has lasted a few seconds", async () => {
		fetchMock.mockImplementation(offline)
		await sendOrQueue("POST", "/y")
		expect(netState.trouble).toBe(false)
		await vi.advanceTimersByTimeAsync(7000)
		expect(netState.trouble).toBe(true)
		fetchMock.mockReset()
		fetchMock.mockImplementation(() => ok({}))
		await flush()
		expect(netState.trouble).toBe(false)
		expect(netState.caughtUp).toBe(true)
	})
})
