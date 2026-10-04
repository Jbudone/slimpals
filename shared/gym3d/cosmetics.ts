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

/** The hat an owned, worn outfit puts on the gym's group coach (Coach Rivera). */
export const OUTFIT_HAT: Readonly<Record<string, "witch" | "santa">> = {
	halloween_hat: "witch",
	winter_hat: "santa",
}

/** The coach NPC's hat from the outfit keys worn right now (the first one). */
export function staffHatOf(worn: readonly string[]): "witch" | "santa" | null {
	for (const k of worn) if (OUTFIT_HAT[k]) return OUTFIT_HAT[k]
	return null
}

export const COSMETICS: readonly CosmeticDef[] = [
	{
		key: "jan_decor",
		name: "Resolution board",
		kind: "decor",
		from: "New Year Reset track",
		builder: "month_jan",
	},
	{
		key: "feb_decor",
		name: "Heart sculpture",
		kind: "decor",
		from: "Heart Health track",
		builder: "month_feb",
	},
	{
		key: "mar_decor",
		name: "Spring flower pot",
		kind: "decor",
		from: "Spring Training track",
		builder: "month_mar",
	},
	{
		key: "apr_decor",
		name: "Umbrella stand",
		kind: "decor",
		from: "Fresh Start track",
		builder: "month_apr",
	},
	{
		key: "may_decor",
		name: "Camp tent",
		kind: "decor",
		from: "Outdoor Month track",
		builder: "month_may",
	},
	{
		key: "jun_decor",
		name: "Surfboard",
		kind: "decor",
		from: "Summer Shred track",
		builder: "month_jun",
	},
	{
		key: "jul_decor",
		name: "Pool ring duck",
		kind: "decor",
		from: "Pool Party track",
		builder: "month_jul",
	},
	{
		key: "aug_decor",
		name: "Kettlebell trophy",
		kind: "decor",
		from: "Back to Basics track",
		builder: "month_aug",
	},
	{
		key: "sep_decor",
		name: "Apple crate",
		kind: "decor",
		from: "Harvest track",
		builder: "month_sep",
	},
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
		key: "arcade_cabinet",
		name: "Burpee arcade cabinet",
		kind: "decor",
		from: "Finishing Burpee Blitz",
		builder: "arcade",
	},
	{
		key: "sunrise_mural",
		name: "Sunrise mural",
		kind: "decor",
		from: "Finishing Sunrise Stride",
		builder: "mural",
	},
	{
		key: "herb_planter",
		name: "Herb garden planter",
		kind: "decor",
		from: "Finishing Green Machine",
		builder: "planter",
	},
	{
		key: "halloween_hat",
		name: "Witch hat for the coach",
		kind: "outfit",
		from: "Halloween track",
	},
	{
		key: "harvest_basket",
		name: "Harvest basket",
		kind: "decor",
		from: "Gratitude track",
		builder: "basket",
	},
	{
		key: "harvest_hay",
		name: "Hay bale",
		kind: "decor",
		from: "Gratitude track",
		builder: "hay",
	},
	{
		key: "gratitude_scarf",
		name: "Autumn scarf for the coach",
		kind: "outfit",
		from: "Gratitude track",
	},
	{
		key: "winter_tree",
		name: "Holiday tree",
		kind: "decor",
		from: "Winter track",
		builder: "tree",
	},
	{
		key: "winter_lights",
		name: "String lights",
		kind: "decor",
		from: "Winter track",
		builder: "lights",
	},
	{
		key: "winter_hat",
		name: "Holiday hat for the coach",
		kind: "outfit",
		from: "Winter track",
	},
]

export function cosmeticOf(key: string): CosmeticDef | null {
	return COSMETICS.find((c) => c.key === key) ?? null
}
