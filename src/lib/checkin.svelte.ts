import { sendOrQueue } from "./net/queue.js"
import { swr } from "./net/swr.js"

export type CheckinStatus = {
	checkedInToday: boolean
	streakCount: number
}

export type NewBadge = {
	key: string
	name: string
	tier: string
	earnedAt: string
}

// Shared across the header's streak pill and the Dashboard's streak card so
// both stay in sync — checking in from the card updates the pill immediately
// without a page reload.
export const checkinState = $state<{ data: CheckinStatus | null }>({
	data: null,
})

export async function loadCheckinStatus() {
	// the last answer shows at once (and offline), the fresh one replaces it
	await swr<CheckinStatus>("/checkins/today", (r) => {
		checkinState.data = r
	})
}

/** Checks in. Without a connection it is queued (the card shows as done and
 * the streak counts up) and this resolves to null. */
export async function submitCheckin(): Promise<
	({ newBadges?: NewBadge[] } & Partial<CheckinStatus>) | null
> {
	const sent = await sendOrQueue<CheckinStatus & { newBadges?: NewBadge[] }>(
		"POST",
		"/checkins",
		{},
	)
	if (sent.queued) {
		checkinState.data = {
			checkedInToday: true,
			streakCount: (checkinState.data?.streakCount ?? 0) + 1,
		}
		return null
	}
	checkinState.data = {
		checkedInToday: true,
		streakCount: sent.data.streakCount,
	}
	return sent.data
}
