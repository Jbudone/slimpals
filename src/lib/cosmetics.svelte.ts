// The cosmetics the gym owns (shared/gym3d/cosmetics.ts), for the parts of the
// app that show them: the coach wears owned outfits.
import type { GymCosmeticDto } from "../../shared/types"
import { api } from "./api.js"

export const cosmetics = $state<{ keys: string[] }>({ keys: [] })

export async function loadOwnedCosmetics(): Promise<void> {
	try {
		const all = await api.get<GymCosmeticDto[]>("/gym/cosmetics")
		cosmetics.keys = all.map((c) => c.key)
	} catch {
		// the coach just wears nothing extra
	}
}
