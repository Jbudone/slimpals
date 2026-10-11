// The "What's new" card: shows each changelog entry (shared/changelog.ts)
// once per player on this device. A browser that has never seen the card gets
// the most recent FIRST_RUN_MAX entries (it may be a device that missed a lot,
// not a new player), and Settings can open the whole history any time.
import {
	CHANGELOG,
	type ChangeEntry,
	unseenEntries,
} from "../../shared/changelog.js"

/** How many entries a device that never saw the card is caught up on. */
export const FIRST_RUN_MAX = 40

export const whatsNew = $state<{ entries: ChangeEntry[]; history: boolean }>({
	entries: [],
	history: false,
})

// v2: the history was backfilled, so every device is caught up once more
const key = (userId: string) => `sp:seen-news:v2:${userId}`

function read(userId: string): string | null {
	try {
		return localStorage.getItem(key(userId))
	} catch {
		return null
	}
}

function write(userId: string, id: string): void {
	try {
		localStorage.setItem(key(userId), id)
	} catch {
		// seen again next time, which is harmless
	}
}

/** Off in the e2e runs (VITE_WHATSNEW=off) unless the page asks with ?news=1,
 * so the card does not sit over every spec. */
function newsOn(): boolean {
	if (import.meta.env.VITE_WHATSNEW !== "off") return true
	return (
		new URLSearchParams(globalThis.location?.search ?? "").get("news") === "1"
	)
}

/** Called once the player is known: queues what they have not seen. */
export function checkWhatsNew(userId: string): void {
	if (!newsOn()) return
	const seen = read(userId)
	const fresh = unseenEntries(CHANGELOG, seen)
	whatsNew.history = false
	whatsNew.entries = seen === null ? fresh.slice(0, FIRST_RUN_MAX) : fresh
}

/** Settings: the whole list, newest first, whenever the player wants it. */
export function openWhatsNewHistory(): void {
	whatsNew.history = true
	whatsNew.entries = [...CHANGELOG]
}

/** The player closed the card: everything up to the newest is seen. */
export function dismissWhatsNew(userId: string): void {
	const newest = CHANGELOG[0]
	if (newest) write(userId, newest.id)
	whatsNew.history = false
	whatsNew.entries = []
}
