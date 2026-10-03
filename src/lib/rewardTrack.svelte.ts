// The monthly reward track card's state (the server decides and pays, see
// shared/gym3d/rewardTrack.ts).
import type { GymRewardTrackDto } from "../../shared/types"
import { chipHtml } from "../components/home/icons.js"
import { api } from "./api.js"
import { burstAt, centerOf, flyChip } from "./fly.js"
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
export async function claimRewardStep(from?: HTMLElement): Promise<void> {
	rewardTrack.error = ""
	try {
		const r = await api.post<{
			track: GymRewardTrackDto
			paid: { reward: { coins: number; sweat: number; greens: number } }
		}>("/gym/reward-track/claim", {})
		rewardTrack.data = r.track
		// the reward flies to the HUD, then the HUD numbers catch up
		const at = from ? centerOf(from) : { x: innerWidth / 2, y: innerHeight / 2 }
		burstAt(at.x, at.y, ["#f2c14a", "#34c973", "#5bc0eb"])
		const chips: Promise<void>[] = []
		const { coins, sweat, greens } = r.paid.reward
		if (coins) chips.push(flyChip("co", chipHtml("co", coins), at, 0))
		if (sweat) chips.push(flyChip("sw", chipHtml("sw", sweat), at, 140))
		if (greens) chips.push(flyChip("gr", chipHtml("gr", greens), at, 280))
		await Promise.all(chips)
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
