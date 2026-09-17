import { api } from "./api.js"

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
	try {
		checkinState.data = await api.get<CheckinStatus>("/checkins/today")
	} catch {
		// ignore — pill/card stay in their default hidden state
	}
}

export async function submitCheckin(): Promise<{ newBadges?: NewBadge[] }> {
	const res = await api.post<CheckinStatus & { newBadges?: NewBadge[] }>(
		"/checkins",
		{},
	)
	checkinState.data = { checkedInToday: true, streakCount: res.streakCount }
	return res
}
