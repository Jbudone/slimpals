// Stale-while-revalidate reads: `swr(path, apply)` hands `apply` the last
// answer at once (from memory, else from IndexedDB) and then the fresh one
// from the network, so a screen never waits on a request it has seen before.
// The cache is per user (a login of someone else never sees it).
import { api } from "../api.js"
import { kvGet, kvSet } from "./kv.js"

const memory = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()
let owner = ""

/** Set on login/logout: answers cached for another user are not shown. */
export function setCacheOwner(id: string | null): void {
	const next = id ?? ""
	if (next === owner) return
	owner = next
	memory.clear()
}

const keyOf = (path: string) => `swr:${owner}:${path}`

/** The last answer for `path`, if any (memory first, then disk). */
export async function cached<T>(path: string): Promise<T | undefined> {
	const k = keyOf(path)
	if (memory.has(k)) return memory.get(k) as T
	const v = await kvGet<T>(k)
	if (v !== undefined) memory.set(k, v)
	return v
}

/** Fetches `path`, remembers the answer, and shares one request among callers
 * asking at the same time. */
export function refresh<T>(path: string): Promise<T> {
	const k = keyOf(path)
	const open = inflight.get(k)
	if (open) return open as Promise<T>
	const p = api
		.get<T>(path)
		.then((v) => {
			memory.set(k, v)
			void kvSet(k, v)
			return v
		})
		.finally(() => inflight.delete(k))
	inflight.set(k, p)
	return p
}

/** `apply(data, fresh)`: first the remembered answer (fresh = false), then the
 * network's (fresh = true). A network failure leaves the remembered answer
 * showing and resolves quietly. Resolves with the fresh answer or null. */
export async function swr<T>(
	path: string,
	apply: (data: T, fresh: boolean) => void,
): Promise<T | null> {
	const old = await cached<T>(path)
	if (old !== undefined) apply(old, false)
	try {
		const fresh = await refresh<T>(path)
		apply(fresh, true)
		return fresh
	} catch {
		return null
	}
}
