// The cosmetics the gym owns (shared/gym3d/cosmetics.ts), for the parts of the
// app that show them: the coach wears owned outfits.
import type { GymCosmeticDto } from "../../shared/types"
import { api } from "./api.js"

export const cosmetics = $state<{
	/** Outfits the coach wears right now. */
	keys: string[]
	owned: GymCosmeticDto[]
}>({ keys: [], owned: [] })

export async function loadOwnedCosmetics(): Promise<void> {
	try {
		const all = await api.get<GymCosmeticDto[]>("/gym/cosmetics")
		cosmetics.owned = all
		cosmetics.keys = all
			.filter((c) => c.kind === "outfit" && c.worn)
			.map((c) => c.key)
	} catch {
		// the coach just wears nothing extra
	}
}

/** Puts an outfit on the coach or takes it off. */
export async function wearOutfit(key: string, worn: boolean): Promise<void> {
	await api.post(`/gym/cosmetics/${key}/wear`, { worn })
	await loadOwnedCosmetics()
}
