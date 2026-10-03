// The monthly reward track card's state (the server decides and pays, see
// shared/gym3d/rewardTrack.ts).
import type { GymRewardTrackDto } from "../../shared/types"
import { api } from "./api.js"
import { loadWallet } from "./wallet.svelte.js"

export const rewardTrack = $state<{
	data: GymRewardTrackDto | null
	error: string
}>({ data: null, error: "" })

export async function loadRewardTrack(): Promise<void> {
	try {
		rewardTrack.data = await api.get<GymRewardTrackDto>("/gym/reward-track")
	} catch {
		// the card keeps what it has
	}
}

/** Takes today's step; the wallet follows. */
export async function claimRewardStep(): Promise<void> {
	rewardTrack.error = ""
	try {
		const r = await api.post<{ track: GymRewardTrackDto }>(
			"/gym/reward-track/claim",
			{},
		)
		rewardTrack.data = r.track
		await loadWallet()
	} catch (e) {
		rewardTrack.error = e instanceof Error ? e.message : "Could not claim"
		await loadRewardTrack()
	}
}

/** "+60 coins, +1 Sweat" for a step. */
export function stepText(
	r: { coins: number; sweat: number; greens: number },
	cosmeticName?: string,
): string {
	const parts = [`+${r.coins} coins`]
	if (r.sweat) parts.push(`+${r.sweat} Sweat`)
	if (r.greens) parts.push(`+${r.greens} Greens`)
	if (cosmeticName) parts.push(cosmeticName)
	return parts.join(", ")
}
