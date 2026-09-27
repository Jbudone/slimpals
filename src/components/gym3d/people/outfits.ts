// Outfits for the rounded toon people. Random ones come from a seeded RNG so a
// member looks the same every frame they exist; named NPCs get fixed outfits.
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
	}
}

/** Same seed -> same outfit. */
export function seededOutfit(seed: string): Outfit {
	return randOutfit(mulberry32(hashString(seed)))
}

const base = (o: Partial<Outfit>): Outfit => ({
	skin: "#e8b48e",
	hair: "#2c1f1b",
	style: "short",
	top: "#3aa89a",
	bottom: "#2c2f36",
	shoes: "#ffffff",
	sleeves: true,
	shorts: false,
	band: null,
	build: "avg",
	beard: false,
	lashes: false,
	tee: null,
	tats: [],
	acc: [],
	...o,
})

/** Fixed looks for the named NPCs, so Lisa is always Lisa. */
export const NAMED_OUTFITS: Readonly<Record<string, Outfit>> = {
	trainer_marcus: base({
		skin: "#9a633f",
		style: "buzz",
		top: "#3aa89a",
		bottom: "#1f4f4a",
		build: "strong",
		sleeves: false,
		acc: ["wristband"],
		band: "#f2c14a",
	}),
	receptionist_lisa: base({
		skin: "#f6d2b4",
		hair: "#a0643a",
		style: "pony",
		top: "#3aa89a",
		bottom: "#3a4a6a",
		lashes: true,
		band: "#e8743b",
	}),
	regular_derek: base({
		skin: "#e8b48e",
		hair: "#5a3a26",
		style: "short",
		top: "#2c2f36",
		bottom: "#5a5f6a",
		build: "strong",
		sleeves: false,
		shorts: true,
		tee: "swole",
		tats: [
			{ k: "sleeve", w: "upR" },
			{ k: "sleeve", w: "armR" },
		],
	}),
	regular_priya: base({
		skin: "#c98a5e",
		hair: "#2c1f1b",
		style: "long",
		top: "#9b6bc4",
		bottom: "#2c2f36",
		build: "fit",
		lashes: true,
		acc: ["headphones", "wristband"],
		band: "#f2c14a",
	}),
	regular_tom: base({
		skin: "#f6d2b4",
		hair: "#c9573a",
		style: "cap",
		band: "#4a78c8",
		top: "#f2c14a",
		bottom: "#3a4a6a",
		build: "soft",
		beard: true,
		shorts: true,
		tee: "avo",
	}),
	regular_elena: base({
		skin: "#e8b48e",
		hair: "#e8c46a",
		style: "bun",
		top: "#d4463a",
		bottom: "#2c2f36",
		lashes: true,
		sleeves: false,
		acc: ["socks", "wristband"],
		shorts: true,
		band: "#3aa89a",
	}),
	specialist_coach: base({
		skin: "#6e4428",
		style: "bald",
		top: "#3aa89a",
		bottom: "#1f3a5a",
		build: "fit",
		beard: true,
		acc: ["glasses"],
	}),
	specialist_nutritionist: base({
		skin: "#f6d2b4",
		hair: "#1f2a44",
		style: "long",
		top: "#ffffff",
		bottom: "#3a4a6a",
		lashes: true,
		acc: ["glasses"],
	}),
	trainer_jordan: base({
		skin: "#c98a5e",
		hair: "#2c1f1b",
		style: "curly",
		top: "#3aa89a",
		bottom: "#2c2f36",
		build: "fit",
		shorts: true,
		band: "#e8743b",
	}),
	manager_alex: base({
		skin: "#e8b48e",
		hair: "#5a3a26",
		style: "short",
		top: "#4a78c8",
		bottom: "#2c2f36",
		acc: ["glasses"],
	}),
	hero_bodybuilder_rex: base({
		skin: "#c98a5e",
		style: "bald",
		top: "#d4463a",
		bottom: "#2c2f36",
		build: "strong",
		sleeves: false,
		shorts: true,
		beard: true,
		acc: ["shades", "chain"],
		tats: [{ k: "anchor", w: "armL" }],
	}),
	hero_influencer_maya: base({
		skin: "#e8b48e",
		hair: "#e8c46a",
		style: "long",
		top: "#ff6fae",
		bottom: "#ffffff",
		build: "fit",
		lashes: true,
		sleeves: false,
		tee: "heart",
		acc: ["headphones"],
		band: "#ff6fae",
	}),
}

export function outfitFor(npcKey: string): Outfit {
	const o = NAMED_OUTFITS[npcKey]
	return o ? structuredClone(o) : seededOutfit(npcKey)
}

/** Staff uniform: teal top, plain, sleeves and long trousers. */
export function staffOutfit(seed: string): Outfit {
	const out = seededOutfit(seed)
	out.top = "#3aa89a"
	out.bottom = "#1f4f4a"
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
