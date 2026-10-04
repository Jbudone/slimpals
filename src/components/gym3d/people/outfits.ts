// Outfits for the rounded toon people. Random ones come from a seeded RNG so a
// member looks the same every frame they exist; named NPCs get fixed outfits
// from the cast (cast.ts).
import { hashString, mulberry32, type Rng } from "../engine/helpers"

export const SKIN = [
	"#f6d2b4",
	"#e8b48e",
	"#c98a5e",
	"#9a633f",
	"#6e4428",
] as const
export const HAIR = [
	"#2c1f1b",
	"#5a3a26",
	"#a0643a",
	"#e8c46a",
	"#c9573a",
	"#d8d8d8",
	"#1f2a44",
] as const
export const TOPS = [
	"#e8743b",
	"#3aa89a",
	"#d4463a",
	"#4a78c8",
	"#f2c14a",
	"#9b6bc4",
	"#ffffff",
	"#2c2f36",
	"#6fbf73",
] as const
export const BOTS = [
	"#2c2f36",
	"#3a4a6a",
	"#5a5f6a",
	"#7a4a3a",
	"#1f3a5a",
	"#d8d8d8",
] as const

export type HairStyle =
	| "short"
	| "long"
	| "bun"
	| "bald"
	| "cap"
	| "pony"
	| "curly"
	| "buzz"
	/** Two space buns (named NPCs only, not in the random pool). */
	| "buns"
export const HAIRSTYLES: readonly HairStyle[] = [
	"short",
	"long",
	"bun",
	"bald",
	"cap",
	"pony",
	"curly",
	"buzz",
]

export type Build = "avg" | "fit" | "strong" | "soft"

export type TeeKind =
	| "bolt"
	| "heart"
	| "swole"
	| "lift"
	| "smile"
	| "sunset"
	| "stripes"
	| "avo"
	| "num"
	| "gymrat"
	// named-cast prints, not in the random pool
	| "staff"
	| "titan"
	| "sparks"
export const TEES: readonly TeeKind[] = [
	"bolt",
	"heart",
	"swole",
	"lift",
	"smile",
	"sunset",
	"stripes",
	"avo",
	"num",
	"gymrat",
]

export type TatKind =
	| "band"
	| "star"
	| "heart"
	| "rose"
	| "anchor"
	| "script"
	| "sleeve"
export type TatWhere = "armL" | "armR" | "upL" | "upR" | "calfL" | "calfR"
export type Tat = { k: TatKind; w: TatWhere }
export const TAT_SETS: readonly (readonly Tat[])[] = [
	[],
	[{ k: "band", w: "armR" }],
	[
		{ k: "rose", w: "armL" },
		{ k: "star", w: "armR" },
	],
	[
		{ k: "sleeve", w: "upR" },
		{ k: "sleeve", w: "armR" },
	],
	[
		{ k: "anchor", w: "armL" },
		{ k: "heart", w: "calfR" },
	],
	[
		{ k: "script", w: "armR" },
		{ k: "band", w: "upL" },
	],
]

export type Acc =
	| "glasses"
	| "shades"
	| "chain"
	| "headphones"
	| "wristband"
	| "socks"
	// named-cast extras, not in the random pool
	| "headset"
	| "whistle"
	| "lanyard"
	| "earrings"
	// seasonal costume (October), not in the random pool
	| "witch"
export const ACC_SETS: readonly (readonly Acc[])[] = [
	[],
	["glasses"],
	["shades", "chain"],
	["headphones", "wristband"],
	["socks", "wristband"],
	["glasses", "headphones"],
]

export type Outfit = {
	skin: string
	hair: string
	style: HairStyle
	top: string
	bottom: string
	shoes: string
	sleeves: boolean
	shorts: boolean
	band: string | null
	build: Build
	beard: boolean
	lashes: boolean
	tee: TeeKind | null
	tats: Tat[]
	acc: Acc[]
	freckles: boolean
}

function pickR<X>(a: readonly X[], rng: Rng): X {
	return a[Math.floor(rng() * a.length)]
}

export function randOutfit(rng: Rng): Outfit {
	return {
		skin: pickR(SKIN, rng),
		hair: pickR(HAIR, rng),
		style: pickR(HAIRSTYLES, rng),
		top: pickR(TOPS, rng),
		bottom: pickR(BOTS, rng),
		shoes: pickR(["#ffffff", "#2c2f36", "#e8743b", "#3aa89a"], rng),
		sleeves: rng() < 0.5,
		shorts: rng() < 0.5,
		band: rng() < 0.25 ? pickR(["#d4463a", "#3aa89a", "#f2c14a"], rng) : null,
		build: pickR(["avg", "avg", "fit", "strong", "soft"] as const, rng),
		beard: rng() < 0.2,
		lashes: rng() < 0.45,
		tee: rng() < 0.55 ? pickR(TEES, rng) : null,
		tats: rng() < 0.4 ? [...pickR(TAT_SETS.slice(1), rng)] : [],
		acc: rng() < 0.45 ? [...pickR(ACC_SETS.slice(1), rng)] : [],
		freckles: false,
	}
}

/** Same seed -> same outfit. */
export function seededOutfit(seed: string): Outfit {
	return randOutfit(mulberry32(hashString(seed)))
}

/** The staff uniform colours (anonymous staff and every named staff member). */
export const STAFF_UNIFORM = { top: "#2f9e8f", bottom: "#1f4f4a" } as const

/** Staff uniform: teal top, plain, sleeves and long trousers. */
export function staffOutfit(seed: string): Outfit {
	const out = seededOutfit(seed)
	out.top = STAFF_UNIFORM.top
	out.bottom = STAFF_UNIFORM.bottom
	out.tee = null
	out.tats = []
	out.acc = []
	out.sleeves = true
	out.shorts = false
	out.shoes = "#ffffff"
	out.band = null
	return out
}

/** Swimwear: matching suit and cap. */
export function swimOutfit(seed: string): Outfit {
	const rng = mulberry32(hashString(seed))
	const out = randOutfit(rng)
	out.top = pickR(["#d4463a", "#1f3a5a", "#9b6bc4"], rng)
	out.bottom = out.top
	out.sleeves = false
	out.shorts = true
	out.tee = null
	out.acc = []
	out.style = "cap"
	out.band = out.top
	return out
}
