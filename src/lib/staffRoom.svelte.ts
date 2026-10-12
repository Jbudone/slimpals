// The staff room's state on the client (the server decides which episode
// waits and records it as seen, see shared/gym3d/staffRoom.ts).
import {
	episodeById,
	type RoomDto,
	type RoomPending,
} from "../../shared/gym3d/staffRoom"
import { api } from "./api.js"

export const staffRoom = $state<{
	data: RoomDto | null
	/** A seen episode being played again (nothing is recorded). */
	replay: RoomPending | null
}>({ data: null, replay: null })

/** Plays a seen episode again from the diary. */
export function startReplay(id: string): void {
	const e = episodeById(id)
	if (!e) return
	staffRoom.replay = {
		id,
		arcId: e.arc.id,
		arcTitle: e.arc.title,
		title: e.episode.title,
		n: e.n + 1,
		of: e.arc.episodes.length,
		lines: e.episode.lines,
	}
}

export function endReplay(): void {
	staffRoom.replay = null
}

/** Off in the e2e runs (VITE_STORY=off) unless the page asks with ?room=1, so
 * the card does not sit over every spec. */
function roomOn(): boolean {
	if (import.meta.env.VITE_STORY !== "off") return true
	return (
		new URLSearchParams(globalThis.location?.search ?? "").get("room") === "1"
	)
}

export async function loadStaffRoom(): Promise<void> {
	if (!roomOn()) return
	try {
		staffRoom.data = await api.get<RoomDto>("/gym/staff-room")
	} catch {
		// a nicety: the gym works without it
	}
}

/** The waiting episode has been watched (or skipped). */
export async function markEpisodeSeen(id: string): Promise<void> {
	try {
		staffRoom.data = await api.post<RoomDto>(
			`/gym/staff-room/${encodeURIComponent(id)}/seen`,
			{},
		)
	} catch {
		// shown again on the next load if this failed
		if (staffRoom.data?.pending?.id === id)
			staffRoom.data = { ...staffRoom.data, pending: null }
	}
}
