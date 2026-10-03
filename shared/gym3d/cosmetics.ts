// Cosmetics: things a gym can own besides gear (decor, outfits). They come
// from reward sources (the monthly track today) and live in `gym_cosmetics`,
// one per gym and key. Pure data: the server grants, the client lists.
export type CosmeticKind = "decor" | "outfit"

export type CosmeticDef = {
	key: string
	name: string
	kind: CosmeticKind
	/** Where it comes from, for the inventory list. */
	from: string
	/** Decor only: the key of the 3D builder (a decor piece's item key). */
	builder?: string
}

/** Upgrade key of the gym piece a placed decor cosmetic becomes (unique per
 * gym, so a cosmetic is on show once at most). */
export const cosmeticPieceKey = (key: string): string => `cosmetic:${key}`

export const COSMETICS: readonly CosmeticDef[] = [
	{
		key: "halloween_lantern",
		name: "Jack-o'-lantern",
		kind: "decor",
		from: "Halloween track",
		builder: "lantern",
	},
	{
		key: "halloween_cobwebs",
		name: "Cobweb neon",
		kind: "decor",
		from: "Halloween track",
		builder: "cobwebs",
	},
	{
		key: "challenge_trophy",
		name: "Challenge trophy",
		kind: "decor",
		from: "Finishing a monthly challenge",
		builder: "trophy",
	},
	{
		key: "halloween_hat",
		name: "Witch hat for the coach",
		kind: "outfit",
		from: "Halloween track",
	},
]

export function cosmeticOf(key: string): CosmeticDef | null {
	return COSMETICS.find((c) => c.key === key) ?? null
}
