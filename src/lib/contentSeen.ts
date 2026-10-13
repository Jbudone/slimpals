// Tells the server which generated content a player has seen (the pipeline's
// exposure telemetry). Ids are batched and sent every minute or when ten are
// waiting, and once more when the gym is closed. Best effort: a failed send
// puts the ids back (up to a small cap) and nothing here ever shows an error.
import { api } from "./api.js"

const FLUSH_MS = 60_000
const FLUSH_AT = 10
const MAX_WAITING = 60

let waiting: number[] = []
let timer: ReturnType<typeof setTimeout> | null = null

/** "ai-12" (a banter id in the picker) or 12: the content item id, or null. */
export function itemIdOf(id: string | number): number | null {
	const n = typeof id === "number" ? id : Number(String(id).replace(/^ai-/, ""))
	return Number.isInteger(n) && n > 0 ? n : null
}

export async function flushSeen(): Promise<void> {
	if (timer) clearTimeout(timer)
	timer = null
	if (waiting.length === 0) return
	const ids = waiting
	waiting = []
	try {
		await api.post("/gym/content/seen", { ids })
	} catch {
		waiting = [...ids, ...waiting].slice(-MAX_WAITING)
	}
}

export function noteSeen(id: string | number): void {
	const n = itemIdOf(id)
	if (n === null) return
	waiting.push(n)
	if (waiting.length >= FLUSH_AT) void flushSeen()
	else if (!timer) timer = setTimeout(() => void flushSeen(), FLUSH_MS)
}
