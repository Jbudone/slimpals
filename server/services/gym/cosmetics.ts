// Granting cosmetics (gym home): one row per gym and key, so a cosmetic is
// only ever granted once however often its source repeats. The catalog is
// shared/gym3d/cosmetics.ts; placing decor is cosmeticPlace.ts.
import { cosmeticOf } from "../../../shared/gym3d/cosmetics.js"
import { gymCosmetics } from "../../db/schema.js"
import type { Db } from "./layout3dStore.js"

/** Gives the gym a cosmetic. Returns its name when newly granted, null when
 * the gym already had it or the key is unknown. */
export async function grantCosmetic(
	db: Db,
	gymId: number,
	key: string,
	source: string,
): Promise<string | null> {
	const def = cosmeticOf(key)
	if (!def) return null
	const [res] = await db
		.insert(gymCosmetics)
		.ignore()
		.values({ gymId, cosmeticKey: key, source: source.slice(0, 64) })
	return res.affectedRows ? def.name : null
}
