// Where a campaign takes place (#188): each campaign is a different street
// with its own colours and its own rival gym and food shop signs. Campaign
// one is Pavement Street exactly as it always looked. Pure data.

export type Location = {
	name: string
	ground: string
	walk: string
	curb: string
	verge: string
	road: string
	/** The sky behind the gym (the canvas clear colour). */
	sky: number
	/** The rival gym's billboard (the weekend promo adds " 50% OFF"). */
	rivalSign: string
	/** The food shop's billboard while it is not for sale. */
	foodSign: string
}

export const LOCATIONS: readonly Location[] = [
	{
		name: "Pavement Street",
		ground: "#e0907a",
		walk: "#f0b39c",
		curb: "#e8a88f",
		verge: "#d9867a",
		road: "#5d5663",
		sky: 0xf2c9b4,
		rivalSign: "MAXOUT",
		foodSign: "BURGER BARON",
	},
	{
		name: "Campus Row",
		ground: "#a3c98f",
		walk: "#e9e2c9",
		curb: "#cfc7a6",
		verge: "#86b574",
		road: "#4f5a63",
		sky: 0xcfe9d6,
		rivalSign: "FITZONE",
		foodSign: "CAMPUS CAFE",
	},
	{
		name: "Harbour Road",
		ground: "#9bb6c7",
		walk: "#dfe6ea",
		curb: "#c3d0d8",
		verge: "#85a3b8",
		road: "#3f4a58",
		sky: 0xd3e6f2,
		rivalSign: "IRONWAVE",
		foodSign: "FISH SHACK",
	},
]

/** The location of campaign `n` (1-based; they take turns after the last). */
export function locationFor(campaign: number): Location {
	const i = Math.max(1, Math.floor(campaign)) - 1
	return LOCATIONS[i % LOCATIONS.length]
}
