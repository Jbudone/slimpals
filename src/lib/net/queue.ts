// Offline-first inputs. A tap is applied on screen at once; the request that
// makes it real goes through `sendOrQueue`: it is tried now, and when there is
// no connection (or it takes too long) it waits in a queue kept in IndexedDB,
// so closing the app does not lose it. The queue is sent in order when the
// connection is back. Players are told only when it becomes a problem
// (`netState.trouble`, shown by NetBanner).
import { ApiError, api, NetworkError } from "../api.js"
import { kvGet, kvSet } from "./kv.js"

export type QueuedOp = {
	id: string
	method: "POST" | "PATCH" | "PUT" | "DELETE"
	path: string
	body?: unknown
	/** A server error whose message matches this means the change is already
	 * in (a replay of something that did arrive): the op is done. */
	settleOn?: string
	at: number
	tries: number
}

export const netState = $state<{
	/** Inputs saved on this device and not sent yet. */
	pending: number
	/** Sending the queue right now. */
	flushing: boolean
	/** The connection has been bad long enough that the player should know. */
	trouble: boolean
	/** The queue was just sent after a bad spell (a short "all caught up"). */
	caughtUp: boolean
}>({ pending: 0, flushing: false, trouble: false, caughtUp: false })

/** Seconds of failure before the player is told. */
export const TROUBLE_AFTER_MS = 6000
/** How long a request may take before it is queued instead of awaited. */
export const SEND_TIMEOUT_MS = 3500
/** Drop an op the server keeps failing on (5xx) after this many tries. */
export const MAX_TRIES = 12

let owner = ""
let ops: QueuedOp[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let failingSince = 0
let started = false
let afterFlush: (() => void) | null = null
let onDropped: ((op: QueuedOp, why: string) => void) | null = null

const keyOf = () => `net:queue:${owner}`
const id = () =>
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** What to refresh once the queue has been sent (the stores re-read). */
export function onQueueSent(fn: () => void): void {
	afterFlush = fn
}

/** Called with an op the server refused for good (a 4xx), and why. */
export function onOpDropped(fn: (op: QueuedOp, why: string) => void): void {
	onDropped = fn
}

async function persist(): Promise<void> {
	netState.pending = ops.length
	await kvSet(keyOf(), ops)
}

/** Binds the queue to the signed-in player and sends what they left behind. */
export async function startQueue(userId: string | null): Promise<void> {
	if ((userId ?? "") === owner && started) return
	owner = userId ?? ""
	ops = []
	netState.pending = 0
	if (!owner) return
	ops = (await kvGet<QueuedOp[]>(keyOf())) ?? []
	netState.pending = ops.length
	if (!started) {
		started = true
		if (typeof window !== "undefined") {
			window.addEventListener("online", () => void flush())
			window.addEventListener("offline", noteFailure)
		}
	}
	if (ops.length) void flush()
}

function noteFailure(): void {
	if (!failingSince) failingSince = Date.now()
	if (Date.now() - failingSince >= TROUBLE_AFTER_MS) netState.trouble = true
	else
		setTimeout(() => {
			if (failingSince && Date.now() - failingSince >= TROUBLE_AFTER_MS)
				netState.trouble = true
		}, TROUBLE_AFTER_MS)
}

function noteSuccess(): void {
	const wasTrouble = netState.trouble
	failingSince = 0
	netState.trouble = false
	if (wasTrouble) {
		netState.caughtUp = true
		setTimeout(() => (netState.caughtUp = false), 2500)
	}
}

function schedule(ms: number): void {
	if (timer) clearTimeout(timer)
	timer = setTimeout(() => void flush(), ms)
}

const backoff = (tries: number) =>
	Math.min(30_000, 1500 * 2 ** Math.min(tries, 5))

async function send(op: QueuedOp): Promise<void> {
	const run = {
		POST: api.post,
		PATCH: api.patch,
		PUT: api.put,
		DELETE: (p: string) => api.del(p),
	}[op.method] as (p: string, b?: unknown) => Promise<unknown>
	await run(op.path, op.body)
}

let running = false

/** Sends the queue in order; stops at the first failure that may pass. */
export async function flush(): Promise<void> {
	if (running || !owner) return
	running = true
	netState.flushing = ops.length > 0
	let sent = 0
	try {
		while (ops.length) {
			const op = ops[0]
			try {
				await send(op)
				ops.shift()
				sent++
				noteSuccess()
			} catch (e) {
				if (e instanceof NetworkError) {
					noteFailure()
					schedule(backoff(op.tries++))
					await persist()
					return
				}
				const status = e instanceof ApiError ? e.status : 0
				const msg = e instanceof Error ? e.message : ""
				if (op.settleOn && new RegExp(op.settleOn, "i").test(msg)) {
					ops.shift()
					sent++
				} else if (status >= 500) {
					op.tries++
					if (op.tries >= MAX_TRIES) {
						ops.shift()
						onDropped?.(op, msg)
					} else {
						noteFailure()
						schedule(backoff(op.tries))
						await persist()
						return
					}
				} else {
					// the server said no (a 4xx): retrying will not change it
					ops.shift()
					onDropped?.(op, msg)
				}
			}
			await persist()
		}
	} finally {
		running = false
		netState.flushing = false
		netState.pending = ops.length
	}
	if (sent) afterFlush?.()
}

export type Sent<T> = { queued: false; data: T } | { queued: true }

/** Sends a change now, or queues it when there is no connection or the answer
 * is slow. While something is already queued, later changes queue behind it
 * (order matters). Errors the server gives for good (4xx) are thrown. */
export async function sendOrQueue<T>(
	method: QueuedOp["method"],
	path: string,
	body?: unknown,
	opts: { settleOn?: string } = {},
): Promise<Sent<T>> {
	const op: QueuedOp = {
		id: id(),
		method,
		path,
		body,
		settleOn: opts.settleOn,
		at: Date.now(),
		tries: 0,
	}
	if (ops.length) return queue(op)
	try {
		const data = await withTimeout(
			method === "DELETE" ? api.del<T>(path) : bodyCall<T>(method, path, body),
		)
		noteSuccess()
		return { queued: false, data }
	} catch (e) {
		if (e instanceof NetworkError || e instanceof TimeoutError) {
			noteFailure()
			return queue(op)
		}
		throw e
	}
}

function bodyCall<T>(
	method: "POST" | "PATCH" | "PUT",
	path: string,
	body: unknown,
) {
	return (
		method === "POST" ? api.post : method === "PATCH" ? api.patch : api.put
	)<T>(path, body)
}

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		const t = setTimeout(
			() => reject(new TimeoutError("slow")),
			SEND_TIMEOUT_MS,
		)
		p.then(
			(v) => {
				clearTimeout(t)
				resolve(v)
			},
			(e) => {
				clearTimeout(t)
				reject(e)
			},
		)
	})
}

async function queue(op: QueuedOp): Promise<{ queued: true }> {
	ops.push(op)
	await persist()
	schedule(backoff(0))
	return { queued: true }
}

/** Test hook: the queue as it stands. */
export function queuedOps(): readonly QueuedOp[] {
	return ops
}
