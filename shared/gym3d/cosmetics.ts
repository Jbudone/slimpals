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
}

export const COSMETICS: readonly CosmeticDef[] = [
	{
		key: "halloween_lantern",
		name: "Jack-o'-lantern",
		kind: "decor",
		from: "Halloween track",
	},
	{
		key: "halloween_cobwebs",
		name: "Cobweb neon",
		kind: "decor",
		from: "Halloween track",
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
