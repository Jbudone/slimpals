const BASE = "/api"

/** The server answered, with an error (`status` tells which). */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message)
	}
}

/** No answer at all: offline, a dropped connection, a timeout. */
export class NetworkError extends Error {}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

// Reads started before the app is up (main.ts) wait here for their first
// taker, so the page does not ask twice for what it already asked.
const prefetched = new Map<string, { at: number; p: Promise<Response> }>()
const PREFETCH_TTL = 20_000

/** Starts a GET now; the next `api.get(path)` within 20 s uses its answer. */
export function prefetch(path: string): void {
	try {
		prefetched.set(path, {
			at: Date.now(),
			p: fetch(`${BASE}${path}`, { credentials: "include" }),
		})
		// a failed prefetch is simply not used
		prefetched.get(path)?.p.catch(() => {})
	} catch {
		// not started
	}
}

function takePrefetch(path: string): Promise<Response> | null {
	const e = prefetched.get(path)
	prefetched.delete(path)
	return e && Date.now() - e.at < PREFETCH_TTL ? e.p : null
}

async function request<T>(
	method: HttpMethod,
	path: string,
	body?: unknown,
): Promise<T> {
	let res: Response | null = null
	if (method === "GET") {
		const pre = takePrefetch(path)
		if (pre) res = await pre.catch(() => null)
	}
	if (!res || !res.ok) {
		try {
			res = await fetch(`${BASE}${path}`, {
				method,
				headers: body ? { "Content-Type": "application/json" } : undefined,
				body: body ? JSON.stringify(body) : undefined,
				credentials: "include",
			})
		} catch {
			throw new NetworkError("No connection")
		}
	}

	if (!res.ok) {
		const error = await res.json().catch(() => ({ message: res.statusText }))
		throw new ApiError(
			error.message ?? error.error ?? `HTTP ${res.status}`,
			res.status,
		)
	}

	return res.json() as Promise<T>
}

// The same read asked for twice at once (screens that each load "today") is
// one request; every caller gets its own copy of the answer.
const inflight = new Map<string, Promise<unknown>>()

function getShared<T>(path: string): Promise<T> {
	const open = inflight.get(path)
	if (open) return open.then((v) => structuredClone(v) as T)
	const p = request<T>("GET", path).finally(() => inflight.delete(path))
	inflight.set(path, p)
	return p
}

export const api = {
	get: <T>(path: string) => getShared<T>(path),
	post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
	patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
	put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
	del: <T>(path: string) => request<T>("DELETE", path),
}
